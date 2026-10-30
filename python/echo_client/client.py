"""Echo API over OAuth2 client_credentials. Server side only: the client secret must never reach a browser."""

import threading
import time
from typing import Any, NotRequired, Protocol, TypedDict

import requests

TOKEN_EXPIRY_MARGIN = 60


class Account(TypedDict):
    external_id: str
    name: str
    active_count: NotRequired[int]


class Reporter(TypedDict):
    external_id: str
    name: NotRequired[str]
    email: NotRequired[str]
    account: NotRequired[Account]


class TokenStore(Protocol):
    def get(self, key: str) -> str | None: ...
    def set(self, key: str, token: str, ttl: int) -> None: ...
    def delete(self, key: str) -> None: ...


class MemoryTokenStore:
    def __init__(self) -> None:
        self._tokens: dict[str, tuple[str, float]] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> str | None:
        with self._lock:
            token, expires_at = self._tokens.get(key, ("", 0.0))
            return token if expires_at > time.monotonic() else None

    def set(self, key: str, token: str, ttl: int) -> None:
        with self._lock:
            self._tokens[key] = (token, time.monotonic() + ttl)

    def delete(self, key: str) -> None:
        with self._lock:
            self._tokens.pop(key, None)


class EchoError(Exception):
    def __init__(self, status: int, payload: Any) -> None:
        super().__init__(f"Echo API answered {status}: {payload}")
        self.status = status
        self.payload = payload


class EchoClient:
    def __init__(
        self,
        base_url: str,
        client_id: str,
        client_secret: str,
        *,
        token_store: TokenStore | None = None,
        timeout: float = 15,
        session: requests.Session | None = None,
    ) -> None:
        if not client_id or not client_secret:
            raise ValueError("Echo client_id and client_secret are required.")
        self.base_url = base_url.rstrip("/")
        self._auth = (client_id, client_secret)
        self._store = token_store or MemoryTokenStore()
        self._key = f"echo-client:token:{client_id}"
        self.timeout = timeout
        self.session = session or requests.Session()

    def token(self) -> str:
        cached = self._store.get(self._key)
        if cached:
            return cached
        response = self.session.post(
            f"{self.base_url}/oauth/token/",
            data={"grant_type": "client_credentials"},
            auth=self._auth,
            timeout=self.timeout,
        )
        payload = _json(response)
        if response.status_code != 200:
            raise EchoError(response.status_code, payload)
        token = str(payload["access_token"])
        self._store.set(self._key, token, max(int(payload.get("expires_in", 3600)) - TOKEN_EXPIRY_MARGIN, 1))
        return token

    def request(self, method: str, path: str, *, headers: dict[str, str] | None = None, **kwargs: Any) -> Any:
        for attempt in range(2):
            response = self.session.request(
                method,
                f"{self.base_url}/api/v1/{path.lstrip('/')}",
                headers={**(headers or {}), "Authorization": f"Bearer {self.token()}"},
                timeout=self.timeout,
                **kwargs,
            )
            if response.status_code == 401 and attempt == 0:
                self._store.delete(self._key)
                continue
            break
        if response.status_code >= 400:
            raise EchoError(response.status_code, _json(response))
        return _json(response) if response.content else None

    def create_upload(self, filename: str, content_type: str, size: int) -> dict[str, Any]:
        return self.request(
            "POST", "uploads", json={"filename": filename, "content_type": content_type, "size": size}
        )

    def create_ticket(self, payload: dict[str, Any], idempotency_key: str = "") -> dict[str, Any]:
        headers = {"Idempotency-Key": idempotency_key} if idempotency_key else {}
        return self.request("POST", "tickets", json=payload, headers=headers)

    def get_ticket(self, ref: str) -> dict[str, Any]:
        return self.request("GET", f"tickets/{ref}")

    def list_features(
        self, reporter_external_id: str = "", limit: int = 50, offset: int = 0
    ) -> dict[str, Any]:
        """Paginated: {"count", "next", "previous", "results"}."""
        params: dict[str, Any] = {"limit": limit, "offset": offset}
        if reporter_external_id:
            params["reporter_external_id"] = reporter_external_id
        return self.request("GET", "features", params=params)

    def vote(self, feature_id: int, reporter: Reporter) -> dict[str, Any]:
        return self.request("POST", f"features/{feature_id}/votes", json={"reporter": reporter})

    def unvote(self, feature_id: int, reporter_external_id: str) -> None:
        self.request(
            "DELETE", f"features/{feature_id}/votes", params={"reporter_external_id": reporter_external_id}
        )


def _json(response: requests.Response) -> Any:
    try:
        return response.json()
    except ValueError:
        return {"detail": response.text[:300]}
