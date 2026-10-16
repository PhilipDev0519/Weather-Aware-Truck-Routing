from __future__ import annotations

import logging
import random
import time
from urllib.parse import urlsplit

import requests
from django.conf import settings
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)

RETRIES = 2
BACKOFF_S = 1.5
# Open-Meteo's free tier counts every location, about 600 a minute. A long trip
# at 10-mile spacing needs more than that, so wait for the next minute instead
# of failing the plan.
RATE_LIMIT_WAITS_S = (12, 24, 30)
MAX_RETRY_AFTER_S = 30
SERVER_BUSY_STATUSES = frozenset({500, 502, 503, 504})
BUSY_RETRIES = 4

# One pooled session for every outside call. Reusing connections skips a TCP
# and TLS handshake per request, which adds up fast (a plan makes ~60 calls).
# Connection resets (e.g. a pooled connection the server already closed) are
# retried at this level, so a flaky network doesn't fail a plan or a map tile.
session = requests.Session()
session.headers["User-Agent"] = settings.ROUTING["USER_AGENT"]
_retry = Retry(
    total=3,
    connect=3,
    read=2,
    status=0,
    backoff_factor=0.3,
    allowed_methods=frozenset({"GET"}),
    raise_on_status=False,
)
_adapter = HTTPAdapter(pool_connections=8, pool_maxsize=32, max_retries=_retry)
session.mount("https://", _adapter)
session.mount("http://", _adapter)


class ProviderError(Exception):
    """An outside API (routing, weather, geocoding) failed."""


def _rate_limit_reason(response: requests.Response) -> str:
    try:
        data = response.json()
    except ValueError:
        return ""
    if not isinstance(data, dict):
        return ""
    error = data.get("error")
    # Open-Meteo: {"reason": "..."}; openrouteservice: {"error": "..."} or {"error": {"message": "..."}}
    message = data.get("reason") or (error.get("message") if isinstance(error, dict) else error)
    return str(message or "")


def _retry_after_s(response: requests.Response) -> float | None:
    try:
        return float(response.headers["Retry-After"])
    except (KeyError, ValueError):
        return None


def http_get(url: str, params: dict | None = None, wait_for_rate_limit: bool = False) -> requests.Response:
    return http_request("GET", url, params=params, wait_for_rate_limit=wait_for_rate_limit)


def http_request(
    method: str,
    url: str,
    *,
    params: dict | None = None,
    json: dict | None = None,
    headers: dict | None = None,
    wait_for_rate_limit: bool = False,
) -> requests.Response:
    """A request that retries on network errors, busy servers and 429s.

    With wait_for_rate_limit, a per-minute limit is waited out (up to about a
    minute) instead of failing straight away. Only use it for requests that
    are safe to repeat.
    """
    host = urlsplit(url).netloc
    waits = RATE_LIMIT_WAITS_S if wait_for_rate_limit else tuple(BACKOFF_S * (i + 1) for i in range(RETRIES))
    failures = busy = limited = 0
    while True:
        try:
            response = session.request(
                method, url, params=params, json=json, headers=headers, timeout=settings.ROUTING["HTTP_TIMEOUT_S"]
            )
        except requests.RequestException as exc:
            failures += 1
            if failures > RETRIES:
                raise ProviderError(f"Could not reach {host} ({exc.__class__.__name__}).") from exc
            time.sleep(BACKOFF_S * failures)
            continue
        if response.status_code in SERVER_BUSY_STATUSES and busy < BUSY_RETRIES:
            # "The service is overloaded" and friends usually pass in a second or two.
            busy += 1
            logger.info("%s answered %s, retrying", host, response.status_code)
            time.sleep(BACKOFF_S * busy + random.random())
            continue
        if response.status_code != 429:
            return response

        reason = _rate_limit_reason(response)
        if "concurrent" in reason.lower() and busy < BUSY_RETRIES:
            # Too many requests in flight at once, not too many per minute.
            busy += 1
            time.sleep(BACKOFF_S * busy + random.random())
            continue
        # Waiting a minute won't help with an hourly or daily quota.
        long_quota = any(word in reason.lower() for word in ("hourly", "daily", "monthly"))
        long_quota |= response.headers.get("X-Ratelimit-Remaining") == "0"
        if long_quota or limited >= len(waits):
            raise ProviderError(f"{host} is rate limiting requests: {reason or 'try again in a minute.'}")
        wait = waits[limited]
        limited += 1
        retry_after = _retry_after_s(response)
        if retry_after is not None:
            wait = min(max(wait, retry_after), MAX_RETRY_AFTER_S)
        logger.info("%s rate limited (%s), retrying in %.0f s", host, reason or "429", wait)
        time.sleep(wait)
