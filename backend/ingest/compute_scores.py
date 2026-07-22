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
from sqlalchemy import text

from analysis.scoring_engine import compute_scores, verdict_for
from ingest.db import get_engine
# Milestone 5: no change needed here. UNIVERSE now resolves through
# ingest/universe.py's CSV-backed load_universe() instead of a hardcoded
# list — this import is unchanged and transparently picks up all ~100
# companies from data/universe_top100.csv.
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
               avg_volume_20
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


def build_metrics(f: dict | None, t: dict | None, promoter_pct: float | None,
                   latest_volume: int | None, sector_avg_pe: float | None) -> dict:
    """Shapes raw DB rows into analysis.scoring_engine's flat input
    contract. Field names here intentionally mirror
    services/company_service.py's `_company_fields` output so the two
    callers stay trivially comparable."""
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


def upsert_score(engine, symbol: str, fscore, tscore, overall, rationale):
    if fscore is None and tscore is None:
        return
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                insert into scores (symbol, as_of_date, fundamental_score, technical_score, overall_score, verdict, rationale)
                values (:symbol, current_date, :fscore, :tscore, :overall, :verdict, :rationale)
                on conflict (symbol) do update set
                    as_of_date = current_date,
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

    for company in UNIVERSE:
        symbol = company["symbol"]
        f = fetch_latest_fundamentals(engine, symbol)
        t = fetch_technicals(engine, symbol)
        promoter_pct = fetch_promoter_holding(engine, symbol)
        latest_volume = fetch_latest_volume(engine, symbol)
        sector_avg_pe = sector_avg_pe_by_sector.get(sector_by_symbol.get(symbol))

        metrics = build_metrics(f, t, promoter_pct, latest_volume, sector_avg_pe)
        result = compute_scores(metrics)
        rationale = build_rationale(symbol, f, t)

        upsert_score(engine, symbol, result["fundamentalScore"], result["technicalScore"], result["overallScore"], rationale)
        print(f"{symbol}: fundamental={result['fundamentalScore']} technical={result['technicalScore']} overall={result['overallScore']} -> {rationale}")


if __name__ == "__main__":
    main()
