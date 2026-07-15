"""Reusable scoring/discovery heuristics.

Pulled out of company_service.py because these are v1 placeholder rules
(not real financial models) that more than one module needs:
- Module 1 (Companies) uses them to fill riskLevel / expectedReturnPct /
  investmentHorizonMonths on every company.
- Module 4 (Screener) will filter on riskLevel/horizon.
- Module 9 (AI Insights) will likely want to explain or replace these.

Centralizing them here means upgrading the heuristic later (or swapping
in a real model) is a one-file change instead of a hunt across services.
Same transparent-rule-based spirit as ingest/compute_scores.py — nothing
here is real investment advice; see API_CONTRACT.md's known-gaps table.
"""
from typing import Dict, List, Optional, Tuple


def risk_level(debt_to_equity: Optional[float], roe: Optional[float]) -> str:
    """v1 heuristic: higher leverage or negative returns on capital reads
    as higher risk. Not a real risk assessment."""
    if debt_to_equity is None:
        return "Moderate"
    if debt_to_equity > 1.5 or (roe is not None and roe < 0):
        return "High"
    if debt_to_equity > 0.5:
        return "Moderate"
    return "Low"


def expected_return_and_horizon(
    risk_level_value: str, overall_score: Optional[float]
) -> Tuple[float, int]:
    """Placeholder heuristic keyed off risk level + overall score."""

    # Convert Decimal/int/None safely to float
    score = float(overall_score) if overall_score is not None else 50.0

    base = {
        "Low": 10.0,
        "Moderate": 14.0,
        "High": 20.0,
    }.get(risk_level_value, 12.0)

    score_adj = (score - 50.0) * 0.15

    horizon = {
        "Low": 24,
        "Moderate": 12,
        "High": 6,
    }.get(risk_level_value, 12)

    return round(base + score_adj, 1), horizon


# ---------------------------------------------------------------------------
# Module 3 additions — Research page "Pros/Cons", "Checklist", "Verdict"
# sections. Same spirit as the two functions above and as
# ingest/compute_scores.py's build_rationale: transparent, threshold-based
# reads of fields the caller already computed (roe, pe, rsi, ...) — no new
# queries, no LLM call, nothing invented. Centralized here (not in
# company_service.py) for the same reason risk_level/expected_return_and_
# horizon are: Module 9 (AI Insights) will likely want to explain or
# replace these later, and should import one function, not copy-paste it.
# ---------------------------------------------------------------------------


def research_checklist(fields: Dict) -> List[Dict]:
    """v1 rule-based checklist for the Research page's Scorecard section.
    Each item is a plain threshold read of already-computed Company
    fields — not a new data source, not a real due-diligence checklist."""
    rsi = fields.get("rsi") or 0.0
    return [
        {"label": "ROE above 15%", "done": (fields.get("roe") or 0.0) > 15},
        {"label": "Promoter holding above 50%", "done": (fields.get("promoterHoldingPct") or 0.0) > 50},
        {"label": "Trading above 200-day average", "done": bool(fields.get("aboveEma200"))},
        {"label": "Profit growth positive YoY", "done": (fields.get("profitGrowthPct") or 0.0) > 0},
        {"label": "Reasonable valuation (P/E under 40)", "done": 0 < (fields.get("pe") or 0.0) < 40},
        {"label": "RSI in a healthy range (30-70)", "done": 0 < rsi < 70},
    ]


def pros_and_cons(fields: Dict) -> Tuple[List[str], List[str]]:
    """Same rule-based derivation as research_checklist, phrased as prose
    bullets for the Research page's Pros/Cons sections."""
    pros: List[str] = []
    cons: List[str] = []

    roe = fields.get("roe") or 0.0
    if roe > 15:
        pros.append(f"ROE of {roe:.1f}% clears the 15% quality bar.")
    elif roe > 0:
        cons.append(f"ROE of {roe:.1f}% is below the 15% quality bar.")

    profit_growth = fields.get("profitGrowthPct") or 0.0
    if profit_growth > 10:
        pros.append(f"Profit growth of {profit_growth:.1f}% YoY.")
    elif profit_growth < 0:
        cons.append(f"Profit contracted {profit_growth:.1f}% YoY.")

    debt_to_equity = fields.get("debtToEquity") or 0.0
    if debt_to_equity > 1.5:
        cons.append(f"Debt/Equity of {debt_to_equity:.2f} is highly leveraged.")
    elif debt_to_equity and debt_to_equity < 0.5:
        pros.append(f"Low leverage — Debt/Equity of {debt_to_equity:.2f}.")

    promoter = fields.get("promoterHoldingPct") or 0.0
    if promoter > 50:
        pros.append(f"Promoter holding of {promoter:.1f}% signals founder alignment.")

    if fields.get("aboveEma200"):
        pros.append("Trading above its 200-day moving average.")
    else:
        cons.append("Trading below its 200-day moving average.")

    rsi = fields.get("rsi") or 0.0
    if rsi > 70:
        cons.append(f"RSI at {rsi:.0f} is in overbought territory.")
    elif 0 < rsi < 30:
        cons.append(f"RSI at {rsi:.0f} is in oversold territory.")

    pe = fields.get("pe") or 0.0
    if pe > 40:
        cons.append(f"P/E of {pe:.1f}x is expensive relative to the broader market.")

    if not pros:
        pros.append("No standout strengths clear the v1 rule thresholds yet.")
    if not cons:
        cons.append("No standout risk flags clear the v1 rule thresholds yet.")

    return pros, cons


def verdict_summary(fields: Dict, pros: List[str], cons: List[str]) -> str:
    """Short template sentence for the Research page's 'Verdict' section —
    same explainable-rules spirit as ingest/compute_scores.py's
    build_rationale (which backs the separate `rationale` field used by
    'Why AI Selected'), just longer-form. Not an AI-generated summary."""
    lead_pro = pros[0] if pros else ""
    lead_con = cons[0] if cons else ""
    verdict = fields.get("verdict") or "Under Review"
    overall = fields.get("overallScore") or 0.0
    fundamental = fields.get("fundamentalScore") or 0.0
    technical = fields.get("technicalScore") or 0.0
    return (
        f"{verdict} at an overall score of {overall:.0f}/100 "
        f"(fundamental {fundamental:.0f}, technical {technical:.0f}). "
        f"{lead_pro} {lead_con}"
    ).strip()


def trend_label(above_50dma: Optional[bool], above_200dma: Optional[bool]) -> str:
    """v1 rule-based trend classification for the Research page's
    Technical Metrics section — the schema has no dedicated 'trend'
    column, so this reads it off the two moving-average flags that
    ingest/compute_technicals.py already writes. Not a forecast."""
    if above_50dma and above_200dma:
        return "Uptrend"
    if not above_50dma and not above_200dma:
        return "Downtrend"
    return "Sideways"
