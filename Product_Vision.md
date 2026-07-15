# PRODUCT_VISION.md

# Stock Finder

**Version:** 1.0

---

# Vision

Stock Finder is **not a stock screener.**

Stock Finder is a **research platform** that helps long-term investors discover high-quality companies entering attractive buying opportunities.

The objective is not to show thousands of stocks.

The objective is to answer one question:

> **Which companies deserve my attention today?**

---

# Mission

Help investors make better long-term investment decisions through transparent research, explainable scoring, and real financial data.

The application should reduce the time required to go from:

"I don't know what to research"

to

"I understand this company well enough to make an informed investment decision."

---

# Target User

The target user is:

- Long-term investor
- Investment horizon: 6–12 months
- Interested in Indian equities
- Wants quality over quantity
- Prefers explainable recommendations over AI-generated opinions

The target user is NOT:

- Intraday trader
- Options trader
- High-frequency trader

---

# Product Philosophy

Every page should answer one question.

---

## Module 1 — Companies

Question:

"What companies exist in my investment universe?"

---

## Module 2 — Discover

Question:

"Which companies deserve my attention today?"

---

## Module 3 — Research Dashboard

Question:

"Should I seriously consider investing in this company?"

---

## Module 4 — Discovery Engine

Question:

"Find me companies worth researching."

NOT

"Show every company matching a filter."

---

## Future AI Module

Question:

"Explain the company."

NOT

"Tell me what to buy."

---

# Core Principles

## 1. No Fake Data

Never fabricate numbers.

If data is unavailable:

Display

—

Never display:

0

unless zero is the actual value.

---

## 2. Explain Everything

Every recommendation must have a WHY.

Example:

Why was this company selected?

✓ Revenue growth improving

✓ Trading above 200 DMA

✓ ROE above 18%

✓ Strong balance sheet

Never produce unexplained scores.

---

## 3. Transparency Over Complexity

Users should understand every recommendation.

Avoid black-box models.

If a score exists, explain how it was calculated.

---

## 4. Quality Over Quantity

The objective is NOT:

Return 500 companies.

The objective IS:

Return the best 10–20 research candidates.

---

## 5. Long-Term Investing

Every feature should support a 6–12 month investment horizon.

Avoid designing for short-term speculation.

---

# Three Independent Scores

Stock Finder never combines everything into one opaque rating.

Every company has:

---

## Quality Score

Measures:

- ROE
- ROCE
- Growth
- Margins
- Debt
- Financial strength
- Promoter quality

Question answered:

"Is this a good business?"

---

## Opportunity Score

Measures:

- RSI
- EMA position
- Support proximity
- Volume
- Valuation
- Sector strength
- Market conditions

Question answered:

"Is this a good time to start researching or buying?"

---

## Risk Score

Measures:

- Leverage
- Volatility
- Governance
- Earnings consistency
- Business cyclicality
- Sector risk

Question answered:

"What could go wrong?"

---

# Product Goal

The application should help the investor answer:

✓ Why this company?

✓ Why now?

✓ What are the risks?

✓ What should I monitor next?

---

# Data Philosophy

Every visible metric must originate from one of the following:

- Company filings
- Stock exchange data
- yfinance
- Government data
- Company annual reports
- Company quarterly reports
- Deterministic calculations based on the above

Never invent data.

Never generate fake financial numbers.

---

# AI Philosophy

AI should never replace research.

AI should assist research.

Examples:

✓ Summarize annual reports

✓ Summarize quarterly reports

✓ Summarize news

✓ Explain financial changes

AI should NEVER:

- Predict stock prices
- Give Buy/Sell recommendations
- Invent financial metrics

---

# Discovery Philosophy

The Discovery Engine is the heart of Stock Finder.

It is not a screener.

It is an intelligent filtering system that surfaces companies worthy of further research.

Users should finish a Discovery session with:

10–20 companies

not

500 companies.

---

# News Philosophy

News is evidence.

News is not a recommendation.

News should:

- Explain sector movement
- Explain company movement
- Explain earnings
- Explain macroeconomic changes

News should never directly influence recommendations without supporting financial or technical evidence.

---

# Explainability

Every recommendation must answer:

Why?

Example:

Opportunity Score 84

Why?

✓ RSI recovered from oversold

✓ Trading above 200 DMA

✓ Earnings improving

✓ Valuation below historical average

✓ Sector entering recovery

---

# Future Roadmap

Phase 1

Build a reliable research platform using real market data.

Phase 2

Automate data collection.

Integrate multiple news sources.

Summarize annual reports.

Summarize quarterly reports.

Improve Opportunity Score.

Phase 3

Portfolio management.

Alerts.

Watchlists.

Advanced AI research assistant.

---

# Success Metric

Stock Finder is successful when the creator chooses to use it before making every investment decision.

Not when it has the most features.

Not when it has the most users.

When it becomes the default research workflow.

---

# Engineering Rules

Every new feature must answer:

1.

Why does this feature exist?

2.

Does it improve research quality?

3.

Does it improve decision making?

4.

Can the recommendation be explained?

If the answer is no,

do not build the feature.

---

# Final Principle

Stock Finder exists to help investors make disciplined, research-driven decisions using transparent analysis and real data.

Every engineering and product decision should reinforce this goal.

# The Stock Finder Promise

Stock Finder does not try to predict the future.

Instead, it helps investors answer:

- Is this a fundamentally strong business?
- Is this an attractive point in its cycle to begin researching or investing?
- What evidence supports that conclusion?
- What risks could invalidate my thesis?

Every recommendation must be supported by transparent data and explainable reasoning.