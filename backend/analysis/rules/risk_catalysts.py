"""Risk-factor / positive-catalyst / negative-catalyst rules for Module 6.

Same pattern as fundamental.py and technical.py: plain threshold reads
of already-computed fields, plus the two extra real data points
analysis/helpers.py exposes (pledge_pct, promoter holding direction).
"""
from typing import Dict, List, Optional


def risk_factors(fields: Dict, pledge_pct: Optional[float], promoter_trend: Dict) -> List[str]:
    risks: List[str] = []

    debt_to_equity = fields.get("debtToEquity") or 0.0
    if debt_to_equity > 1.5:
        risks.append(f"High leverage — Debt/Equity of {debt_to_equity:.2f}.")

    current_ratio = fields.get("currentRatio") or 0.0
    if 0 < current_ratio < 1:
        risks.append(f"Liquidity is tight — current ratio of {current_ratio:.2f} is below 1.")

    rsi = fields.get("rsi") or 0.0
    if rsi > 70:
        risks.append(f"RSI at {rsi:.0f} is overbought, raising near-term pullback risk.")

    pe = fields.get("pe") or 0.0
    if pe > 40:
        risks.append(f"Valuation is rich — P/E of {pe:.1f}x versus the broader market.")

    profit_growth = fields.get("profitGrowthPct") or 0.0
    if profit_growth < 0:
        risks.append(f"Profit contracted {abs(profit_growth):.1f}% YoY.")

    sales_growth = fields.get("salesGrowthPct") or 0.0
    if sales_growth < 0:
        risks.append(f"Revenue contracted {abs(sales_growth):.1f}% YoY.")

    if pledge_pct is not None and pledge_pct > 0:
        risks.append(f"{pledge_pct:.1f}% of promoter holding is pledged, a leverage/governance risk.")

    if promoter_trend.get("direction") == "decreasing":
        risks.append(
            f"Promoter holding has declined from {promoter_trend['previous']:.1f}% to "
            f"{promoter_trend['latest']:.1f}% in the last reported quarter."
        )

    if not fields.get("aboveEma200") and not fields.get("aboveEma50"):
        risks.append("Price is below both key moving averages, indicating an established downtrend.")

    if not risks:
        risks.append("No standout risk flags clear the rule thresholds on the data currently available.")

    return risks


def positive_catalysts(fields: Dict, promoter_trend: Dict) -> List[str]:
    catalysts: List[str] = []

    overall_score = fields.get("overallScore") or 0.0
    if overall_score > 85:
        catalysts.append(f"Overall score of {overall_score:.0f}/100 reflects strong conviction across fundamentals and technicals.")

    technical_score = fields.get("technicalScore") or 0.0
    if technical_score > 80:
        catalysts.append(f"Technical score of {technical_score:.0f}/100 points to strong price momentum.")

    fundamental_score = fields.get("fundamentalScore") or 0.0
    if fundamental_score > 80:
        catalysts.append(f"Fundamental score of {fundamental_score:.0f}/100 points to strong underlying business quality.")

    if fields.get("goldenCross"):
        catalysts.append("A recent golden cross is a constructive technical signal.")

    if promoter_trend.get("direction") == "increasing":
        catalysts.append(
            f"Promoter holding has risen from {promoter_trend['previous']:.1f}% to "
            f"{promoter_trend['latest']:.1f}%, signaling promoter confidence."
        )

    roe = fields.get("roe") or 0.0
    profit_growth = fields.get("profitGrowthPct") or 0.0
    if roe > 18 and profit_growth > 15:
        catalysts.append(f"High ROE ({roe:.1f}%) paired with profit growth of {profit_growth:.1f}% suggests durable compounding.")

    if fields.get("volumeBreakout"):
        catalysts.append("A volume breakout above the 20-day average suggests fresh buying interest.")

    div_yield = fields.get("divYield") or 0.0
    if div_yield > 3:
        catalysts.append(f"Dividend yield of {div_yield:.1f}% adds a downside cushion.")

    if not catalysts:
        catalysts.append("No standout positive catalysts clear the rule thresholds on the data currently available.")

    return catalysts


def negative_catalysts(fields: Dict, pledge_pct: Optional[float], promoter_trend: Dict) -> List[str]:
    catalysts: List[str] = []

    overall_score = fields.get("overallScore") or 0.0
    if overall_score < 40:
        catalysts.append(f"Overall score of {overall_score:.0f}/100 reflects weak conviction on current data.")

    rsi = fields.get("rsi") or 0.0
    if rsi > 70:
        catalysts.append(f"RSI at {rsi:.0f} is overbought, a headwind to further near-term upside.")

    debt_to_equity = fields.get("debtToEquity") or 0.0
    if debt_to_equity > 1.5:
        catalysts.append(f"Elevated Debt/Equity of {debt_to_equity:.2f} is a leverage overhang.")

    profit_growth = fields.get("profitGrowthPct") or 0.0
    if profit_growth < 0:
        catalysts.append("Earnings contraction is a drag on sentiment.")

    if promoter_trend.get("direction") == "decreasing":
        catalysts.append("Declining promoter holding can weigh on investor confidence.")

    if pledge_pct is not None and pledge_pct > 0:
        catalysts.append(f"{pledge_pct:.1f}% pledged promoter holding is a governance overhang.")

    if not fields.get("aboveEma200") and not fields.get("aboveEma50"):
        catalysts.append("Price remains below both key moving averages, keeping the technical trend negative.")

    if not catalysts:
        catalysts.append("No standout negative catalysts clear the rule thresholds on the data currently available.")

    return catalysts
