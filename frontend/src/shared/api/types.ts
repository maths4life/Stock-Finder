/**
 * Domain types for the research platform.
 *
 * These types describe the shape of data as it will eventually arrive from
 * the backend (Supabase / PostgreSQL via a REST or RPC layer). UI components
 * and hooks are written against these types only — never against the mock
 * data directly — so swapping `lib/api/mock/*` for real network calls later
 * requires no changes to components.
 */

export type Signal = "positive" | "negative" | "neutral";
export type RiskLevel = "Low" | "Moderate" | "High";
export type Verdict = "Strong Conviction" | "Watch" | "Under Review" | "Pass";
export type Sentiment = "Bullish" | "Positive" | "Neutral" | "Bearish";
export type PipelineStage = "Watching" | "Researching" | "Conviction";
export type Trend = "Uptrend" | "Downtrend" | "Sideways";

export type ShareholdingRow = {
  quarter: string;
  promoter: number;
  fii: number;
  dii: number;
  public: number;
};

export type QuarterlyFinancial = {
  quarter: string;
  revenueCr: number;
  netProfitCr: number;
  ebitdaMarginPct: number;
};

export type ChecklistItem = {
  label: string;
  done: boolean;
};

export type Company = {
  symbol: string;
  exchange: string;
  name: string;
  sector: string;
  marketCap: string; // display string, e.g. "₹1.84L Cr"
  marketCapCr: number; // numeric, for filtering/sorting
  price: number;
  changePct: number;

  // Fundamentals
  pe: number;
  pb: number;
  peg: number;
  roe: number;
  roce: number;
  eps: number;
  epsGrowthPct: number;
  salesGrowthPct: number;
  profitGrowthPct: number;
  debtToEquity: number;
  currentRatio: number;
  divYield: number;
  promoterHoldingPct: number;
  fiiHoldingPct: number;
  diiHoldingPct: number;

  // Technicals
  rsi: number;
  aboveEma200: boolean;
  aboveEma50: boolean;
  goldenCross: boolean;
  volumeBreakout: boolean;
  trend: Trend;

  // Scores (0-100), computed server-side
  fundamentalScore: number;
  technicalScore: number;
  overallScore: number;

  // Discovery metadata
  riskLevel: RiskLevel;
  expectedReturnPct: number;
  investmentHorizonMonths: number;

  verdict: Verdict;
  rationale: string;
  spark: number[];

  // Deep research extras
  pros: string[];
  cons: string[];
  shareholdingTrend: ShareholdingRow[];
  quarterlyFinancials: QuarterlyFinancial[];
  checklist: ChecklistItem[];
  businessSummary: string;
  verdictSummary: string;
};

export type AnalysisRating = "Strong Buy" | "Buy" | "Hold" | "Avoid";

export type FundamentalAnalysis = {
  profitability: string[];
  growth: string[];
  valuation: string[];
  balance_sheet_and_liquidity: string[];
};

export type TechnicalAnalysisReport = {
  trend: string[];
  momentum: string[];
  volume: string[];
  moving_averages: string[];
};

/**
 * GET /company/{symbol}/analysis — Module 6, the deterministic
 * rule-based research engine (no LLM). Field names are snake_case,
 * mirroring backend/schemas/analysis.py's wire contract exactly — a
 * deliberate, documented exception to this file's usual camelCase
 * convention, not a mismatch to fix. Same "no transform layer" rule as
 * every other type here: render what the backend returns.
 */
export type CompanyAnalysis = {
  symbol: string;
  name: string;
  investment_summary: string;
  rating: AnalysisRating;
  confidence: number; // 0-100
  business_summary: string;
  fundamental_analysis: FundamentalAnalysis;
  technical_analysis: TechnicalAnalysisReport;
  risk_factors: string[];
  positive_catalysts: string[];
  negative_catalysts: string[];
  valuation_summary: string;
  outlook_6_12_month: string;
  overall_verdict: string;
};

/** GET /company/{symbol}/prices row — mirrors backend/schemas/technical.py's PriceBar exactly. */
export type PriceBar = {
  date: string; // ISO date, e.g. "2026-06-30"
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type PriceRange = "1M" | "3M" | "6M" | "1Y" | "5Y" | "ALL";

export type CompanySort =
  | "overallScore"
  | "fundamentalScore"
  | "technicalScore"
  | "changePct"
  | "marketCapCr"
  | "pe"
  | "name";

export type SortDirection = "asc" | "desc";

/** Filter/query params a real `/companies` endpoint would accept as query string params. */
export type CompanyQueryParams = {
  search?: string;
  sector?: string;
  riskLevel?: RiskLevel | "Any";
  horizon?: "Any" | "short" | "medium" | "long";
  minRoe?: number;
  minRoce?: number;
  minEpsGrowth?: number;
  minSalesGrowth?: number;
  maxPe?: number;
  maxDebtToEquity?: number;
  minPromoterHolding?: number;
  aboveEma200?: boolean;
  aboveEma50?: boolean;
  volumeBreakout?: boolean;
  sort?: CompanySort;
  sortDirection?: SortDirection;
  page?: number;
  pageSize?: number;
};

/** Generic paginated envelope — mirrors what a Postgres-backed API would return. */
export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type DiscoverGroup = {
  id: string;
  label: string;
  tagline: string;
  layout: "grid" | "list";
  symbols: string[];
};

export type PipelineItem = {
  symbol: string;
  note: string;
  ago: string;
};

export type PipelineColumn = {
  stage: PipelineStage;
  hint: string;
  items: PipelineItem[];
};

export type SectorPulse = {
  sector: string;
  sentiment: Sentiment;
  reason: string;
  topSymbols: string[];
};

export type MarketIndicator = {
  label: string;
  value: string;
  change: string;
  tone: Signal;
};

/** "Positive" | "Neutral" | "Negative" -- distinct from `Sentiment`
 * above (Bullish/Positive/Neutral/Bearish), which is the Discover page's
 * score-derived sector pulse scale. Module 7's outlook is news-derived,
 * so it gets its own type rather than overloading `Sentiment`. */
export type SectorOutlook = "Positive" | "Neutral" | "Negative";

export type WeeklyMarketEvent = {
  headline: string;
  whyItMatters: string;
  expectedImpact: string;
  sourceUrl: string;
};

/**
 * GET /company/{symbol}/weekly-market-intelligence -- Module 7. Mirrors
 * backend/schemas/weekly_intelligence.py's `WeeklyMarketIntelligence`
 * exactly, camelCase (this endpoint follows the project's usual
 * camelCase convention, not Module 6's documented snake_case exception).
 * `sectorResearchCandidates` reuses the exact `Company` shape `GET
 * /companies` returns, so the Research page can render it with the
 * existing `CompanyRow` component -- no new list component needed.
 */
export type WeeklyMarketIntelligence = {
  symbol: string;
  sector: string;
  sectorOutlook: SectorOutlook;
  weekStartDate: string; // ISO date
  weekEndDate: string; // ISO date
  weeklySummary: string;
  importantEvents: WeeklyMarketEvent[];
  marketImpact: string;
  sectorResearchCandidates: Company[];
  hasCoverage: boolean;
  lastRefreshedAt: string | null;
};

/**
 * Mirrors backend/schemas/journal.py's JournalEntry exactly — camelCase,
 * fields lifted directly from the `journal_entries` table in
 * db/schema.sql. All fields besides `id`/`symbol`/`thesis`/`createdAt`
 * are optional because the table allows them to be null.
 */
export type JournalEntry = {
  id: string;
  symbol: string;
  title: string | null;
  thesis: string;
  fundamentalReasons: string | null;
  technicalReasons: string | null;
  sectorReasons: string | null;
  macroReasons: string | null;
  personalNotes: string | null;
  sellTrigger: string | null;
  assumptions: string | null;
  risksAccepted: string | null;
  targetPrice: number | null;
  expectedReturnPct: number | null;
  horizonMonths: number | null;
  confidenceLevel: number | null; // 1-5
  createdAt: string; // ISO datetime
  reviewDueAt: string | null; // ISO datetime, auto-set from createdAt + horizonMonths
};

/** Body for POST/PUT /journal-entries — every field but `symbol`/`thesis` optional. */
export type JournalEntryInput = {
  symbol: string;
  title?: string | null;
  thesis: string;
  fundamentalReasons?: string | null;
  technicalReasons?: string | null;
  sectorReasons?: string | null;
  macroReasons?: string | null;
  personalNotes?: string | null;
  sellTrigger?: string | null;
  assumptions?: string | null;
  risksAccepted?: string | null;
  targetPrice?: number | null;
  expectedReturnPct?: number | null;
  horizonMonths?: number | null;
  confidenceLevel?: number | null;
};
