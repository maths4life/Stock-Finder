"""Module 6 orchestrator.

`build_research_report(symbol)` is the one function services/
analysis_service.py calls. It:

1. Reuses services.company_service.get_company_by_symbol — the same
   function GET /company/{symbol} already calls — for every field
   Modules 1-4 compute (scores, roe, rsi, pros/cons, shareholding
   history, ...). No duplicate queries, no re-derivation of numbers
   that already exist.
2. Pulls the few additional stored fields Module 6 needs via
   analysis/helpers.py (extended moving averages, VWAP, 52w range,
   pledge %).
3. Runs the deterministic rule modules in analysis/rules/ over that
   data.
4. Assembles the JSON shape requested for Module 6.

Nothing here calls an LLM or any external AI API — every sentence
below is a template filled from a real, already-computed number.
"""
from typing import Dict, Optional

from analysis.helpers import get_extended_technicals, get_latest_pledge_pct, promoter_trend as promoter_trend_fn
from analysis.rules import fundamental, risk_catalysts, technical
from services.company_service import get_company_by_symbol

# Rating thresholds are deliberately distinct from scoring_service's
# verdict labels ("Strong Conviction"/"Watch"/"Under Review"/"Pass") —
# same overall_score input, different vocabulary, because Module 6's
# spec calls for the Strong Buy/Buy/Hold/Avoid scale specifically.
_RATING_THRESHOLDS = (
    (80, "Strong Buy"),
    (65, "Buy"),
    (45, "Hold"),
)


def _rating_from_score(overall_score: float) -> str:
    for threshold, label in _RATING_THRESHOLDS:
        if overall_score >= threshold:
            return label
    return "Avoid"


def _key_fields_completeness(fields: Dict) -> float:
    """Fraction of the core inputs the rule engine actually leans on
    that are non-null/non-zero — used only to temper `confidence`, not
    to change any rule output."""
    keys = [
        "roe", "roce", "pe", "debtToEquity", "currentRatio",
        "salesGrowthPct", "profitGrowthPct", "rsi", "price",
        "fundamentalScore", "technicalScore",
    ]
    present = sum(1 for k in keys if fields.get(k))
    return present / len(keys)


def _compute_confidence(fields: Dict) -> int:
    """Deterministic confidence score (0-100): how far the overall
    score sits from a neutral 50 (a more decisive score is a more
    confident read), scaled down when key inputs are missing. No
    randomness, no model call."""
    overall_score = fields.get("overallScore") or 50.0
    decisiveness = 50 + abs(overall_score - 50) * 0.9
    completeness = _key_fields_completeness(fields)
    confidence = decisiveness * (0.55 + 0.45 * completeness)
    return int(round(min(97, max(20, confidence))))


def _business_summary(fields: Dict) -> str:
    """Deliberately data-driven, not a fabricated company description.
    services/fundamental_service.get_business_summary already documents
    that the schema has no description/about column — that gap is
    real, so Module 6 doesn't paper over it with invented prose. This
    summary only states facts the platform already has: sector,
    exchange, market cap, and where the scoring engine places it."""
    return (
        f"{fields['name']} ({fields['symbol']}) is a {fields['sector']} company listed on the "
        f"{fields['exchange']}, with a market capitalization of {fields['marketCap']}. "
        f"The platform's scoring engine currently places it at an overall score of "
        f"{fields.get('overallScore', 0.0):.0f}/100 "
        f"(fundamental {fields.get('fundamentalScore', 0.0):.0f}, technical {fields.get('technicalScore', 0.0):.0f}), "
        f"classified as '{fields.get('verdict', 'Under Review')}'."
    )


def _investment_summary(fields: Dict, rating: str, confidence: int) -> str:
    pros = fields.get("pros") or []
    cons = fields.get("cons") or []
    lead_pro = pros[0] if pros else ""
    lead_con = cons[0] if cons else ""
    return (
        f"{fields['symbol']} rates as a '{rating}' with {confidence}% confidence on the platform's "
        f"rule-based engine, at an overall score of {fields.get('overallScore', 0.0):.0f}/100. "
        f"{lead_pro} {lead_con}"
    ).strip()


def _valuation_summary(valuation_notes: list, fields: Dict) -> str:
    if not valuation_notes:
        return f"Insufficient valuation data available for {fields['symbol']}."
    return " ".join(valuation_notes)


def _outlook(fields: Dict) -> str:
    """Reuses services.scoring_service.expected_return_and_horizon's
    output, which company_service.py already computed onto
    expectedReturnPct / investmentHorizonMonths — not re-derived here."""
    expected_return = fields.get("expectedReturnPct")
    horizon = fields.get("investmentHorizonMonths")
    risk = fields.get("riskLevel", "Moderate")
    if expected_return is None or horizon is None:
        return "Insufficient data to generate an outlook."
    return (
        f"On the platform's risk-adjusted heuristic, {fields['symbol']} carries an indicative expected "
        f"return of ~{expected_return:.1f}% over a {horizon}-month horizon, consistent with its "
        f"'{risk}' risk classification. This is a rule-based estimate, not a price target."
    )


def _overall_verdict(fields: Dict, rating: str, confidence: int, risks: list, catalysts: list) -> str:
    top_risk = risks[0] if risks else "no material risk flags on current data"
    top_catalyst = catalysts[0] if catalysts else "no standout catalysts on current data"
    return (
        f"Overall verdict: {rating} ({confidence}% confidence). Key catalyst: {top_catalyst} "
        f"Key risk: {top_risk}"
    )


def build_research_report(symbol: str) -> Optional[Dict]:
    """Returns the full Module 6 JSON dict, or None if the symbol
    doesn't exist (caller maps that to a 404, same convention as
    routes/companies.py)."""
    fields = get_company_by_symbol(symbol)
    if fields is None:
        return None

    extended = get_extended_technicals(fields["symbol"])
    pledge_pct = get_latest_pledge_pct(fields["symbol"])
    p_trend = promoter_trend_fn(fields.get("shareholdingTrend") or [])

    profitability = fundamental.profitability_notes(fields)
    growth = fundamental.growth_notes(fields)
    valuation = fundamental.valuation_notes(fields)
    balance_sheet = fundamental.balance_sheet_notes(fields)

    trend_notes = technical.trend_notes(fields)
    momentum_notes = technical.momentum_notes(fields)
    volume_notes = technical.volume_notes(fields)
    ma_notes = technical.moving_average_notes(fields, extended)

    risks = risk_catalysts.risk_factors(fields, pledge_pct, p_trend)
    positives = risk_catalysts.positive_catalysts(fields, p_trend)
    negatives = risk_catalysts.negative_catalysts(fields, pledge_pct, p_trend)

    overall_score = fields.get("overallScore") or 0.0
    rating = _rating_from_score(overall_score)
    confidence = _compute_confidence(fields)

    return {
        "symbol": fields["symbol"],
        "name": fields["name"],
        "investment_summary": _investment_summary(fields, rating, confidence),
        "rating": rating,
        "confidence": confidence,
        "business_summary": _business_summary(fields),
        "fundamental_analysis": {
            "profitability": profitability,
            "growth": growth,
            "valuation": valuation,
            "balance_sheet_and_liquidity": balance_sheet,
        },
        "technical_analysis": {
            "trend": trend_notes,
            "momentum": momentum_notes,
            "volume": volume_notes,
            "moving_averages": ma_notes,
        },
        "risk_factors": risks,
        "positive_catalysts": positives,
        "negative_catalysts": negatives,
        "valuation_summary": _valuation_summary(valuation, fields),
        "outlook_6_12_month": _outlook(fields),
        "overall_verdict": _overall_verdict(fields, rating, confidence, risks, positives),
    }
