import json
from typing import Any

import pytest
from django.contrib.auth.models import AnonymousUser
from django.test import RequestFactory
from echo_client import EchoClient
from echo_client.django import feedback_urls

BASE = "https://echo.test"
REPORTER = {"external_id": "u-1", "name": "Ana Moreira", "email": "ana@example.com"}


class SignedIn:
    is_authenticated = True


@pytest.fixture
def views(responses: Any) -> dict[str, Any]:
    responses.post(f"{BASE}/oauth/token/", json={"access_token": "t", "expires_in": 3600})
    client = EchoClient(BASE, "id", "secret")
    patterns = feedback_urls(
        get_reporter=lambda request: REPORTER,
        get_context=lambda request: {"app": "rentalready", "account": "forced"},
        get_client=lambda: client,
    )
    return {str(pattern.name): pattern.callback for pattern in patterns}


def _post(body: Any, user: Any = None, **headers: str) -> Any:
    request = RequestFactory().post(
        "/", data=json.dumps(body), content_type="application/json", headers=headers
    )
    request.user = user or SignedIn()  # type: ignore[assignment]
    request._dont_enforce_csrf_checks = True  # type: ignore[attr-defined]
    return request


def test_ticket_uses_the_session_reporter(views: dict[str, Any], responses: Any) -> None:
    responses.post(f"{BASE}/api/v1/tickets", status=201, json={"ref": "B-7", "type": "bug", "status": "new"})
    body = {
        "type": "bug",
        "body": "Calendar flickers",
        "page_url": "https://app.test/calendar",
        "attachments": ["u1"],
        "reporter": {"external_id": "someone-else"},
        "context": {"viewport": "1440x900", "account": "spoofed"},
    }
    response = views["echo-feedback-tickets"](_post(body, **{"Idempotency-Key": "k1"}))
    assert response.status_code == 201
    assert json.loads(response.content) == {"ref": "B-7", "type": "bug", "status": "new"}
    sent = json.loads(responses.calls[-1].request.body)
    assert sent["reporter"] == REPORTER
    assert sent["attachments"] == ["u1"]
    assert sent["context"] == {"viewport": "1440x900", "account": "forced", "app": "rentalready"}
    assert responses.calls[-1].request.headers["Idempotency-Key"] == "u-1:k1"


def test_anonymous_users_are_refused(views: dict[str, Any], responses: Any) -> None:
    for name in ("echo-feedback-tickets", "echo-feedback-uploads"):
        response = views[name](_post({"type": "bug", "body": "x"}, user=AnonymousUser()))
        assert response.status_code == 403
    assert not responses.calls


def test_upload_returns_only_the_presigned_fields(views: dict[str, Any], responses: Any) -> None:
    responses.post(
        f"{BASE}/api/v1/uploads",
        status=201,
        json={
            "upload_id": "u1",
            "kind": "image",
            "method": "PUT",
            "url": "https://s3.test/x",
            "headers": {"Content-Type": "image/png"},
            "expires_in": 900,
            "extra": "dropped",
        },
    )
    response = views["echo-feedback-uploads"](
        _post({"filename": "s.png", "content_type": "image/png", "size": 10})
    )
    assert response.status_code == 201
    assert "extra" not in json.loads(response.content)
    bad = views["echo-feedback-uploads"](_post({"filename": "s.png"}))
    assert bad.status_code == 400


def test_echo_validation_errors_pass_through_and_outages_answer_502(
    views: dict[str, Any], responses: Any
) -> None:
    responses.post(f"{BASE}/api/v1/tickets", status=400, json={"body": ["This field may not be blank."]})
    response = views["echo-feedback-tickets"](_post({"type": "bug", "body": ""}))
    assert response.status_code == 400
    assert json.loads(response.content) == {"body": ["This field may not be blank."]}
    responses.post(f"{BASE}/api/v1/tickets", status=403, json={"detail": "Inactive source."})
    assert views["echo-feedback-tickets"](_post({"type": "bug", "body": "x"})).status_code == 502


def test_rejects_oversized_input(views: dict[str, Any]) -> None:
    ticket = views["echo-feedback-tickets"]
    assert ticket(_post({"type": "bug", "body": "x", "attachments": ["a"] * 11})).status_code == 400
    assert ticket(_post({"type": "bug", "body": "x", "context": {"x": "y" * 5000}})).status_code == 400
    assert ticket(_post(["not", "an", "object"])).status_code == 400
