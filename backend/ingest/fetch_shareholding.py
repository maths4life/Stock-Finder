"""Shareholding Pattern ingestion (Module 7.5).

Populates `shareholding_pattern`'s full 7-category breakdown: Promoter,
FII/FPI, DII, Mutual Funds, Public, Government, Others.

## Data source priority — and why the free options fall short

**NSE's own disclosure** (`ingest/nse_client.py`) is the *only* free
source that actually reports this exact 7-category split — it's what
"Shareholding Pattern" means on NSE's own site. It is tried first, per
the brief's stated source priority. It is also the most fragile:

  - NSE's unofficial JSON endpoints require a browser-like session
    (cookies from an initial page load, specific headers) and
    aggressively rate-limit or block requests that look automated; the
    exact endpoint path and response shape have changed before without
    notice and are not officially documented or supported.
  - **This sandbox cannot reach nseindia.com at all** (network egress
    here is restricted to package registries — see the network
    configuration this project was built under), so the NSE path below
    is implemented defensively (session bootstrap, browser-like
    headers, a short retry) but has NOT been exercised against the live
    site. Treat it as a documented starting point, not a verified
    integration — run `python -m ingest.fetch_shareholding --limit 3`
    from an environment with real internet access and inspect the
    output/logs before trusting it in production. If NSE's response
    shape has changed, `nse_client.fetch_shareholding_pattern` will
    raise and the pipeline will fall back to yfinance-approx
    automatically (see below) rather than crash the whole run.

**yfinance fallback** (`source = 'yfinance_approx'`) — reuses the same
approximation `ingest/fetch_fundamentals.py` already writes:
`heldPercentInsiders` as a Promoter proxy, `heldPercentInstitutions` as
a combined DII+FII+MF proxy. This is NOT a real NSE promoter/FII/DII
split (see that script's docstring for the full caveat) — Mutual Funds,
Government, and Others are written as NULL here, never guessed, because
yfinance has no field that maps to any of them individually. `fii_pct`
is also left NULL for the same reason — `heldPercentInstitutions` is
one combined number, and splitting it into FII vs DII vs MF without a
real source would be fabrication.

Whichever source succeeds for a given company, the written row is
tagged with an honest `source` value ('nse' or 'yfinance_approx') so
nothing downstream — or anyone reading the database directly — mistakes
an approximation for a real disclosure.

Usage:
    python -m ingest.fetch_shareholding
    python -m ingest.fetch_shareholding --limit 10
    python -m ingest.fetch_shareholding --dry-run
    python -m ingest.fetch_shareholding --skip-nse    # go straight to yfinance-approx
"""
import argparse
import logging
from datetime import date

from sqlalchemy import text

from ingest.db import get_engine
from ingest.fiscal import fiscal_quarter_label
from ingest.resilience import ConcurrentRunner

logger = logging.getLogger("ingest.fetch_shareholding")


def _normalize_pct(v):
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if f != f:  # NaN
        return None
    return round(f * 100, 4) if abs(f) < 1 else round(f, 4)


def _from_nse(symbol: str) -> dict | None:
    """Best-effort NSE fetch. Returns None (never raises past this
    point) on any failure so the caller can fall back cleanly — see
    module docstring for why this path is unverified in this sandbox."""
    try:
        from ingest.nse_client import fetch_shareholding_pattern

        data = fetch_shareholding_pattern(symbol)
        if not data:
            return None
        return {
            "promoter_pct": data.get("promoter_pct"),
            "fii_pct": data.get("fii_pct"),
            "dii_pct": data.get("dii_pct"),
            "mutual_funds_pct": data.get("mutual_funds_pct"),
            "public_pct": data.get("public_pct"),
            "government_pct": data.get("government_pct"),
            "others_pct": data.get("others_pct"),
            "pledge_pct": data.get("pledge_pct"),
            "period_end": data.get("period_end"),
            "source": "nse",
        }
    except Exception as exc:
        logger.debug("[%s] NSE fetch failed, falling back: %s", symbol, exc)
        return None


def _from_yfinance(symbol: str, yahoo_ticker: str, info: dict | None = None) -> dict | None:
    """`info` can be passed in when the caller (e.g.
    ingest/fetch_fundamentals.py, which already fetched the same
    Ticker.info for its own ratios) already has it, to avoid a second,
    redundant network round-trip for the same ticker in the same run."""
    if info is None:
        import yfinance as yf

        info = yf.Ticker(yahoo_ticker).info or {}
    insiders = _normalize_pct(info.get("heldPercentInsiders"))
    institutions = _normalize_pct(info.get("heldPercentInstitutions"))
    if insiders is None and institutions is None:
        return None

    promoter = insiders
    dii = institutions
    known = [v for v in (promoter, dii) if v is not None]
    public = max(0.0, round(100.0 - sum(known), 4)) if known else None

    return {
        "promoter_pct": promoter,
        "fii_pct": None,
        "dii_pct": dii,
        "mutual_funds_pct": None,
        "public_pct": public,
        "government_pct": None,
        "others_pct": None,
        "pledge_pct": None,
        "period_end": date.today(),
        "source": "yfinance_approx",
    }


UPSERT_SHAREHOLDING = text(
    """
    insert into shareholding_pattern (
        symbol, quarter, period_end, promoter_pct, fii_pct, dii_pct,
        mutual_funds_pct, public_pct, government_pct, others_pct,
        pledge_pct, source
    ) values (
        :symbol, :quarter, :period_end, :promoter_pct, :fii_pct, :dii_pct,
        :mutual_funds_pct, :public_pct, :government_pct, :others_pct,
        :pledge_pct, :source
    )
    on conflict (symbol, quarter) do update set
        period_end = excluded.period_end,
        promoter_pct = excluded.promoter_pct,
        fii_pct = excluded.fii_pct,
        dii_pct = excluded.dii_pct,
        mutual_funds_pct = excluded.mutual_funds_pct,
        public_pct = excluded.public_pct,
        government_pct = excluded.government_pct,
        others_pct = excluded.others_pct,
        pledge_pct = excluded.pledge_pct,
        source = excluded.source,
        updated_at = now()
    """
)


def _fetch_one(company: dict, skip_nse: bool) -> dict:
    symbol, ticker = company["symbol"], company["yahoo_ticker"]
    result = None if skip_nse else _from_nse(symbol)
    if result is None:
        result = _from_yfinance(symbol, ticker)
    if result is None:
        raise ValueError(f"no shareholding data available for {symbol} from any source")
    period_end = result["period_end"]
    result["symbol"] = symbol
    result["quarter"] = fiscal_quarter_label(period_end)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-nse", action="store_true", help="Go straight to the yfinance-approx fallback")
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    from ingest.universe import UNIVERSE

    companies = UNIVERSE[: args.limit] if args.limit else UNIVERSE
    engine = None if args.dry_run else get_engine()
    runner = ConcurrentRunner(max_workers=args.workers, delay_seconds=1.5)

    n_nse = 0
    n_yf = 0

    def handle_result(company, result, error):
        nonlocal n_nse, n_yf
        symbol = company["symbol"]
        if error is not None:
            logger.info("[%s] FAILED: %s", symbol, error)
            return
        if result["source"] == "nse":
            n_nse += 1
        else:
            n_yf += 1
        if engine is not None:
            with engine.begin() as conn:
                conn.execute(UPSERT_SHAREHOLDING, result)
        logger.info("[%s] source=%s promoter=%s fii=%s dii=%s mf=%s public=%s",
                    symbol, result["source"], result["promoter_pct"], result["fii_pct"],
                    result["dii_pct"], result["mutual_funds_pct"], result["public_pct"])

    summary = runner.run(companies, lambda c: _fetch_one(c, args.skip_nse), handle_result)

    logger.info("")
    logger.info("fetch_shareholding summary")
    logger.info("  Universe processed: %d", len(companies))
    logger.info("  From NSE (real):    %d", n_nse)
    logger.info("  From yfinance (approx): %d", n_yf)
    logger.info("  Failed:             %d", summary.n_failed)
    if summary.failed_keys:
        logger.info("    %s", ", ".join(summary.failed_keys))
    if args.dry_run:
        logger.info("  (dry run -- nothing was written to the DB)")


if __name__ == "__main__":
    main()
