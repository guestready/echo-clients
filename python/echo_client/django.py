"""Django endpoints for the @guestready/echo-feedback widget: the browser talks to them, they talk to Echo.

Settings: ECHO_API_URL, ECHO_CLIENT_ID, ECHO_CLIENT_SECRET.

    path("echo/", include(feedback_urls(get_reporter=lambda request: {...})))
"""

import json
from collections.abc import Callable, Mapping
from functools import cache, wraps
from typing import Any

import requests
from django.conf import settings
from django.core.cache import cache as django_cache
from django.http import HttpRequest, JsonResponse
from django.urls import URLPattern, path
from django.views.decorators.http import require_POST

from echo_client.client import EchoClient, EchoError

TICKET_FIELDS = ("type", "body", "page_title", "page_url")
UPLOAD_FIELDS = ("upload_id", "kind", "method", "url", "headers", "expires_in")
MAX_ATTACHMENTS = 10
MAX_CONTEXT_BYTES = 4096
UNREACHABLE = "Echo is unreachable, please try again in a moment."

ReporterGetter = Callable[[HttpRequest], Mapping[str, object] | None]
ContextGetter = Callable[[HttpRequest], dict[str, Any]]


class DjangoCacheTokenStore:
    def get(self, key: str) -> str | None:
        return django_cache.get(key)

    def set(self, key: str, token: str, ttl: int) -> None:
        django_cache.set(key, token, ttl)

    def delete(self, key: str) -> None:
        django_cache.delete(key)


@cache
def default_client() -> EchoClient:
    return EchoClient(
        getattr(settings, "ECHO_API_URL", ""),
        getattr(settings, "ECHO_CLIENT_ID", ""),
        getattr(settings, "ECHO_CLIENT_SECRET", ""),
        token_store=DjangoCacheTokenStore(),
    )


def _error(message: str, status: int) -> JsonResponse:
    return JsonResponse({"detail": message}, status=status)


def feedback_urls(
    get_reporter: ReporterGetter,
    *,
    get_context: ContextGetter | None = None,
    get_client: Callable[[], EchoClient] = default_client,
    allow_anonymous: bool = False,
) -> list[URLPattern]:
    """`get_reporter` builds the reporter from the session, so a browser can never report as someone else."""

    def echo_view(view: Callable[[HttpRequest, dict[str, Any]], JsonResponse]) -> Callable[..., JsonResponse]:
        @require_POST
        @wraps(view)
        def wrapper(request: HttpRequest) -> JsonResponse:
            if not (allow_anonymous or request.user.is_authenticated):
                return _error("Sign in to send feedback.", 403)
            try:
                data = json.loads(request.body or b"{}")
            except ValueError:
                return _error("Send a JSON body.", 400)
            if not isinstance(data, dict):
                return _error("Send a JSON object.", 400)
            try:
                return view(request, data)
            except EchoError as error:
                if error.status >= 500 or error.status in (401, 403):
                    return _error(UNREACHABLE, 502)
                payload = error.payload if isinstance(error.payload, dict) else {"detail": str(error.payload)}
                return JsonResponse(payload, status=error.status)
            except requests.RequestException:
                return _error(UNREACHABLE, 502)

        return wrapper

    @echo_view
    def create_upload(request: HttpRequest, data: dict[str, Any]) -> JsonResponse:
        try:
            filename, content_type, size = str(data["filename"]), str(data["content_type"]), int(data["size"])
        except (KeyError, TypeError, ValueError):
            return _error("Send filename, content_type and size.", 400)
        upload = get_client().create_upload(filename, content_type, size)
        return JsonResponse({key: upload[key] for key in UPLOAD_FIELDS}, status=201)

    @echo_view
    def create_ticket(request: HttpRequest, data: dict[str, Any]) -> JsonResponse:
        attachments = data.get("attachments") or []
        if not isinstance(attachments, list) or len(attachments) > MAX_ATTACHMENTS:
            return _error(f"Attach at most {MAX_ATTACHMENTS} files.", 400)
        context = data.get("context") or {}
        if not isinstance(context, dict) or len(json.dumps(context)) > MAX_CONTEXT_BYTES:
            return _error("context must be a small JSON object.", 400)
        payload: dict[str, Any] = {key: str(data.get(key) or "") for key in TICKET_FIELDS}
        payload["attachments"] = [str(item) for item in attachments]
        payload["context"] = {**context, **(get_context(request) if get_context else {})}
        reporter = get_reporter(request)
        if reporter:
            payload["reporter"] = dict(reporter)
        # Echo dedupes per source: scope the browser's key to its reporter so users never share one.
        key = request.headers.get("Idempotency-Key", "")
        owner = str(reporter["external_id"]) if reporter else "anonymous"
        ticket = get_client().create_ticket(payload, f"{owner}:{key}"[:255] if key else "")
        return JsonResponse({key: ticket[key] for key in ("ref", "type", "status")}, status=201)

    return [
        path("uploads", create_upload, name="echo-feedback-uploads"),
        path("tickets", create_ticket, name="echo-feedback-tickets"),
    ]
