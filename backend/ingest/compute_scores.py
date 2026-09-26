"""Combines stored fundamentals + technicals into a single score per symbol.

Reuses analysis/scoring_engine.py -- the exact same rule functions
services/company_service.py calls on every live request -- so the
`scores` table (read by Discover/Screener for SQL-level sorting) never
drifts from what a user sees on a company's own detail page. This file's
only remaining job is data plumbing: pull the wider field set the engine
needs out of Postgres, shape it into the engine's flat dict contract,
and persist the result.

Usage:
    python -m ingest.compute_scores
"""
import datetime

from sqlalchemy import text

from analysis.scoring_engine import compute_scores, verdict_for
from ingest.db import get_engine
# Milestone 5 / Module 8: no change needed here. UNIVERSE resolves through
# ingest/universe.py's CSV-backed load_universe() instead of a hardcoded
# list — this import is unchanged and transparently picked up the Module 8
# expansion from ~100 to 498 companies (data/universe_nifty500.csv) with
# zero edits to this file. This script is DB-only (reads prices_daily /
# financials_quarterly, no external API calls), so the larger universe
# means more per-symbol queries, not more network flakiness -- no
# retry/concurrency changes were needed here the way fetch_prices.py and
# fetch_fundamentals.py needed them.
from ingest.universe import UNIVERSE


def fetch_latest_fundamentals(engine, symbol: str) -> dict | None:
    query = text(
        """
        select roe_pct, roce_pct, pe, pb, peg, revenue_growth_pct,
               profit_growth_pct, dividend_yield_pct, debt_to_equity,
               current_ratio
        from financials_quarterly
        where symbol = :symbol
        order by updated_at desc
        limit 1
        """
    )
    with engine.connect() as conn:
        row = conn.execute(query, {"symbol": symbol}).mappings().first()
    return dict(row) if row else None


def fetch_technicals(engine, symbol: str) -> dict | None:
    query = text(
        """
        select close, rsi_14, above_50dma, above_200dma, golden_cross,
               death_cross, change_pct, high_52w, low_52w,
               avg_volume_20, as_of_date
        from technical_snapshot
        where symbol = :symbol
        """
    )
    with engine.connect() as conn:
        row = conn.execute(query, {"symbol": symbol}).mappings().first()
    return dict(row) if row else None


def fetch_latest_volume(engine, symbol: str) -> int | None:
    query = text(
        """
        select volume from prices_daily
        where symbol = :symbol
        order by date desc
        limit 1
        """
    )
    with engine.connect() as conn:
        row = conn.execute(query, {"symbol": symbol}).mappings().first()
    return int(row["volume"]) if row and row["volume"] is not None else None


def fetch_promoter_holding(engine, symbol: str) -> float | None:
    query = text(
        """
        select promoter_pct from shareholding_pattern
        where symbol = :symbol
        order by quarter desc
        limit 1
        """
    )
    with engine.connect() as conn:
        row = conn.execute(query, {"symbol": symbol}).mappings().first()
    return float(row["promoter_pct"]) if row and row["promoter_pct"] is not None else None


def fetch_sector_avg_pe(engine) -> dict[str, float]:
    """One query for the whole universe: average P/E per sector, used
    for the engine's sector-relative P/E metric. Computed here (not
    per-symbol) to avoid N+1 queries across a ~100-company universe --
    see services/company_service.py's `_fetch_sector_avg_pe` for the
    identical query used on the live-request path, so both callers
    compare against the same peer set."""
    query = text(
        """
        select c.sector, avg(f.pe) as avg_pe, count(*) as n
        from companies c
        join financials_quarterly f
            on f.symbol = c.symbol and f.quarter = 'latest'
        where c.is_active and f.pe is not null and f.pe > 0
        group by c.sector
        having count(*) >= 2
        """
    )
    with engine.connect() as conn:
        rows = conn.execute(query).mappings().all()
    return {row["sector"]: float(row["avg_pe"]) for row in rows}


# ---------------------------------------------------------------------------
# Sprint 3 (v2): batch pre-computation helpers
# Mirror of the queries in services/company_service.py — same SQL, same
# peer-set rules, so the batch-persisted `scores` table and the live
# per-request score can never use different inputs.
# ---------------------------------------------------------------------------


def compute_sector_percentiles(engine) -> dict[str, dict]:
    """Returns {symbol: {sectorRoePercentile, sectorRocePercentile, sectorDePercentile}}.
    Only sectors with >= 3 active peers included. D/E percentile is inverted."""
    query = text(
        """
        with universe as (
            select c.symbol, c.sector,
                   f.roe_pct, f.roce_pct,
                   d.debt_to_equity
            from companies c
            join financials_quarterly f
                on f.symbol = c.symbol and f.quarter = 'latest'
            left join lateral (
                select debt_to_equity
                from financials_quarterly
                where symbol = c.symbol and debt_to_equity is not null
                order by fiscal_year_end desc nulls last
                limit 1
            ) d on true
            where c.is_active
        ),
        sector_counts as (
            select sector, count(*) as n
            from universe
            group by sector
            having count(*) >= 3
        )
        select u.symbol, u.sector, u.roe_pct, u.roce_pct, u.debt_to_equity
        from universe u
        join sector_counts sc on sc.sector = u.sector
        """
    )
    with engine.connect() as conn:
        rows = conn.execute(query).mappings().all()
    if not rows:
        return {}

    from collections import defaultdict
    by_sector: dict[str, list] = defaultdict(list)
    for row in rows:
        by_sector[row["sector"]].append(dict(row))

    result: dict[str, dict] = {}
    for sector, peers in by_sector.items():
        roe_vals = sorted([(p["symbol"], float(p["roe_pct"])) for p in peers if p["roe_pct"] is not None], key=lambda x: x[1])
        roce_vals = sorted([(p["symbol"], float(p["roce_pct"])) for p in peers if p["roce_pct"] is not None], key=lambda x: x[1])
        de_vals = sorted([(p["symbol"], float(p["debt_to_equity"])) for p in peers if p["debt_to_equity"] is not None], key=lambda x: x[1])

        def _pct(sym, ranked):
            for i, (s, _) in enumerate(ranked):
                if s == sym:
                    return round((i + 0.5) / len(ranked) * 100, 1)
            return None

        def _inv_pct(sym, ranked):
            p = _pct(sym, ranked)
            return round(100 - p, 1) if p is not None else None

        for p in peers:
            sym = p["symbol"]
            result[sym] = {
                "sectorRoePercentile": _pct(sym, roe_vals),
                "sectorRocePercentile": _pct(sym, roce_vals),
                "sectorDePercentile": _inv_pct(sym, de_vals),
            }
    return result


def fetch_fii_dii_trend(engine, symbol: str) -> dict | None:
    """Returns {fiiTrendPct, diiTrendPct} for one symbol, or None if < 2 quarters."""
    query = text(
        """
        select fii_pct, dii_pct
        from shareholding_pattern
        where symbol = :symbol
        order by period_end desc nulls last, quarter desc
        limit 2
        """
    )
    with engine.connect() as conn:
        rows = conn.execute(query, {"symbol": symbol}).mappings().all()
    if len(rows) < 2:
        return None
    fii_t = (
        round(float(rows[0]["fii_pct"]) - float(rows[1]["fii_pct"]), 4)
        if rows[0]["fii_pct"] is not None and rows[1]["fii_pct"] is not None else None
    )
    dii_t = (
        round(float(rows[0]["dii_pct"]) - float(rows[1]["dii_pct"]), 4)
        if rows[0]["dii_pct"] is not None and rows[1]["dii_pct"] is not None else None
    )
    return {"fiiTrendPct": fii_t, "diiTrendPct": dii_t}


def compute_earnings_quality_for(engine, symbol: str) -> dict | None:
    """Fetches up to 8 quarters of net_profit_cr and returns the quality dict
    expected by scoring_engine._score_earnings_quality. Returns None when < 2 quarters."""
    query = text(
        """
        select net_profit_cr
        from financial_statements
        where symbol = :symbol and period_type = 'quarterly'
          and net_profit_cr is not null
        order by period_end desc
        limit 8
        """
    )
    with engine.connect() as conn:
        rows = conn.execute(query, {"symbol": symbol}).mappings().all()
    values = [float(r["net_profit_cr"]) for r in rows]
    n = len(values)
    if n < 2:
        return None
    from services.financial_statements_service import _linear_direction
    direction = _linear_direction(values)
    overall_slope = values[0] - values[-1]
    pairs = [values[i] - values[i + 1] for i in range(n - 1)]
    matching = sum(1 for d in pairs if (d >= 0 if overall_slope >= 0 else d < 0))
    consistency_score = round(matching / len(pairs), 3) if pairs else 0.0
    return {"direction": direction, "consistency_score": consistency_score, "n_periods": n, "profit_series": values}


def build_metrics(f: dict | None, t: dict | None, promoter_pct: float | None,
                   latest_volume: int | None, sector_avg_pe: float | None,
                   fii_dii_trend: dict | None = None,
                   earnings_quality: dict | None = None,
                   sector_percentiles: dict | None = None) -> dict:
    """Shapes raw DB rows into analysis.scoring_engine's flat input
    contract. Field names here intentionally mirror
    services/company_service.py's `_company_fields` output so the two
    callers stay trivially comparable.

    Sprint 3: fii_dii_trend, earnings_quality, and sector_percentiles are
    new optional kwargs. All three default to None so callers that don't
    yet pass them still work (graceful degradation to unavailable metric)."""
    f = f or {}
    t = t or {}

    avg_volume_20 = t.get("avg_volume_20")
    volume_breakout = bool(
        latest_volume is not None and avg_volume_20 and latest_volume > 1.5 * avg_volume_20
    )

    return {
        "roe": float(f["roe_pct"]) if f.get("roe_pct") is not None else None,
        "roce": float(f["roce_pct"]) if f.get("roce_pct") is not None else None,
        "salesGrowthPct": float(f["revenue_growth_pct"]) if f.get("revenue_growth_pct") is not None else None,
        "profitGrowthPct": float(f["profit_growth_pct"]) if f.get("profit_growth_pct") is not None else None,
        "debtToEquity": float(f["debt_to_equity"]) if f.get("debt_to_equity") is not None else None,
        "currentRatio": float(f["current_ratio"]) if f.get("current_ratio") is not None else None,
        "pe": float(f["pe"]) if f.get("pe") is not None else None,
        "pb": float(f["pb"]) if f.get("pb") is not None else None,
        "peg": float(f["peg"]) if f.get("peg") is not None else None,
        "sectorAvgPe": sector_avg_pe,
        "divYield": float(f["dividend_yield_pct"]) if f.get("dividend_yield_pct") is not None else None,
        "promoterHoldingPct": promoter_pct,
        # Sprint 3 (v2) additions:
        "earningsQuality": earnings_quality,
        "fiiTrendPct": (fii_dii_trend or {}).get("fiiTrendPct"),
        "diiTrendPct": (fii_dii_trend or {}).get("diiTrendPct"),
        "sectorRoePercentile": (sector_percentiles or {}).get("sectorRoePercentile"),
        "sectorRocePercentile": (sector_percentiles or {}).get("sectorRocePercentile"),
        "sectorDePercentile": (sector_percentiles or {}).get("sectorDePercentile"),
        # Technical inputs (unchanged):
        "rsi": float(t["rsi_14"]) if t.get("rsi_14") is not None else None,
        "aboveEma50": t.get("above_50dma"),
        "aboveEma200": t.get("above_200dma"),
        "goldenCross": t.get("golden_cross"),
        "deathCross": t.get("death_cross"),
        "volumeBreakout": volume_breakout,
        "price": float(t["close"]) if t.get("close") is not None else None,
        "high52w": float(t["high_52w"]) if t.get("high_52w") is not None else None,
        "low52w": float(t["low_52w"]) if t.get("low_52w") is not None else None,
    }


def build_rationale(symbol: str, f: dict | None, t: dict | None) -> str:
    """A short, honest, template-generated explanation from real numbers —
    not free-form AI narrative. Upgrade this once the underlying data is
    reliable enough to trust an LLM-generated summary against it."""
    parts = []
    if f:
        if f.get("roe_pct") is not None:
            parts.append(f"ROE at {f['roe_pct']:.1f}%")
        if f.get("profit_growth_pct") is not None:
            parts.append(f"profit growth {f['profit_growth_pct']:.1f}%")
    if t:
        if t.get("above_200dma"):
            parts.append("trading above its 200-day average")
        if t.get("golden_cross"):
            parts.append("recent golden cross")
    if not parts:
        return f"{symbol}: not enough data yet to generate a rationale."
    return f"{symbol}: " + "; ".join(parts) + "."


def upsert_score(engine, symbol: str, fscore, tscore, overall, rationale, as_of_date):
    if fscore is None and tscore is None:
        return
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                insert into scores (symbol, as_of_date, fundamental_score, technical_score, overall_score, verdict, rationale)
                values (:symbol, :as_of_date, :fscore, :tscore, :overall, :verdict, :rationale)
                on conflict (symbol) do update set
                    as_of_date = excluded.as_of_date,
                    fundamental_score = excluded.fundamental_score,
                    technical_score = excluded.technical_score,
                    overall_score = excluded.overall_score,
                    verdict = excluded.verdict,
                    rationale = excluded.rationale,
                    updated_at = now()
                """
            ),
            {
                "symbol": symbol,
                "as_of_date": as_of_date,
                "fscore": fscore,
                "tscore": tscore,
                "overall": round(overall, 1) if overall is not None else None,
                "verdict": verdict_for(overall) if overall is not None else None,
                "rationale": rationale,
            },
        )


def main():
    engine = get_engine()
    sector_avg_pe_by_sector = fetch_sector_avg_pe(engine)
    sector_by_symbol = {c["symbol"]: c.get("sector") for c in UNIVERSE}
    # Sprint 3: pre-compute universe-wide sector percentile ranks (one query)
    sector_pct_by_symbol = compute_sector_percentiles(engine)

    for company in UNIVERSE:
        symbol = company["symbol"]
        f = fetch_latest_fundamentals(engine, symbol)
        t = fetch_technicals(engine, symbol)
        promoter_pct = fetch_promoter_holding(engine, symbol)
        latest_volume = fetch_latest_volume(engine, symbol)
        sector_avg_pe = sector_avg_pe_by_sector.get(sector_by_symbol.get(symbol))
        # Sprint 3: per-symbol new inputs
        fii_dii = fetch_fii_dii_trend(engine, symbol)
        eq = compute_earnings_quality_for(engine, symbol)
        sector_pct = sector_pct_by_symbol.get(symbol)

        metrics = build_metrics(
            f, t, promoter_pct, latest_volume, sector_avg_pe,
            fii_dii_trend=fii_dii,
            earnings_quality=eq,
            sector_percentiles=sector_pct,
        )
        result = compute_scores(metrics)
        rationale = build_rationale(symbol, f, t)

        # Freshness safety net (see HANDOFF.md's production-safety review):
        # a score's as_of_date must reflect how current the data behind it
        # actually is, not the date it happened to be recomputed. Anchored
        # to technical_snapshot.as_of_date -- already the honest "latest
        # trading date this symbol's prices actually reflect" (set by
        # compute_technicals.py from the newest row in prices_daily, not
        # from today's date) -- since price/technical staleness is the
        # fastest-moving and most consequential freshness signal here. A
        # company whose price fetch has been silently failing for weeks
        # now surfaces that honestly instead of getting a fresh-looking
        # as_of_date every run regardless of its underlying data's age.
        # Falls back to today only when there's no technical snapshot at
        # all yet (a brand-new company still building up price history) --
        # no worse than the previous behavior for that narrow case.
        as_of_date = (t or {}).get("as_of_date") or datetime.date.today()

        upsert_score(engine, symbol, result["fundamentalScore"], result["technicalScore"], result["overallScore"], rationale, as_of_date)
        print(f"{symbol}: fundamental={result['fundamentalScore']} technical={result['technicalScore']} overall={result['overallScore']} (as_of={as_of_date}) -> {rationale}")



if __name__ == "__main__":
    main()
