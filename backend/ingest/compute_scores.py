"""Combines stored fundamentals + technicals into a single score per symbol.

Deliberately simple and transparent for v1 — a weighted rule-based score,
not an AI black box. See project notes: an explainable score you can trust
beats an opaque AI score you can't, until you have enough real usage data
to know what explanations people actually want.

Usage:
    python -m ingest.compute_scores
"""
from sqlalchemy import text

from ingest.db import get_engine
# Milestone 5: no change needed here. UNIVERSE now resolves through
# ingest/universe.py's CSV-backed load_universe() instead of a hardcoded
# list — this import is unchanged and transparently picks up all ~100
# companies from data/universe_top100.csv.
from ingest.universe import UNIVERSE


def fetch_latest_fundamentals(engine, symbol: str) -> dict | None:
    query = text(
        """
        select roe_pct, roce_pct, pe, revenue_growth_pct, profit_growth_pct,
               dividend_yield_pct, debt_to_equity
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
        select rsi_14, above_50dma, above_200dma, golden_cross, change_pct
        from technical_snapshot
        where symbol = :symbol
        """
    )
    with engine.connect() as conn:
        row = conn.execute(query, {"symbol": symbol}).mappings().first()
    return dict(row) if row else None


def fundamental_score(f: dict | None) -> float | None:
    if f is None:
        return None

    score = 50.0  # neutral baseline

    roe = float(f["roe_pct"]) if f.get("roe_pct") is not None else None
    roce = float(f["roce_pct"]) if f.get("roce_pct") is not None else None
    profit_growth = float(f["profit_growth_pct"]) if f.get("profit_growth_pct") is not None else None
    pe = float(f["pe"]) if f.get("pe") is not None else None

    if roe is not None:
        score += min(max(roe - 15, -15), 20)

    if roce is not None:
        score += min(max(roce - 15, -10), 15)

    if profit_growth is not None:
        score += min(max(profit_growth / 2, -15), 15)

    if pe is not None and pe > 0:
        # Mild penalty for very expensive multiples, mild reward for cheap ones.
        score += min(max((35 - pe) / 5, -10), 10)

    return round(min(max(score, 0), 100), 1)


def technical_score(t: dict | None) -> float | None:
    if t is None:
        return None
    score = 50.0

    if t.get("above_200dma"):
        score += 15
    if t.get("above_50dma"):
        score += 10
    if t.get("golden_cross"):
        score += 10
    rsi = t.get("rsi_14")
    if rsi is not None:
        if rsi > 70:
            score -= 10   # overbought
        elif rsi < 30:
            score -= 5    # oversold, momentum-negative even if "cheap"
        else:
            score += 5

    return round(min(max(score, 0), 100), 1)


def verdict_for(overall: float) -> str:
    if overall >= 75:
        return "Strong Conviction"
    if overall >= 60:
        return "Watch"
    if overall >= 45:
        return "Under Review"
    return "Pass"


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


def upsert_score(engine, symbol: str, fscore, tscore, rationale):
    if fscore is None and tscore is None:
        return
    weights = {"f": 0.5, "t": 0.5}
    if fscore is None:
        overall = tscore
    elif tscore is None:
        overall = fscore
    else:
        overall = fscore * weights["f"] + tscore * weights["t"]

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
    for company in UNIVERSE:
        symbol = company["symbol"]
        f = fetch_latest_fundamentals(engine, symbol)
        t = fetch_technicals(engine, symbol)
        fscore = fundamental_score(f)
        tscore = technical_score(t)
        rationale = build_rationale(symbol, f, t)
        upsert_score(engine, symbol, fscore, tscore, rationale)
        print(f"{symbol}: fundamental={fscore} technical={tscore} -> {rationale}")


if __name__ == "__main__":
    main()
