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
  volumeBreakout: boolean;

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

export type JournalEntry = {
  id: string;
  symbol: string;
  title: string;
  date: string;
  thesis: string;
  catalysts: string[];
  risks: string[];
  conviction: number; // 1-5
  targetPrice: number;
  expectedReturnPct: number;
  horizonMonths: number;
  sellTrigger: string;
  reviewDue: string;
};
