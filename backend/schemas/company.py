"""Pydantic response models for the Companies module (Module 1).

Split into a lightweight `CompanyListItem` (GET /companies) and a full
`Company` (GET /company/{symbol}) — see API_CONTRACT.md for why. The two
share `CompanyBase` so the list/detail fields can never drift apart by
accident.
"""
from typing import List, Optional

from pydantic import BaseModel, Field


class ShareholdingRow(BaseModel):
    """One reporting period's shareholding breakdown.

    `promoter`/`fii`/`dii`/`public` are the original 4-way split
    (kept non-optional — every row has always had these). `mutualFunds`/
    `government`/`others` are the Module 7.5 additions: NSE's real
    disclosure reports these as their own categories, but the
    yfinance-approximation fallback (see ingest/fetch_shareholding.py)
    has no field that maps to any of them — Optional/None here means
    "this source didn't report this category", never a fabricated 0.
    """

    quarter: str
    promoter: float
    fii: float
    dii: float
    public: float
    mutualFunds: Optional[float] = None
    government: Optional[float] = None
    others: Optional[float] = None


class ShareholdingCategoryChange(BaseModel):
    """One row of the Module 7.5 shareholding summary — a single
    category's latest vs. previous reporting-period holding and the
    percentage-point change between them (e.g. Promoter 52.34% now vs.
    52.10% last quarter -> changePct = +0.24). Not a growth-rate percent
    (that would be misleading for a value that's already a percentage)."""

    category: str
    latest: Optional[float] = None
    previous: Optional[float] = None
    changePct: Optional[float] = None


class ShareholdingSummary(BaseModel):
    """Module 7.5 — 'Also include: Latest reporting quarter, Previous
    reporting quarter, Percentage change'. `source` is 'nse' (a real
    disclosure) or 'yfinance_approx' (see ingest/fetch_shareholding.py),
    surfaced so the frontend/consumer can tell which kind of number
    they're looking at; None if this company has no shareholding data
    at all yet."""

    latestQuarter: Optional[str] = None
    previousQuarter: Optional[str] = None
    categories: List[ShareholdingCategoryChange] = Field(default_factory=list)
    source: Optional[str] = None


class QuarterlyFinancial(BaseModel):
    quarter: str
    revenueCr: float
    netProfitCr: float
    ebitdaMarginPct: float


class ChecklistItem(BaseModel):
    label: str
    done: bool


class ValuationMetrics(BaseModel):
    """Research page's Valuation Cards. Optional/None fields have no
    source anywhere in the schema (see db/schema.sql) and are rendered
    as N/A by the frontend rather than fabricated -- see
    company_service.py's `_valuation_metrics` for exactly which fields
    are reused vs. derived vs. genuinely unavailable."""

    marketCap: Optional[str] = None
    marketCapCr: Optional[float] = None
    enterpriseValueCr: Optional[float] = None
    pe: Optional[float] = None
    forwardPe: Optional[float] = None
    peg: Optional[float] = None
    pb: Optional[float] = None
    evEbitda: Optional[float] = None
    divYield: Optional[float] = None
    beta: Optional[float] = None
    sharesOutstanding: Optional[float] = None
    freeFloatPct: Optional[float] = None
    bookValuePerShare: Optional[float] = None


class PivotLevels(BaseModel):
    """Research page's Support & Resistance section. pivot/support*/
    resistance* are a standard floor-trader pivot computed off the most
    recent day's OHLC (see technical_service.get_support_resistance);
    vwap/high52w/low52w are read straight off technical_snapshot, which
    ingest/compute_technicals.py already writes."""

    pivot: Optional[float] = None
    support1: Optional[float] = None
    support2: Optional[float] = None
    resistance1: Optional[float] = None
    resistance2: Optional[float] = None
    vwap: Optional[float] = None
    high52w: Optional[float] = None
    low52w: Optional[float] = None


class ComparisonRow(BaseModel):
    metric: str
    current: Optional[float] = None
    previous: Optional[float] = None
    diff: Optional[float] = None
    growthPct: Optional[float] = None


class ComparisonTable(BaseModel):
    """Research page's Quarterly/Annual Financial Comparison tables.
    `currentLabel`/`previousLabel` are the real period labels from
    financials_quarterly (e.g. '2024-03-31'), None when that period
    doesn't exist for this company. Every row where the underlying
    column has no data for a period is None -- see
    fundamental_service.get_quarterly_comparison/get_annual_comparison."""

    currentLabel: Optional[str] = None
    previousLabel: Optional[str] = None
    rows: List[ComparisonRow] = Field(default_factory=list)


class ScoreMetric(BaseModel):
    """One row of the "Why this score?" breakdown — mirrors
    analysis/scoring_engine.ScoreMetric exactly. `value` is the
    company's real underlying reading (a number, a bool, a short label
    like "Golden Cross", or None if the metric had no data). `score`/
    `maxScore` are in the same units the metric was weighted in, not
    percentages — see analysis/scoring_engine.py's module docstring for
    the full points table."""

    metric: str
    value: Optional[float | bool | str] = None
    score: float
    maxScore: float
    passed: bool
    reason: str


class ScoreBreakdown(BaseModel):
    fundamental: List[ScoreMetric] = Field(default_factory=list)
    technical: List[ScoreMetric] = Field(default_factory=list)


class ScoreWeighting(BaseModel):
    fundamental: float
    technical: float


class CompanyBase(BaseModel):
    symbol: str
    exchange: str
    name: str
    sector: str

    marketCap: str
    marketCapCr: float
    price: float
    changePct: float

    # Fundamentals
    pe: float
    pb: float
    peg: float
    roe: float
    roce: float
    eps: float
    epsGrowthPct: float
    salesGrowthPct: float
    profitGrowthPct: float
    debtToEquity: float
    currentRatio: float
    divYield: float
    promoterHoldingPct: float
    fiiHoldingPct: float
    diiHoldingPct: float

    # Technicals
    rsi: float
    aboveEma200: bool
    aboveEma50: bool
    goldenCross: bool
    deathCross: bool
    volumeBreakout: bool
    trend: str  # "Uptrend" | "Downtrend" | "Sideways" — see scoring_service.trend_label

    # Scores (0-100)
    fundamentalScore: float
    technicalScore: float
    overallScore: float

    # Discovery metadata (placeholder heuristics — see API_CONTRACT.md
    # and services/scoring_service.py)
    riskLevel: str
    expectedReturnPct: float
    investmentHorizonMonths: int

    verdict: str
    rationale: str
    spark: List[float] = Field(default_factory=list)


class CompanyListItem(CompanyBase):
    """Returned by GET /companies. Deliberately excludes the deep-research
    fields below — no list/search view renders them, and Module 3 will
    make those genuinely expensive (financials/shareholding *history*,
    not a single-row snapshot), so keeping them off the list endpoint
    keeps GET /companies cheap regardless of what Module 3 adds."""


class TrendSignal(BaseModel):
    """One directional trend signal over the last 4 quarters, computed by
    financial_statements_service.get_trend_signals(). `direction` is one of:
    Accelerating | Improving | Steady | Decelerating | Contracting | Insufficient.
    `delta` is the raw difference (newest minus oldest, same units as series).
    `unit` is 'Cr' for absolute amounts or '%' for margin metrics."""

    metric: str
    direction: str
    delta: Optional[float] = None
    unit: str = ""
    series: List[Optional[float]] = Field(default_factory=list)


class HistoricalPeRange(BaseModel):
    """Approximate historical P/E band computed from annual EPS (financial_statements)
    and annual OHLC (prices_daily) — see financial_statements_service.get_historical_pe_range.
    None fields mean the data didn't exist (e.g. company is too new)."""

    pe_min: Optional[float] = None
    pe_max: Optional[float] = None
    pe_median: Optional[float] = None
    current_pe: Optional[float] = None
    percentile: Optional[int] = None
    years: int = 0


class Company(CompanyBase):
    """Returned by GET /company/{symbol} — the complete object, including
    the deep-research fields Module 3 will populate."""

    shareholdingTrend: List[ShareholdingRow] = Field(default_factory=list)
    shareholdingSummary: ShareholdingSummary = Field(default_factory=ShareholdingSummary)
    quarterlyFinancials: List[QuarterlyFinancial] = Field(default_factory=list)
    checklist: List[ChecklistItem] = Field(default_factory=list)

    valuation: ValuationMetrics = Field(default_factory=ValuationMetrics)
    supportResistance: PivotLevels = Field(default_factory=PivotLevels)
    quarterlyComparison: ComparisonTable = Field(default_factory=ComparisonTable)
    annualComparison: ComparisonTable = Field(default_factory=ComparisonTable)
    trendSignals: List[TrendSignal] = Field(default_factory=list)
    historicalPeRange: Optional[HistoricalPeRange] = None

    # "Why this score?" — full transparency for fundamentalScore /
    # technicalScore / overallScore above. Every entry traces back to a
    # real stored metric; see analysis/scoring_engine.py.
    weighting: ScoreWeighting = Field(default_factory=lambda: ScoreWeighting(fundamental=0.6, technical=0.4))
    scoreBreakdown: ScoreBreakdown = Field(default_factory=ScoreBreakdown)


class PaginatedCompanies(BaseModel):
    """Returned by GET /companies (Module 4). Mirrors
    frontend/src/shared/api/types.ts's `Paginated<Company>` exactly —
    keep the two in sync if either changes."""

    items: List[CompanyListItem]
    page: int
    pageSize: int
    total: int
    totalPages: int
