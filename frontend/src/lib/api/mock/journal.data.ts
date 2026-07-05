import type { JournalEntry } from "../types";

export const journalEntryRecords: JournalEntry[] = [
  {
    id: "je_trent_01",
    symbol: "TRENT",
    title: "Westside is the real business, Zudio is the option value",
    date: "12 Oct",
    thesis:
      "SSSG has stayed above 20% for three quarters. Zudio economics look genuinely different from Reliance Retail. Willing to hold through one bad quarter.",
    catalysts: ["Q3 SSSG print", "Zudio store adds > 200", "Inventory turns holding"],
    risks: ["Valuation leaves no room for a miss", "Cotton price shock"],
    conviction: 4,
    targetPrice: 5200,
    expectedReturnPct: 30,
    horizonMonths: 12,
    sellTrigger: "SSSG drops below 10% for two consecutive quarters, or Zudio store adds stall.",
    reviewDue: "12 Oct next year",
  },
  {
    id: "je_hal_01",
    symbol: "HAL",
    title: "Defence CAPEX cycle is early, not late",
    date: "28 Sep",
    thesis:
      "Order backlog visibility to FY30. The multiple looks expensive, but consensus is still under-estimating execution rate on Tejas and LCH.",
    catalysts: ["Tejas Mk1A delivery ramp", "Multi-role helicopter order"],
    risks: ["Execution slippage", "Export orders slower than expected"],
    conviction: 5,
    targetPrice: 6000,
    expectedReturnPct: 28,
    horizonMonths: 12,
    sellTrigger: "Order backlog growth stalls, or a major delivery is delayed beyond two quarters.",
    reviewDue: "28 Sep next year",
  },
];
