import type { DiscoverGroup, MarketIndicator, PipelineColumn, SectorPulse } from "../types";

export const discoverGroupRecords: DiscoverGroup[] = [
  {
    id: "fundamentals",
    label: "Improving Fundamentals",
    tagline: "Companies where the numbers turned a corner this quarter.",
    layout: "list",
    symbols: ["POLYCAB", "TATAMOTORS", "TRENT"],
  },
  {
    id: "technicals",
    label: "Technical Momentum",
    tagline: "Clean breakouts and healthy accumulation zones.",
    layout: "grid",
    symbols: ["HAL", "ZOMATO"],
  },
  {
    id: "smallcap",
    label: "Small & Mid Cap Watch",
    tagline: "Under-covered names with institutional footprints forming.",
    layout: "list",
    symbols: ["TATAELXSI", "PIIND"],
  },
  {
    id: "news",
    label: "In the News",
    tagline: "Companies moving on real narrative, not noise.",
    layout: "list",
    symbols: ["HDFCBANK", "TATAMOTORS"],
  },
];

export const pipelineRecords: PipelineColumn[] = [
  {
    stage: "Watching",
    hint: "Something caught your attention",
    items: [
      { symbol: "ZOMATO", note: "Watching Blinkit margin trend", ago: "1d ago" },
      { symbol: "PIIND", note: "Waiting for a technical base", ago: "3d ago" },
    ],
  },
  {
    stage: "Researching",
    hint: "Building the thesis",
    items: [{ symbol: "POLYCAB", note: "Building thesis on FMEG scale", ago: "2h ago" }],
  },
  {
    stage: "Conviction",
    hint: "Ready to hold for 6–12 months",
    items: [
      { symbol: "TRENT", note: "Thesis: Westside scalability", ago: "5d ago" },
      { symbol: "HAL", note: "Thesis: Defence CAPEX cycle", ago: "1w ago" },
    ],
  },
];

export const sectorPulseRecords: SectorPulse[] = [
  {
    sector: "Defence",
    sentiment: "Bullish",
    reason: "Order backlogs extending to FY30 across majors, budget allocation up YoY",
    topSymbols: ["HAL"],
  },
  {
    sector: "IT Services",
    sentiment: "Positive",
    reason: "EV and product-engineering design wins offsetting slower core IT spend",
    topSymbols: ["TATAELXSI"],
  },
  {
    sector: "Private Banks",
    sentiment: "Neutral",
    reason: "Merger integration and deposit mobilisation still working through",
    topSymbols: ["HDFCBANK"],
  },
  {
    sector: "Retail",
    sentiment: "Bullish",
    reason: "Premiumisation and value-fashion formats both scaling ahead of guidance",
    topSymbols: ["TRENT"],
  },
];

export const marketIndicatorRecords: MarketIndicator[] = [
  { label: "NIFTY 50", value: "22,842", change: "+0.41%", tone: "positive" },
  { label: "NIFTY MIDCAP 100", value: "50,124", change: "+0.86%", tone: "positive" },
  { label: "USD / INR", value: "83.24", change: "−0.08%", tone: "neutral" },
  { label: "India VIX", value: "11.24", change: "−2.10%", tone: "positive" },
  { label: "10Y G-Sec", value: "7.08%", change: "+2bps", tone: "neutral" },
];
