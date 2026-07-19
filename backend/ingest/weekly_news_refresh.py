"""Module 7 -- weekly refresh entry point.

Runs the full news -> sector intelligence pipeline
(services/weekly_market_intelligence.refresh_weekly_intelligence) and
prints a short summary. Meant to be scheduled once a week -- e.g. a
Sunday cron job / GitHub Actions scheduled workflow / Windows Task
Scheduler entry, the same way this project would eventually schedule
`ingest/fetch_prices.py` + `ingest/compute_technicals.py` +
`ingest/compute_scores.py` for daily refreshes (those are still run
manually today -- see README.md -- but the pattern is the same).

This lives in `ingest/` rather than `services/` because it's a CLI
entry point / operational script, not business logic -- consistent
with how compute_scores.py, compute_technicals.py, and fetch_prices.py
are organized: the actual logic lives in `services/` or is
self-contained, and `ingest/*.py` is just "the thing you run".

Usage:
    python -m ingest.weekly_news_refresh

Suggested weekly cron (adjust for your platform):
    0 6 * * SUN  cd /path/to/backend && python -m ingest.weekly_news_refresh
"""
from services.weekly_market_intelligence import refresh_weekly_intelligence


def main() -> None:
    result = refresh_weekly_intelligence()
    print(
        f"Weekly Market Intelligence refresh complete "
        f"({result['weekStartDate']} to {result['weekEndDate']}):"
    )
    print(f"  Articles fetched: {result['articlesFetched']}")
    print(f"  Articles kept (deduped, in-window): {result['articlesKept']}")
    print(f"  Sectors updated: {', '.join(result['sectorsUpdated']) or '(none)'}")


if __name__ == "__main__":
    main()
