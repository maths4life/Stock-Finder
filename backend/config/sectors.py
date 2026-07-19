"""Static config for Module 7 (Weekly Market Intelligence).

Sector names are never invented here -- `companies.sector` is the single
source of truth (see db/schema.sql). This file only maps free-text news
language onto *whichever sector strings already exist in the database*.
services/sector_classifier.py reads `SECTOR_KEYWORDS` for the sectors it
knows about today and falls back to company-name/symbol matching (via
services/company_service.get_all_companies) for everything else, so a
new sector added to the DB works immediately even without a matching
entry here -- this file is an accuracy boost, not a hard dependency.

Keep keys lowercase; they're matched against lowercased article text.
"""
from typing import Dict, List

# sector (must match a real `companies.sector` value) -> keywords/phrases
# that, if present in an article's title/summary, suggest that sector.
SECTOR_KEYWORDS: Dict[str, List[str]] = {
    "Private Banks": [
        "bank", "banks", "banking", "repo rate", "rbi", "reserve bank",
        "credit growth", "npa", "casa", "interest rate", "lending rate",
        "monetary policy",
    ],
    "Defence": [
        "defence", "defense", "military", "hal", "bel", "bdl", "drdo",
        "border security", "army", "navy", "air force", "missile",
        "ordnance", "arms deal",
    ],
    "Automobiles": [
        "auto", "automobile", "automaker", "ev sales", "electric vehicle",
        "car sales", "vehicle sales", "two-wheeler", "suv", "tractor",
        "commercial vehicle",
    ],
    "Consumer Internet": [
        "food delivery", "quick commerce", "e-commerce", "ecommerce",
        "online platform", "app downloads", "gmv", "internet company",
        "digital payments",
    ],
    "IT Services": [
        "it services", "software exports", "outsourcing", "tcs",
        "infosys", "wipro", "it sector", "tech services", "ai adoption",
        "deal wins", "attrition",
    ],
    "Specialty Chemicals": [
        "chemical", "chemicals", "agrochemical", "specialty chemical",
        "crop protection", "pesticide", "fertiliser", "fertilizer",
    ],
    "Retail": [
        "retail", "retailer", "mall", "footfall", "apparel", "fashion",
        "store expansion", "consumer spending",
    ],
    "Cables & FMEG": [
        "cable", "cables", "wires", "fmeg", "electrical goods",
        "fan", "appliance maker",
    ],
}

# Cross-sector macro terms that move sentiment broadly but aren't tied to
# one sector -- used by market_summary_generator.py to still produce a
# market-wide note even when a story doesn't classify into any sector.
MACRO_KEYWORDS: List[str] = [
    "nifty", "sensex", "fii inflow", "fii outflow", "gdp growth",
    "inflation", "cpi", "wpi", "union budget", "fiscal deficit",
    "crude oil", "rupee",
]

# Simple polarity lexicon for the v1 rule-based sentiment/outlook read.
# Same "transparent, threshold-based" spirit as services/scoring_service.py
# -- not a trained sentiment model, just a documented heuristic.
POSITIVE_WORDS: List[str] = [
    "beat", "beats", "surge", "surges", "rally", "rallies", "growth",
    "grows", "profit", "record", "strong", "upgrade", "upgraded",
    "expansion", "wins", "contract", "order win", "cut rate", "rate cut",
    "improve", "improves", "improved", "gain", "gains", "boost", "jump",
    "jumps", "outperform", "positive",
]

NEGATIVE_WORDS: List[str] = [
    "miss", "misses", "falls", "fall", "decline", "declines", "slump",
    "downgrade", "downgraded", "loss", "losses", "weak", "weakness",
    "cut", "layoff", "layoffs", "strike", "probe", "fraud", "default",
    "rate hike", "hike rate", "contraction", "shrink", "shrinks",
    "warning", "recall", "penalty", "negative",
]
