"""Best-effort client for NSE India's unofficial shareholding-pattern
JSON endpoint.

**Status: implemented defensively, NOT verified against the live site.**
This sandbox's network egress is restricted to package registries
(pypi/npm/github) and cannot reach nseindia.com, so nothing in this file
has actually been exercised against a real response. Before relying on
this in production:

    python -c "from ingest.nse_client import fetch_shareholding_pattern; \
               print(fetch_shareholding_pattern('RELIANCE'))"

and confirm the returned dict has sane percentages that sum to ~100.
If NSE has changed its endpoint path, response JSON shape, or anti-bot
requirements since this was written, this will most likely raise (a
connection error, a non-200 status, or a KeyError from
`_parse_response`) rather than silently returning wrong numbers — every
parse step below is defensive (`.get(...)`, explicit type coercion) for
exactly that reason. `ingest/fetch_shareholding.py` catches any
exception from this module and falls back to the yfinance
approximation, so a broken NSE integration degrades the data quality
for that run rather than crashing it.

## Why a session bootstrap

NSE's unofficial API endpoints reject requests that don't look like
they came from a browser that first loaded nseindia.com (this is the
same well-known pattern several open-source NSE scraping libraries
document, not a novel discovery here): a plain `requests.get(api_url)`
with no prior page load and no browser-like headers typically gets a
403. The standard workaround: open a `requests.Session`, GET the
homepage first (which sets cookies), then GET the API endpoint with the
usual browser headers.

## Why this endpoint specifically

`/api/corporate-share-holdings-master` is NSE's shareholding-pattern
JSON endpoint as documented by community NSE-scraping projects at the
time this was written. NSE has changed unofficial endpoint paths before
without notice; if this 404s, check whether the path has moved before
assuming the whole approach is broken.
"""
from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Optional

import requests

logger = logging.getLogger("ingest.nse_client")

_BASE_URL = "https://www.nseindia.com"
_SHAREHOLDING_ENDPOINT = "/api/corporate-share-holdings-master"

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nseindia.com/get-quotes/equity",
}

_REQUEST_TIMEOUT_SECONDS = 10


def _bootstrap_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(_HEADERS)
    # Prime cookies by loading a normal page first — see module docstring.
    resp = session.get(_BASE_URL, timeout=_REQUEST_TIMEOUT_SECONDS)
    resp.raise_for_status()
    return session


def _to_pct(v) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        return round(float(v), 4)
    except (TypeError, ValueError):
        return None


def _parse_period_end(raw) -> date:
    if not raw:
        return date.today()
    for fmt in ("%d-%b-%Y", "%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(str(raw), fmt).date()
        except ValueError:
            continue
    return date.today()


def _parse_response(payload: dict) -> Optional[dict]:
    """NSE's own category names (as documented by the community
    scraping projects this was modeled on): 'Promoter & Promoter Group',
    'Foreign Portfolio Investors' (FII/FPI), 'Mutual Funds', a broader
    'Financial Institutions/Banks' + 'Insurance Companies' set that this
    maps to DII, 'Central Government/ State Government(s)' for
    Government, 'Public' for Public, and a residual 'Any Other' for
    Others. If NSE's real field names differ from what's guessed here,
    every `.get(...)` below returns None rather than raising or
    guessing — a partially-None row is still honest; a wrong number is
    not."""
    rows = payload.get("data") if isinstance(payload, dict) else None
    if not rows:
        return None
    latest = rows[0]

    def g(*keys):
        for k in keys:
            if k in latest and latest[k] not in (None, ""):
                return latest[k]
        return None

    return {
        "promoter_pct": _to_pct(g("promoter", "Promoter & Promoter Group")),
        "fii_pct": _to_pct(g("fii", "Foreign Portfolio Investors")),
        "dii_pct": _to_pct(g("dii", "Financial Institutions/Banks")),
        "mutual_funds_pct": _to_pct(g("mutualFunds", "Mutual Funds")),
        "public_pct": _to_pct(g("public", "Public")),
        "government_pct": _to_pct(g("government", "Central Government/ State Government(s)")),
        "others_pct": _to_pct(g("others", "Any Other")),
        "pledge_pct": _to_pct(g("pledge", "Pledged/Encumbered")),
        "period_end": _parse_period_end(g("date", "asOnDate", "quarterEnded")),
    }


def fetch_shareholding_pattern(symbol: str) -> Optional[dict]:
    """Returns a dict of category -> percent (see `_parse_response`), or
    None if NSE returned no usable data. Raises on network/HTTP failure
    — the caller (ingest/fetch_shareholding.py) is responsible for
    catching and falling back, deliberately not swallowed here so a
    genuine outage/breaking-change is visible in logs."""
    session = _bootstrap_session()
    resp = session.get(
        f"{_BASE_URL}{_SHAREHOLDING_ENDPOINT}",
        params={"index": "equities", "symbol": symbol.upper()},
        timeout=_REQUEST_TIMEOUT_SECONDS,
    )
    resp.raise_for_status()
    return _parse_response(resp.json())
