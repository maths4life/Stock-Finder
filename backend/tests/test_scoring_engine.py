"""Unit tests for analysis/scoring_engine.py (closes TD-005, TD-018 prep).

Run from the repo root with:
    pytest backend/tests/test_scoring_engine.py -v

Zero dependencies beyond pytest -- no DB, no network, no mocks needed.
The scoring engine is a pure function: same input always produces same output.
"""
import sys
import os

# Ensure `backend/` is on the Python path so imports work without installing the package.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from analysis.scoring_engine import (
    compute_scores,
    score_fundamentals,
    score_technicals,
    verdict_for,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _fund_score(m: dict) -> float:
    return score_fundamentals(m)["score"]


def _tech_score(m: dict) -> float:
    return score_technicals(m)["score"]


def _find_metric(breakdown: list, metric_name: str):
    """Case-insensitive substring match on the metric name."""
    needle = metric_name.lower()
    return next((x for x in breakdown if needle in x["metric"].lower()), None)


# ---------------------------------------------------------------------------
# Missing-data / graceful degradation
# ---------------------------------------------------------------------------

class TestMissingData:
    def test_empty_metrics_returns_50_overall(self):
        result = compute_scores({})
        assert result["overallScore"] == 50.0

    def test_empty_fundamental_score_is_50(self):
        assert _fund_score({}) == 50.0

    def test_empty_technical_score_is_50(self):
        assert _tech_score({}) == 50.0

    def test_unavailable_metrics_have_zero_max(self):
        result = score_fundamentals({})
        for metric in result["breakdown"]:
            assert metric["maxScore"] == 0

    def test_partial_data_doesnt_zero_overall(self):
        result = compute_scores({"roe": 20.0})
        assert result["overallScore"] > 0

    def test_only_technical_data_uses_technical_only(self):
        m = {"rsi": 55, "aboveEma200": True}
        result = compute_scores(m)
        assert result["overallScore"] == result["technicalScore"]


# ---------------------------------------------------------------------------
# ROE
# ---------------------------------------------------------------------------

class TestROE:
    def test_exceptional_roe(self):
        r = _find_metric(score_fundamentals({"roe": 30})["breakdown"], "ROE")
        assert r["score"] == 12 and r["passed"] is True

    def test_strong_roe(self):
        r = _find_metric(score_fundamentals({"roe": 22})["breakdown"], "ROE")
        assert r["score"] == 10 and r["passed"] is True

    def test_threshold_roe(self):
        r = _find_metric(score_fundamentals({"roe": 15})["breakdown"], "ROE")
        assert r["score"] == 8 and r["passed"] is True

    def test_below_threshold_roe(self):
        r = _find_metric(score_fundamentals({"roe": 11})["breakdown"], "ROE")
        assert r["score"] == 5 and r["passed"] is False

    def test_negative_roe(self):
        r = _find_metric(score_fundamentals({"roe": -5})["breakdown"], "ROE")
        assert r["score"] == 0 and r["passed"] is False

    def test_none_roe_excluded(self):
        r = _find_metric(score_fundamentals({"roe": None})["breakdown"], "ROE")
        assert r["maxScore"] == 0


# ---------------------------------------------------------------------------
# ROCE
# ---------------------------------------------------------------------------

class TestROCE:
    def test_high_roce(self):
        r = _find_metric(score_fundamentals({"roce": 25})["breakdown"], "ROCE")
        assert r["score"] == 10

    def test_threshold_roce(self):
        r = _find_metric(score_fundamentals({"roce": 15})["breakdown"], "ROCE")
        assert r["score"] == 8

    def test_negative_roce(self):
        r = _find_metric(score_fundamentals({"roce": -10})["breakdown"], "ROCE")
        assert r["score"] == 0


# ---------------------------------------------------------------------------
# Debt/Equity
# ---------------------------------------------------------------------------

class TestDebtToEquity:
    def test_very_low_de(self):
        r = _find_metric(score_fundamentals({"debtToEquity": 0.2})["breakdown"], "Debt")
        assert r["score"] == 12

    def test_moderate_de(self):
        r = _find_metric(score_fundamentals({"debtToEquity": 0.8})["breakdown"], "Debt")
        assert r["score"] == 6

    def test_high_de_penalized(self):
        r = _find_metric(score_fundamentals({"debtToEquity": 2.0})["breakdown"], "Debt")
        assert r["score"] == 0 and r["passed"] is False

    def test_financial_sector_lenient(self):
        m = score_fundamentals({"debtToEquity": 6.0, "sector": "Financial Services"})
        r = _find_metric(m["breakdown"], "Debt")
        assert r["score"] >= 10


# ---------------------------------------------------------------------------
# P/E scoring
# ---------------------------------------------------------------------------

class TestPE:
    def test_deep_discount_vs_sector(self):
        r = _find_metric(score_fundamentals({"pe": 10, "sectorAvgPe": 20})["breakdown"], "P/E")
        assert r["score"] == 10

    def test_at_premium_vs_sector(self):
        r = _find_metric(score_fundamentals({"pe": 35, "sectorAvgPe": 20})["breakdown"], "P/E")
        assert r["score"] == 0

    def test_absolute_fallback_cheap(self):
        r = _find_metric(score_fundamentals({"pe": 12})["breakdown"], "P/E")
        assert r["score"] == 8

    def test_negative_pe(self):
        r = _find_metric(score_fundamentals({"pe": -5})["breakdown"], "P/E")
        assert r["score"] == 0 and r["passed"] is False


# ---------------------------------------------------------------------------
# Growth
# ---------------------------------------------------------------------------

class TestGrowth:
    def test_strong_revenue_growth(self):
        r = _find_metric(score_fundamentals({"salesGrowthPct": 22})["breakdown"], "Revenue")
        assert r["score"] == 10

    def test_negative_revenue(self):
        r = _find_metric(score_fundamentals({"salesGrowthPct": -5})["breakdown"], "Revenue")
        assert r["score"] == 0

    def test_strong_profit_growth(self):
        r = _find_metric(score_fundamentals({"profitGrowthPct": 28})["breakdown"], "Profit")
        assert r["score"] == 12

    def test_negative_profit_growth(self):
        r = _find_metric(score_fundamentals({"profitGrowthPct": -10})["breakdown"], "Profit")
        assert r["score"] == 0


# ---------------------------------------------------------------------------
# Technicals
# ---------------------------------------------------------------------------

class TestTechnicals:
    def test_strong_rsi_scores(self):
        r = _find_metric(score_technicals({"rsi": 60})["breakdown"], "RSI")
        assert r["score"] > 0

    def test_overbought_rsi_penalized(self):
        r = _find_metric(score_technicals({"rsi": 82})["breakdown"], "RSI")
        assert r["passed"] is False

    def test_oversold_rsi_penalized(self):
        r = _find_metric(score_technicals({"rsi": 25})["breakdown"], "RSI")
        assert r["passed"] is False

    def test_above_200dma(self):
        r = _find_metric(score_technicals({"aboveEma200": True})["breakdown"], "200")
        assert r["score"] > 0 and r["passed"] is True

    def test_below_200dma(self):
        r = _find_metric(score_technicals({"aboveEma200": False})["breakdown"], "200")
        assert r["passed"] is False

    def test_golden_cross(self):
        r = _find_metric(score_technicals({"goldenCross": True})["breakdown"], "Cross")
        assert r["score"] > 0 and r["passed"] is True

    def test_death_cross(self):
        r = _find_metric(score_technicals({"deathCross": True})["breakdown"], "Cross")
        assert r["passed"] is False

    def test_volume_breakout(self):
        r = _find_metric(score_technicals({"volumeBreakout": True})["breakdown"], "Volume")
        assert r["score"] > 0 and r["passed"] is True

    def test_52w_midrange(self):
        r = _find_metric(score_technicals({"price": 155, "low52w": 100, "high52w": 200})["breakdown"], "52")
        assert r["score"] >= 7

    def test_52w_near_low(self):
        r = _find_metric(score_technicals({"price": 105, "low52w": 100, "high52w": 200})["breakdown"], "52")
        assert r["passed"] is False


# ---------------------------------------------------------------------------
# compute_scores() aggregation
# ---------------------------------------------------------------------------

class TestComputeScores:
    def test_structure_complete(self):
        result = compute_scores({"roe": 20, "rsi": 60})
        for key in ("fundamentalScore", "technicalScore", "overallScore", "weighting", "scoreBreakdown"):
            assert key in result

    def test_overall_is_weighted_combination(self):
        result = compute_scores({"roe": 20, "rsi": 60})
        expected = 0.60 * result["fundamentalScore"] + 0.40 * result["technicalScore"]
        assert abs(result["overallScore"] - expected) < 0.2

    def test_overall_bounded_0_100(self):
        for roe in [-50, 0, 15, 50, 100]:
            for rsi in [10, 50, 90]:
                result = compute_scores({"roe": roe, "rsi": rsi})
                assert 0 <= result["overallScore"] <= 100

    def test_good_company_beats_bad(self):
        good = compute_scores({
            "roe": 30, "roce": 25, "salesGrowthPct": 20, "profitGrowthPct": 25,
            "debtToEquity": 0.2, "pe": 20, "sectorAvgPe": 30,
            "rsi": 60, "aboveEma200": True, "goldenCross": True,
        })
        bad = compute_scores({
            "roe": -5, "roce": -2, "salesGrowthPct": -10, "profitGrowthPct": -20,
            "debtToEquity": 3.0, "pe": 80, "sectorAvgPe": 30,
            "rsi": 85, "aboveEma200": False, "deathCross": True,
        })
        assert good["overallScore"] > bad["overallScore"]

    def test_only_fundamentals(self):
        result = compute_scores({"roe": 25, "roce": 20})
        assert result["overallScore"] == result["fundamentalScore"]

    def test_only_technicals(self):
        result = compute_scores({"rsi": 55, "aboveEma200": True})
        assert result["overallScore"] == result["technicalScore"]


# ---------------------------------------------------------------------------
# verdict_for()
# ---------------------------------------------------------------------------

class TestVerdictFor:
    def test_strong_conviction(self):
        assert verdict_for(75) == "Strong Conviction"
        assert verdict_for(90) == "Strong Conviction"

    def test_watch(self):
        assert verdict_for(60) == "Watch"
        assert verdict_for(74) == "Watch"

    def test_under_review(self):
        assert verdict_for(45) == "Under Review"
        assert verdict_for(59) == "Under Review"

    def test_pass(self):
        assert verdict_for(0) == "Pass"
        assert verdict_for(44) == "Pass"

    def test_boundary_75(self):
        assert verdict_for(75.0) == "Strong Conviction"

    def test_boundary_60(self):
        assert verdict_for(60.0) == "Watch"

    def test_boundary_45(self):
        assert verdict_for(45.0) == "Under Review"
