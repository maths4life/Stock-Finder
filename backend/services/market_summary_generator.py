"""Module 7 -- turns a sector's grouped, classified articles for the week
into the structured "Weekly Sector Intelligence" the spec asks for
(outlook, prose summary, major events).

Nothing here calls an LLM or any external AI API -- same documented
choice as analysis/engine.py (Module 6): every sentence is a template
filled from real, already-computed inputs (article counts, polarity
scores, importance scores), not generated prose. If a real
summarization model is added later, this module's public functions
(`sector_outlook_from_articles`, `weekly_sector_summary`,
`build_major_events`) are the only seam that needs to change --
callers (weekly_market_intelligence.py) don't need to know how the
text was produced.
"""
from __future__ import annotations

from typing import Dict, List

from services.news_provider import RawArticle
from services.sector_classifier import importance_score, polarity_score

_OUTLOOK_POSITIVE = "Positive"
_OUTLOOK_NEUTRAL = "Neutral"
_OUTLOOK_NEGATIVE = "Negative"

MAX_MAJOR_EVENTS = 5


def sector_outlook_from_articles(articles: List[RawArticle]) -> str:
    """v1 rule: sum each article's polarity score, weighted by its
    importance score, then threshold. Same transparent-rule spirit as
    scoring_service.risk_level -- a documented heuristic, not a real
    sentiment model."""
    if not articles:
        return _OUTLOOK_NEUTRAL

    weighted_polarity = sum(polarity_score(a) * importance_score(a) for a in articles)
    normalized = weighted_polarity / len(articles)

    if normalized > 0.12:
        return _OUTLOOK_POSITIVE
    if normalized < -0.12:
        return _OUTLOOK_NEGATIVE
    return _OUTLOOK_NEUTRAL


def _event_key(article: RawArticle) -> frozenset:
    """Rough same-event grouping: the set of "significant" words (4+
    letters) in the title. Two articles covering the same underlying
    event tend to share most of these even with different phrasing
    ("RBI cuts repo rate by 25bps" vs "Reserve Bank trims repo rate") --
    this is intentionally simple (word-overlap clustering, not embedding
    similarity), consistent with the rest of the project's dependency-free
    heuristics, and documented as v1 in MODULE_7_REPORT.md."""
    words = {w for w in article.title.lower().split() if len(w) >= 4}
    return frozenset(words)


def _group_similar_events(articles: List[RawArticle]) -> List[List[RawArticle]]:
    groups: List[List[RawArticle]] = []
    keys: List[frozenset] = []

    for article in sorted(articles, key=importance_score, reverse=True):
        key = _event_key(article)
        placed = False
        for i, existing_key in enumerate(keys):
            if not key or not existing_key:
                continue
            overlap = len(key & existing_key) / max(1, len(key | existing_key))
            if overlap >= 0.4:
                groups[i].append(article)
                placed = True
                break
        if not placed:
            groups.append([article])
            keys.append(key)

    return groups


def build_major_events(articles: List[RawArticle]) -> List[Dict[str, str]]:
    """Groups similar articles into distinct events, ranks the events by
    combined importance, and returns the top `MAX_MAJOR_EVENTS` as
    {headline, whyItMatters, expectedImpact} -- the shape the Research
    page's "Major Events" list renders directly."""
    if not articles:
        return []

    groups = _group_similar_events(articles)
    groups.sort(key=lambda g: sum(importance_score(a) for a in g), reverse=True)

    events: List[Dict[str, str]] = []
    for group in groups[:MAX_MAJOR_EVENTS]:
        lead = max(group, key=importance_score)
        polarity = sum(polarity_score(a) for a in group)
        source_count = len({a.provider for a in group})

        why_it_matters = (
            f"Covered by {source_count} source{'s' if source_count != 1 else ''} this week"
            f"{', with consistent framing across reports' if len(group) > 1 else ''}."
        )
        if polarity > 0:
            expected_impact = "Reads as a net positive for companies in this sector."
        elif polarity < 0:
            expected_impact = "Reads as a net headwind for companies in this sector."
        else:
            expected_impact = "Impact on the sector is mixed or not yet clear from this week's coverage."

        events.append(
            {
                "headline": lead.title,
                "whyItMatters": why_it_matters,
                "expectedImpact": expected_impact,
                "sourceUrl": lead.url,
            }
        )

    return events


def weekly_sector_summary(sector: str, articles: List[RawArticle], outlook: str) -> str:
    """Short prose summary of the sector's week -- template-filled from
    real counts/labels, matching the worked examples in the Module 7
    brief (e.g. "Banking sector sentiment improved this week...")."""
    if not articles:
        return f"No notable {sector} news was found in the last 7 days."

    n = len(articles)
    tone_sentence = {
        _OUTLOOK_POSITIVE: f"{sector} sentiment improved this week.",
        _OUTLOOK_NEGATIVE: f"{sector} faced headwinds this week.",
        _OUTLOOK_NEUTRAL: f"{sector} saw a mixed set of developments this week.",
    }[outlook]

    source_count = len({a.provider for a in articles})
    coverage_sentence = (
        f"Coverage spanned {n} article{'s' if n != 1 else ''} across "
        f"{source_count} source{'s' if source_count != 1 else ''}."
    )

    closing = {
        _OUTLOOK_POSITIVE: f"{sector} is one of this week's stronger sectors on the platform's coverage.",
        _OUTLOOK_NEGATIVE: f"{sector} is one of this week's weaker sectors on the platform's coverage.",
        _OUTLOOK_NEUTRAL: f"No decisive directional signal for {sector} yet -- worth a closer look at company-level fundamentals.",
    }[outlook]

    return " ".join([tone_sentence, coverage_sentence, closing])
