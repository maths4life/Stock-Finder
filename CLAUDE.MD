# CLAUDE.md

This file provides guidance to Claude Code (https://claude.ai/code) when working on this repository.

---

# Project Overview

## Project Name

Stock Finder

## Vision

Stock Finder is an institutional-grade stock research platform inspired by Bloomberg Terminal, TradingView, TIKR, and Screener.in.

The objective is to build a professional investment research platform rather than a simple stock dashboard.

The application should help investors discover, analyze, compare and monitor companies using:

- Fundamental Analysis
- Technical Analysis
- Quantitative Scoring
- Portfolio Analytics
- Watchlists
- AI Insights
- Company Research
- Financial Statements
- News
- Market Breadth
- Journal & Thesis Tracking

The platform should always prioritize professional usability over flashy visuals.

---

# Core Principles

Always optimize for:

- Clean Architecture
- Readability
- Scalability
- Performance
- Maintainability
- Type Safety
- Accessibility
- Consistency
- Reusable Components

Avoid:

- Duplicate logic
- Massive files
- Hardcoded values
- Tight coupling
- Magic numbers
- Deep component nesting
- Over-engineering

Never rewrite existing systems unless explicitly instructed.

Always extend existing architecture whenever possible.

---

# Design Philosophy

The UI should feel like a premium financial terminal.

Inspirations include:

- Bloomberg Terminal
- TradingView
- TIKR
- Linear
- Apple
- Vercel Dashboard

Characteristics:

- Professional
- Minimal
- Dense but readable
- Premium
- Fast
- Responsive
- Information-rich
- Dark-first
- Elegant animations
- Excellent typography

Avoid:

- Cartoonish UI
- Large empty spaces
- Oversized buttons
- Bright gradients everywhere
- Random colors
- Inconsistent spacing

---

# Tech Stack

Frontend

- React
- TypeScript
- Vite
- TailwindCSS
- shadcn/ui
- React Query / TanStack Query

Backend

- FastAPI

Database

- PostgreSQL

ORM

- SQLAlchemy

Charts

- TradingView Lightweight Charts
- Recharts where appropriate

Deployment

- Docker
- GitHub Actions

---

# Folder Organization

Frontend

```
src/
components/
features/
pages/
layouts/
hooks/
services/
types/
utils/
constants/
assets/
```

Backend

```
backend/
api/
services/
repositories/
database/
models/
schemas/
core/
utils/
tests/
```

Never place business logic inside components.

---

# Coding Standards

Always:

- Use TypeScript strict mode.
- Keep functions small.
- Keep components under roughly 300 lines.
- Use meaningful names.
- Prefer composition over inheritance.
- Prefer reusable utilities.
- Extract duplicate logic.

Never:

- Copy-paste code.
- Mix UI and business logic.
- Fetch data directly inside large components.
- Hardcode API URLs.
- Ignore lint warnings.

---

# React Guidelines

Always:

Use:

- Functional Components
- React Hooks
- React Query
- Lazy Loading
- Memoization where beneficial

Pages should mainly orchestrate data.

Components should mainly render UI.

Business logic belongs inside:

- hooks
- services
- utilities

---

# Backend Guidelines

Architecture

API

↓

Service

↓

Repository

↓

Database

No SQL inside API routes.

Validation belongs in schemas.

Business rules belong in services.

---

# Database Standards

- Normalize tables.
- Use foreign keys.
- Add indexes.
- Avoid duplicated information.
- Never delete important financial data permanently.
- Use migrations.

---

# Error Handling

Always handle:

Loading

Empty states

Network failures

API failures

Permission failures

Rate limits

Unexpected responses

Never allow blank pages.

---

# Performance

Optimize for:

- Code splitting
- Lazy loading
- Memoization
- Pagination
- Virtualized tables
- Image optimization
- Efficient queries
- API caching

Never optimize prematurely.

---

# UI/UX Pro Max Integration

This repository uses the UI UX Pro Max design system.

Whenever implementing or redesigning any frontend page:

1. Determine the page type.
2. Search the UI UX Pro Max database.
3. Use the returned recommendations before writing code.

Possible searches:

Product

Style

Typography

Color

Landing

Chart

Icons

UX

React

Google Fonts

GSAP

Examples:

python src/ui-ux-pro-max/scripts/search.py "finance dashboard" --domain product

python src/ui-ux-pro-max/scripts/search.py "Bloomberg Terminal" --domain style

python src/ui-ux-pro-max/scripts/search.py "financial dashboard" --domain color

python src/ui-ux-pro-max/scripts/search.py "dashboard" --domain typography

python src/ui-ux-pro-max/scripts/search.py "candlestick" --domain chart

python src/ui-ux-pro-max/scripts/search.py "dashboard" --domain ux

python src/ui-ux-pro-max/scripts/search.py "finance" --domain react

Do not invent a design if a relevant recommendation exists.

Maintain visual consistency throughout the project.

---

# Charts

Use the correct visualization.

Price

→ Candlestick

Portfolio Allocation

→ Pie / Treemap

Historical Returns

→ Line

Revenue

→ Bar

Cash Flow

→ Area

Risk vs Return

→ Scatter

Performance Attribution

→ Heatmap

Avoid misleading charts.

---

# AI Rules

Never hallucinate:

- Prices
- Financial statements
- API responses
- Scores
- Technical indicators

If data is unavailable:

Display placeholders.

Display loading states.

Explain limitations.

Never fabricate information.

---

# Scoring Engine

The scoring engine is one of the core features.

Maintain modular scoring architecture.

Possible score modules:

- Quality
- Value
- Momentum
- Growth
- Financial Health
- Risk
- Technical
- Composite

Each score should:

- be independently testable
- have documented weights
- expose explainable calculations
- avoid hidden heuristics

---

# Component Philosophy

Before creating a component ask:

Can this be reused?

If yes,

create a reusable component.

Common reusable components:

- Button
- Card
- Metric Card
- KPI Tile
- Data Table
- Filter Panel
- Modal
- Sidebar
- Navbar
- Search Bar
- Chart Wrapper
- Company Header
- Skeleton Loader
- Empty State
- Error State

---

# Styling Rules

Spacing should be consistent.

Typography should use a clear hierarchy.

Animations should be subtle.

Prefer whitespace over borders.

Use color to communicate meaning.

Do not overuse shadows.

Avoid unnecessary gradients.

Dark mode should be first-class.

---

# Accessibility

Always include:

Keyboard navigation

ARIA labels

Semantic HTML

Proper contrast

Focus indicators

Accessible forms

---

# Git Workflow

Never push directly to main.

Always:

Create feature branches.

Use descriptive commits.

Open Pull Requests.

Keep commits focused.

Branch examples:

feature/dashboard

feature/portfolio

feature/scoring-engine

fix/navbar

refactor/api

---

# Documentation

Document:

Complex algorithms

Public functions

API endpoints

Database schema

Architecture decisions

Keep README updated.

---

# Testing

Prefer:

Unit Tests

Integration Tests

End-to-End Tests

Before major changes:

Run tests.

Fix failures.

Do not introduce regressions.

---

# Skills

If creating reusable AI skills:

Use structure:

skills/

skill-name/

SKILL.md

scripts/

references/

lib/

Keep SKILL.md concise.

Move large documentation into references/.

Prefer executable scripts over embedding long code examples.

---

# Agent Behaviour

Before making major changes:

1. Read the existing implementation.
2. Understand the architecture.
3. Reuse existing components.
4. Search for similar implementations.
5. Explain tradeoffs if changing architecture.

Never rewrite entire modules without approval.

Never remove functionality unless instructed.

Prefer incremental improvements.

---

# Project Roadmap

Current goals:

Phase 1

✔ Dashboard

✔ Company Analysis

✔ Professional UI

Phase 2

Portfolio

Watchlists

Journal

Phase 3

AI Insights

Financial Statement Analysis

Sector Analysis

Phase 4

Backtesting

Screeners

Custom Alerts

Phase 5

Broker Integration

Real-time Data

Options Analytics

Mobile App

---

# Definition of Done

A feature is complete only if:

✓ Code is clean.

✓ Components are reusable.

✓ Types are correct.

✓ No unnecessary duplication.

✓ Responsive.

✓ Accessible.

✓ Error handling exists.

✓ Loading states exist.

✓ Dark mode works.

✓ Matches project design language.

✓ Future backend integration has been considered.

Always build as if this project will be used by thousands of investors.
