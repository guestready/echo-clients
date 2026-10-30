from typing import Any

import pytest
from echo_client import EchoClient, EchoError

BASE = "https://echo.test"


def _token(responses: Any) -> None:
    responses.post(f"{BASE}/oauth/token/", json={"access_token": "t1", "expires_in": 3600})


def test_token_is_cached_and_refreshed_on_401(responses: Any) -> None:
    _token(responses)
    responses.get(f"{BASE}/api/v1/tickets/B-1", status=401, json={"detail": "expired"})
    responses.get(f"{BASE}/api/v1/tickets/B-1", json={"ref": "B-1"})
    client = EchoClient(BASE, "id", "secret")
    assert client.get_ticket("B-1") == {"ref": "B-1"}
    assert client.get_ticket("B-1") == {"ref": "B-1"}
    token_calls = [call for call in responses.calls if call.request.url.endswith("/oauth/token/")]
    assert len(token_calls) == 2
    assert responses.calls[-1].request.headers["Authorization"] == "Bearer t1"


def test_errors_carry_status_and_payload(responses: Any) -> None:
    _token(responses)
    responses.post(f"{BASE}/api/v1/tickets", status=400, json={"body": ["This field is required."]})
    with pytest.raises(EchoError) as raised:
        EchoClient(BASE, "id", "secret").create_ticket({"type": "bug"}, "key-1")
    assert raised.value.status == 400
    assert raised.value.payload == {"body": ["This field is required."]}
    assert responses.calls[-1].request.headers["Idempotency-Key"] == "key-1"


def test_bad_credentials_raise(responses: Any) -> None:
    responses.post(f"{BASE}/oauth/token/", status=401, json={"error": "invalid_client"})
    with pytest.raises(EchoError) as raised:
        EchoClient(BASE, "id", "wrong").list_features()
    assert raised.value.status == 401


def test_requires_credentials() -> None:
    with pytest.raises(ValueError):
        EchoClient(BASE, "", "")
