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

/** Research page's Valuation Cards. `null` fields have no source
 * anywhere in the backend schema (see backend/db/schema.sql) and render
 * as N/A rather than a fabricated number — see
 * backend/services/company_service.py's `_valuation_metrics`. */
export type ValuationMetrics = {
  marketCap: string | null;
  marketCapCr: number | null;
  enterpriseValueCr: number | null;
  pe: number | null;
  forwardPe: number | null;
  peg: number | null;
  pb: number | null;
  evEbitda: number | null;
  divYield: number | null;
  beta: number | null;
  sharesOutstanding: number | null;
  freeFloatPct: number | null;
  bookValuePerShare: number | null;
};

/** Research page's Support & Resistance section. pivot / support levels /
 * resistance levels are a standard floor-trader pivot off the latest
 * day's OHLC; vwap/high52w/low52w are reused straight from
 * technical_snapshot. See
 * backend/services/technical_service.py's get_support_resistance. */
export type PivotLevels = {
  pivot: number | null;
  support1: number | null;
  support2: number | null;
  resistance1: number | null;
  resistance2: number | null;
  vwap: number | null;
  high52w: number | null;
  low52w: number | null;
};

export type ComparisonRow = {
  metric: string;
  current: number | null;
  previous: number | null;
  diff: number | null;
  growthPct: number | null;
};

/** Research page's Quarterly/Annual Financial Comparison tables.
 * `currentLabel`/`previousLabel` are the real period labels the backend
 * found (or null when that period doesn't exist for this company) — do
 * not hardcode "Current Quarter"/"Previous Quarter" as column headers,
 * use these. Diff/Growth% are computed server-side, not here — see
 * backend/services/fundamental_service.py. */
export type ComparisonTable = {
  currentLabel: string | null;
  previousLabel: string | null;
  rows: ComparisonRow[];
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
  shareholdingTrend: ShareholdingRow[];
  quarterlyFinancials: QuarterlyFinancial[];
  checklist: ChecklistItem[];

  // Bloomberg/TIKR-style structured data (Company Research page redesign)
  valuation: ValuationMetrics;
  supportResistance: PivotLevels;
  quarterlyComparison: ComparisonTable;
  annualComparison: ComparisonTable;
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
  id: string;
  symbol: string;
  note: string;
  ago: string;
};

export type PipelineColumn = {
  stage: PipelineStage;
  hint: string;
  items: PipelineItem[];
};

/**
 * Mirrors backend/schemas/pipeline.py's PipelineItemDetail — the flat,
 * per-item shape returned by the new /pipeline-items CRUD endpoints
 * (Milestone 3). Distinct from `PipelineItem` above, which is the
 * grouped-by-stage shape returned by the pre-existing `GET /pipeline`.
 */
export type PipelineItemDetail = {
  id: string;
  symbol: string;
  stage: PipelineStage;
  note: string | null;
  updatedAt: string; // ISO datetime
};

/** Body for POST/PUT /pipeline-items. */
export type PipelineItemInput = {
  symbol: string;
  stage: PipelineStage;
  note?: string | null;
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

/** "yes" | "partially" | "no" — mirrors backend/schemas/journal_review.py's ThesisOutcome. */
export type ThesisOutcome = "yes" | "partially" | "no";

/**
 * Mirrors backend/schemas/journal_review.py's JournalReview exactly —
 * camelCase, fields lifted directly from the `journal_reviews` table in
 * db/schema.sql (TD-017). One `JournalEntry` (via `entryId`) can have
 * zero or more reviews — this is the review/retrospective half of the
 * journal. `aiComparisonSummary` is a plain, optional, freely-writable
 * text field; no auto-generation logic exists anywhere in the app for
 * it — see `DECISIONS.md`.
 */
export type JournalReview = {
  id: string;
  entryId: string;
  reviewedAt: string; // ISO datetime, auto-set on create, immutable after
  thesisPlayedOut: ThesisOutcome | null;
  whatActuallyHappened: string | null;
  mistakes: string | null;
  lessons: string | null;
  wouldBuyAgain: boolean | null;
  aiComparisonSummary: string | null;
};

/** Body for POST /journal-reviews — only `entryId` is required. */
export type JournalReviewInput = {
  entryId: string;
  thesisPlayedOut?: ThesisOutcome | null;
  whatActuallyHappened?: string | null;
  mistakes?: string | null;
  lessons?: string | null;
  wouldBuyAgain?: boolean | null;
  aiComparisonSummary?: string | null;
};

/**
 * Body for PUT /journal-reviews/{id}. `entryId` is intentionally
 * excluded — a review's parent entry is immutable after creation (same
 * treatment as `journal_entries.created_at`) — unlike `JournalEntryInput`,
 * which is reused as-is for both create and update since
 * `journal_entries.symbol` IS editable.
 */
export type JournalReviewUpdateInput = Omit<JournalReviewInput, "entryId">;
