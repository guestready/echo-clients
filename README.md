# echo-clients

Client packages for Echo, GuestReady's internal feedback ticketing service.

- `python/` - **echo-client**: server-side client for the Echo API, with optional Django views that proxy the widget's requests.
- `js/` - **@guestready/echo-feedback**: in-page feedback dialog (type, message, screenshot, attachments) that talks to your own backend.

The browser never holds Echo credentials: the widget posts to your backend, `echo-client` calls Echo with OAuth2 client credentials and sets the reporter from your session. Only file bytes go straight to S3 through presigned URLs.

## Install

Python 3.11+:

```bash
pip install "echo-client[django] @ git+https://github.com/guestready/echo-clients@v0.1.1#subdirectory=python"
```

JavaScript (`package.json`):

```json
"@guestready/echo-feedback": "https://github.com/guestready/echo-clients/releases/download/v0.1.1/guestready-echo-feedback-0.1.1.tgz"
```

Each release also has `echo-feedback.iife.js`, a self-contained bundle exposing the global `EchoFeedback`.

## Django

Settings for the default client, server side only (never expose them to the browser):

- `ECHO_API_URL` - base URL of the Echo instance
- `ECHO_CLIENT_ID` / `ECHO_CLIENT_SECRET` - the OAuth client of your Echo source

```python
from echo_client.django import feedback_urls


def reporter(request):
    user = request.user
    return {"external_id": str(user.pk), "name": user.get_full_name(), "email": user.email}


urlpatterns += [path("echo/", include(feedback_urls(get_reporter=reporter)))]
```

This adds two CSRF-protected POST views, `uploads` and `tickets` (URL names `echo-feedback-uploads` / `echo-feedback-tickets`), for signed-in users only unless `allow_anonymous=True`. The reporter always comes from `get_reporter(request)`; `get_context(request)` can add or override context fields. Outside Django, use `EchoClient(base_url, client_id, client_secret)` directly (`create_upload`, `create_ticket`, `get_ticket`, `list_features`, `vote`, `unvote`).

## Widget

```ts
import { createFeedback } from "@guestready/echo-feedback";

const feedback = createFeedback({
  endpoints: { uploads: "/echo/uploads", tickets: "/echo/tickets" },
  headers: () => ({ "X-CSRFToken": getCookie("csrftoken") }),
  screenshot: { mask: "[data-echo-private]" },
  context: () => ({ app_version: APP_VERSION }),
});
button.onclick = () => feedback.open(); // or feedback.open("bug")
```

The dialog renders in a shadow root. The screenshot is taken from a DOM clone when the dialog opens; password inputs and elements matching `screenshot.mask` are painted over (`screenshot: false` turns it off). Other options: `labels` (any text, for translations), `onSubmitted(ticket)`, `maxFiles` (default 5).

## Development

```bash
cd js && npm ci && npm run typecheck && npm test && npm run build
cd python && pip install -e '.[django,test]' && pytest
```

## Releasing

1. Bump the version in both `js/package.json` (and `js/package-lock.json`) and `python/pyproject.toml`.
2. Merge to `main`, then tag that commit `vX.Y.Z` and push the tag.

The `Release` workflow checks the tag is on `main` and matches both versions, runs the JS checks, and creates the GitHub Release with `guestready-echo-feedback-X.Y.Z.tgz` and `echo-feedback.iife.js` attached.
