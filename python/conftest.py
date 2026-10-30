from typing import Any

import django
import pytest
import responses as responses_lib
from django.conf import settings

settings.configure(
    SECRET_KEY="echo-client-tests",
    INSTALLED_APPS=["django.contrib.contenttypes", "django.contrib.auth"],
    CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}},
    USE_TZ=True,
)
django.setup()


@pytest.fixture
def responses() -> Any:
    with responses_lib.RequestsMock(assert_all_requests_are_fired=False) as mock:
        yield mock
