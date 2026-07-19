"""Module 6 — deterministic, rule-based investment research engine.

Everything in this package reads data that Modules 1-5 already compute
or store (scores, fundamentals, technicals, shareholding) and turns it
into a structured research report via plain threshold rules — the same
"transparent rules, not a black box" spirit as
services/scoring_service.py and ingest/compute_scores.py. There is no
call to any external AI/LLM API anywhere in this package.
"""
