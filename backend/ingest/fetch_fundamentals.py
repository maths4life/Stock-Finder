"""Fundamentals ingestion — live, free, and refreshable.

Replaces the old `ingest/seed_fundamentals.py` Kaggle-CSV path as the
default way to populate `financials_quarterly` (and, best-effort,
`shareholding_pattern`). The Kaggle dataset ("Detailed Financials Data
Of 4492 NSE & BSE Company") is no longer bundled with this project, so
that script cannot run against a fresh checkout — see `DATA_STRATEGY.md`
§4 option 2, now implemented.

Source: `yfinance`'s `Ticker.info` / `Ticker.fast_info`, the same free,
unofficial Yahoo Finance endpoint `ingest/fetch_prices.py` already
depends on for prices. This is a real change of data source (Yahoo's
own computed ratios), not a re-hosting of the Kaggle file — expect
occasional differences from the old `kaggle_seed` numbers if you're
comparing against a database that still has old rows.

What this DOES give you, per symbol, written as a single `quarter =
'latest'` row (a point-in-time snapshot, same convention the Kaggle
seed used for its own 'latest' row):
    pe, pb, eps, book_value, market_cap_cr, peg, dividend_yield_pct,
    roe_pct, debt_to_equity, current_ratio, revenue_growth_pct,
    profit_growth_pct, revenue_cr, net_profit_cr, ebitda_margin_pct,
    free_cash_flow_cr

What it approximates, and how:
  - `roce_pct` is NOT provided by `Ticker.info` at all. This script
    computes a best-effort ROCE from `Ticker.financials` (EBIT, most
    recent annual column) over `Ticker.balance_sheet` (Total Assets -
    Current Liabilities, most recent annual column). This is a
    standard ROCE formula, but it depends on Yahoo's statement line
    items being present and named consistently, which is NOT
    guaranteed for every NSE-listed company — falls back to NULL,
    same "don't fabricate" rule the old script followed, rather than
    guessing.
  - `debt_to_equity`: yfinance's `debtToEquity` is expressed as a
    percentage (e.g. 41.3 meaning a 0.413 ratio), not a raw ratio.
    Divided by 100 here so it's directly comparable to the
    Debt/Equity thresholds `analysis/rules/fundamental.py` already
    uses (e.g. ">1.5 is high leverage").
  - `dividend_yield_pct`: yfinance has changed the units of this field
    across versions (fraction vs. already-a-percent). Handled
    defensively — see `_normalize_pct_field()`.

What this does NOT give you (left NULL, not invented):
  - Multi-quarter history. Yahoo's `info` is a current snapshot, not a
    quarterly time series — same single-row limitation the Kaggle
    seed's 'latest' row had. `financials_quarterly` remains a time
    series table in principle (see `TECHNICAL_DEBT.md` TD-010); this
    script only ever writes/updates the 'latest' row for each symbol.
    (Module 7 added a separate, real multi-period history table,
    `financial_statements` — see ingest/fetch_financial_statements.py
    — for the Quarterly/Annual Comparison feature specifically; this
    script's 'latest' row is unrelated to that and still exists for
    the other ratios only Ticker.info has, like PE/PB/ROE/D-E.)

Module 8 ("One additional improvement" — company metadata quality):
this script now also enriches `companies.sector` / `.industry` /
`.market_cap_cr` from the same `Ticker.info` payload it already fetched
for the ratios above (see `enrich_company_metadata`). Previously
`sector` only ever came from whatever the universe CSV happened to have
hand-curated at seed time (blank for anything added in the Module 8
universe expansion — see ingest/universe.py's docstring); this makes it
self-healing on every ingestion run instead, sourced from Yahoo's own
classification rather than guessed from the company name.

Module 7.5 (Shareholding Pattern) note: shareholding writes here now
delegate to `ingest/fetch_shareholding.py`'s yfinance-approximation
path (`_from_yfinance`) instead of keeping a second, slightly-different
copy of the same approximation logic. Two independent implementations
of "insiders/institutions -> promoter/DII proxy" would have been a
real risk of drifting out of sync, and the old version here wrote
`quarter='latest'` while fetch_shareholding.py writes a real fiscal
quarter label (e.g. 'Q1 FY26') — since both share the same
`(symbol, quarter)` primary key, running both independently would have
left a permanent, never-cleaned-up `'latest'` row alongside the real
dated ones. Calling this script with `--skip-shareholding` (unchanged
flag) skips this entirely, same as before; run
`ingest/fetch_shareholding.py` on its own for shareholding-only runs.

Usage:
    python -m ingest.fetch_fundamentals
    python -m ingest.fetch_fundamentals --limit 10        # smoke test
    python -m ingest.fetch_fundamentals --dry-run          # fetch + parse only, no DB writes
    python -m ingest.fetch_fundamentals --skip-shareholding # financials only
    python -m ingest.fetch_fundamentals --workers 4         # concurrency (Module 8)
"""
import argparse

import yfinance as yf
from sqlalchemy import text

from ingest.db import get_engine
from ingest.fetch_shareholding import UPSERT_SHAREHOLDING
from ingest.fetch_shareholding import _from_yfinance as _shareholding_from_yfinance
from ingest.fiscal import fiscal_quarter_label
from ingest.resilience import ConcurrentRunner, assert_healthy, retry
from ingest.universe import UNIVERSE

CR = 1e7  # 1 crore = 10,000,000 — Yahoo reports absolute INR, schema wants crores

# ------------------------------------------------------------------
# Low-level helpers
# ------------------------------------------------------------------

def _num(v):
    """Coerce a yfinance info value to float, or None if missing/NaN."""
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if f != f:  # NaN
        return None
    return f


def _to_cr(v):
    v = _num(v)
    return round(v / CR, 4) if v is not None else None


def _normalize_pct_field(v):
    """yfinance has shipped both 'fraction' (0.025) and 'already a
    percent' (2.5) representations for percentage-like fields
    (dividendYield in particular changed units between releases). A
    fraction for any real-world ROE/growth/yield figure is < 1 in
    magnitude far more often than a genuine >=100% figure is
    plausible, so: values with abs() < 1 are treated as fractions and
    scaled to a percent; anything >= 1 is assumed to already be a
    percent and passed through unchanged."""
    v = _num(v)
    if v is None:
        return None
    return round(v * 100, 4) if abs(v) < 1 else round(v, 4)


def fetch_info(yahoo_ticker: str) -> dict:
    """Fetch the `.info` snapshot for one ticker. Raises on hard
    failure (network, bad ticker) — caller decides how to handle."""
    t = yf.Ticker(yahoo_ticker)
    info = t.info or {}
    if not info or info.get("regularMarketPrice") is None and info.get("currentPrice") is None:
        # yfinance sometimes returns a near-empty dict (e.g. {"trailingPegRatio": None})
        # for a delisted/renamed/invalid ticker instead of raising.
        raise ValueError(f"empty/invalid info payload for {yahoo_ticker}")
    return info


def compute_roce(ticker: yf.Ticker) -> float | None:
    """Best-effort ROCE = EBIT / (Total Assets - Current Liabilities),
    most recent annual column of each statement. Returns None on any
    missing line item, empty statement, or shape mismatch rather than
    guessing — Yahoo's line-item naming isn't guaranteed consistent
    across companies (banks/NBFCs in particular often lack a clean
    'Current Liabilities' line, which is expected and fine to skip)."""
    try:
        fin = ticker.financials
        bs = ticker.balance_sheet
        if fin is None or bs is None or fin.empty or bs.empty:
            return None

        ebit = None
        for label in ("EBIT", "Operating Income", "OperatingIncome"):
            if label in fin.index:
                ebit = _num(fin.loc[label].iloc[0])
                if ebit is not None:
                    break
        if ebit is None:
            return None

        total_assets = None
        for label in ("Total Assets", "TotalAssets"):
            if label in bs.index:
                total_assets = _num(bs.loc[label].iloc[0])
                break
        current_liab = None
        for label in ("Current Liabilities", "CurrentLiabilities", "Total Current Liabilities"):
            if label in bs.index:
                current_liab = _num(bs.loc[label].iloc[0])
                break
        if total_assets is None or current_liab is None:
            return None

        capital_employed = total_assets - current_liab
        if not capital_employed:
            return None
        return round(ebit / capital_employed * 100, 4)
    except Exception:
        # Any parsing surprise here should degrade to "no ROCE", never
        # crash the whole company's ingestion.
        return None


# ------------------------------------------------------------------
# Row builders
# ------------------------------------------------------------------

def build_financials_row(symbol: str, info: dict, roce_pct) -> dict:
    pe = _num(info.get("trailingPE")) or _num(info.get("forwardPE"))
    revenue_cr = _to_cr(info.get("totalRevenue"))
    net_profit_cr = _to_cr(info.get("netIncomeToCommon"))
    fcf_cr = _to_cr(info.get("freeCashflow"))
    market_cap_cr = _to_cr(info.get("marketCap"))

    return {
        "symbol": symbol,
        "quarter": "latest",
        "fiscal_year_end": None,
        "revenue_cr": revenue_cr,
        "net_profit_cr": net_profit_cr,
        "ebitda_margin_pct": _normalize_pct_field(info.get("ebitdaMargins")),
        "eps": _num(info.get("trailingEps")),
        "roe_pct": _normalize_pct_field(info.get("returnOnEquity")),
        "roce_pct": roce_pct,
        "debt_to_equity": round(_num(info.get("debtToEquity")) / 100, 4) if _num(info.get("debtToEquity")) is not None else None,
        "current_ratio": _num(info.get("currentRatio")),
        "free_cash_flow_cr": fcf_cr,
        "pe": round(pe, 4) if pe is not None else None,
        "pb": _num(info.get("priceToBook")),
        "peg": _num(info.get("pegRatio") or info.get("trailingPegRatio")),
        "revenue_growth_pct": _normalize_pct_field(info.get("revenueGrowth")),
        "profit_growth_pct": _normalize_pct_field(
            info.get("earningsGrowth") if info.get("earningsGrowth") is not None else info.get("earningsQuarterlyGrowth")
        ),
        "dividend_yield_pct": _normalize_pct_field(info.get("dividendYield")),
        "market_cap_cr": market_cap_cr,
        "book_value": _num(info.get("bookValue")),
    }


def enrich_company_metadata(info: dict) -> dict | None:
    """Module 8 metadata-quality improvement. `Ticker.info` carries
    Yahoo's own sector/industry classification — a real field from the
    same payload this script already fetches for the ratios above, not
    derived/guessed. (Market cap already has a home in
    `financials_quarterly.market_cap_cr`, written by
    `build_financials_row` in the same run — not duplicated onto
    `companies` here.) Returns None if Yahoo gave us neither sector nor
    industry (some smaller/newer listings lack classification), so the
    caller can skip the update rather than overwrite a possibly-better
    existing value with nulls."""
    sector = (info.get("sector") or "").strip() or None
    industry = (info.get("industry") or "").strip() or None
    if sector is None and industry is None:
        return None
    return {"sector": sector, "industry": industry}


# ------------------------------------------------------------------
# DB writes
# ------------------------------------------------------------------

UPSERT_FINANCIALS = text("""
    insert into financials_quarterly (
        symbol, quarter, fiscal_year_end, revenue_cr, net_profit_cr,
        ebitda_margin_pct, eps, roe_pct, roce_pct, debt_to_equity,
        current_ratio, free_cash_flow_cr, pe, pb, peg,
        revenue_growth_pct, profit_growth_pct, dividend_yield_pct,
        market_cap_cr, book_value, source
    ) values (
        :symbol, :quarter, :fiscal_year_end, :revenue_cr, :net_profit_cr,
        :ebitda_margin_pct, :eps, :roe_pct, :roce_pct, :debt_to_equity,
        :current_ratio, :free_cash_flow_cr, :pe, :pb, :peg,
        :revenue_growth_pct, :profit_growth_pct, :dividend_yield_pct,
        :market_cap_cr, :book_value, 'yfinance'
    )
    on conflict (symbol, quarter) do update set
        fiscal_year_end = excluded.fiscal_year_end,
        revenue_cr = excluded.revenue_cr,
        net_profit_cr = excluded.net_profit_cr,
        ebitda_margin_pct = excluded.ebitda_margin_pct,
        eps = excluded.eps,
        roe_pct = excluded.roe_pct,
        roce_pct = excluded.roce_pct,
        debt_to_equity = excluded.debt_to_equity,
        current_ratio = excluded.current_ratio,
        free_cash_flow_cr = excluded.free_cash_flow_cr,
        pe = excluded.pe,
        pb = excluded.pb,
        peg = excluded.peg,
        revenue_growth_pct = excluded.revenue_growth_pct,
        profit_growth_pct = excluded.profit_growth_pct,
        dividend_yield_pct = excluded.dividend_yield_pct,
        market_cap_cr = excluded.market_cap_cr,
        book_value = excluded.book_value,
        source = 'yfinance',
        updated_at = now()
""")

UPSERT_COMPANY_METADATA = text("""
    update companies
    set sector = coalesce(:sector, sector),
        industry = coalesce(:industry, industry)
    where symbol = :symbol
""")


def upsert_financials(engine, row: dict):
    with engine.begin() as conn:
        conn.execute(UPSERT_FINANCIALS, row)


def upsert_company_metadata(engine, symbol: str, meta: dict):
    with engine.begin() as conn:
        conn.execute(UPSERT_COMPANY_METADATA, {**meta, "symbol": symbol})


def upsert_shareholding(engine, row: dict):
    with engine.begin() as conn:
        conn.execute(UPSERT_SHAREHOLDING, row)


# ------------------------------------------------------------------
# Main
# ------------------------------------------------------------------

@retry(times=3, base_delay_seconds=2.0)
def _fetch_one(company: dict) -> dict:
    """Everything needed for one company, in a single retried unit —
    the .info payload is shared by financials, ROCE, metadata, and
    shareholding, so a transient failure retries the whole cheap-ish
    bundle rather than four separate retry loops."""
    symbol, ticker = company["symbol"], company["yahoo_ticker"]
    yft = yf.Ticker(ticker)
    info = yft.info or {}
    if not info:
        raise ValueError("empty info payload")
    roce_pct = compute_roce(yft)
    return {
        "symbol": symbol,
        "fin_row": build_financials_row(symbol, info, roce_pct),
        "roce_pct": roce_pct,
        "meta": enrich_company_metadata(info),
        "info": info,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--limit", type=int, default=None, help="Only process the first N universe companies (smoke test)")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and parse but skip all DB writes")
    parser.add_argument("--skip-shareholding", action="store_true", help="Only write financials_quarterly, skip the shareholding_pattern approximation")
    parser.add_argument("--workers", type=int, default=4, help="Concurrent fetch workers (default 4)")
    args = parser.parse_args()

    engine = None if args.dry_run else get_engine()
    companies = UNIVERSE[: args.limit] if args.limit else UNIVERSE

    counts = {"ok": 0, "roce": 0, "shareholding": 0, "metadata": 0}

    def handle_result(company, result, error):
        symbol = company["symbol"]
        if error is not None:
            print(f"[{symbol}] FAILED: {error}")
            return

        fin_row = result["fin_row"]
        if engine:
            upsert_financials(engine, fin_row)
        counts["ok"] += 1
        if result["roce_pct"] is not None:
            counts["roce"] += 1
        print(f"[{symbol}] pe={fin_row['pe']} roe={fin_row['roe_pct']} roce={fin_row['roce_pct']} "
              f"d/e={fin_row['debt_to_equity']} rev_growth={fin_row['revenue_growth_pct']}")

        if result["meta"] is not None:
            if engine:
                upsert_company_metadata(engine, symbol, result["meta"])
            counts["metadata"] += 1

        if not args.skip_shareholding:
            sh_row = _shareholding_from_yfinance(symbol, company["yahoo_ticker"], info=result["info"])
            if sh_row is not None:
                sh_row["symbol"] = symbol
                sh_row["quarter"] = fiscal_quarter_label(sh_row["period_end"])
                if engine:
                    upsert_shareholding(engine, sh_row)
                counts["shareholding"] += 1

    runner = ConcurrentRunner(max_workers=args.workers, delay_seconds=1.5)
    summary = runner.run(companies, _fetch_one, handle_result, key=lambda c: c["symbol"])

    print()
    print("fetch_fundamentals summary")
    print(f"  Universe processed:            {len(companies)}")
    print(f"  Financials written:            {counts['ok']}")
    print(f"  With computed ROCE:            {counts['roce']}")
    print(f"  Metadata (sector/industry) enriched: {counts['metadata']}")
    print(f"  Shareholding (approx) written:  {counts['shareholding']}")
    print(f"  Failed:                         {summary.n_failed}")
    if summary.failed_keys:
        print(f"    {', '.join(summary.failed_keys)}")
    if args.dry_run:
        print("  (dry run -- nothing was written to the DB)")

    # Weekly-refresh safety net -- see fetch_prices.py's identical check
    # and HANDOFF.md's "failure handling" section. Checked even on
    # --dry-run since it reflects fetch success, not DB writes.
    assert_healthy(summary, "fetch_fundamentals")


if __name__ == "__main__":
    main()
