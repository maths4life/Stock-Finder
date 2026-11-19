-- Quant Terminal — Turso / libSQL schema
-- Compatible with SQLite / libSQL standard dialect (9 GB free tier).
-- Run via: turso db shell <db-name> < backend/db/turso_schema.sql
-- or automatically executed by scripts/migrate_supabase_to_turso.py

-- ============================================================
-- 1. Reference data
-- ============================================================

CREATE TABLE IF NOT EXISTS companies (
    symbol            TEXT PRIMARY KEY,
    yahoo_ticker      TEXT NOT NULL,
    exchange          TEXT NOT NULL DEFAULT 'NSE',
    name              TEXT NOT NULL,
    sector            TEXT,
    industry          TEXT,
    isin              TEXT,
    is_active         INTEGER NOT NULL DEFAULT 1,
    index_membership  TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- 2. Daily OHLCV Prices
-- ============================================================

CREATE TABLE IF NOT EXISTS prices_daily (
    symbol      TEXT NOT NULL REFERENCES companies(symbol),
    date        TEXT NOT NULL,
    open        REAL,
    high        REAL,
    low         REAL,
    close       REAL,
    volume      INTEGER,
    PRIMARY KEY (symbol, date)
);

CREATE INDEX IF NOT EXISTS idx_prices_symbol_date ON prices_daily (symbol, date DESC);

-- Derived technical snapshot
CREATE TABLE IF NOT EXISTS technical_snapshot (
    symbol          TEXT PRIMARY KEY REFERENCES companies(symbol),
    as_of_date      TEXT NOT NULL,
    close           REAL,
    change_pct      REAL,
    rsi_14          REAL,
    ma20            REAL,
    ma50            REAL,
    ma200           REAL,
    vwap            REAL,
    high_52w        REAL,
    low_52w         REAL,
    avg_volume_20   INTEGER,
    above_50dma     INTEGER,
    above_200dma    INTEGER,
    golden_cross    INTEGER,
    death_cross     INTEGER,
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- 3. Fundamentals
-- ============================================================

CREATE TABLE IF NOT EXISTS financials_quarterly (
    symbol              TEXT NOT NULL REFERENCES companies(symbol),
    quarter             TEXT NOT NULL,
    fiscal_year_end     TEXT,
    revenue_cr          REAL,
    net_profit_cr       REAL,
    ebitda_margin_pct   REAL,
    eps                 REAL,
    roe_pct             REAL,
    roce_pct            REAL,
    debt_to_equity      REAL,
    current_ratio       REAL,
    free_cash_flow_cr   REAL,
    pe                  REAL,
    pb                  REAL,
    peg                 REAL,
    revenue_growth_pct  REAL,
    profit_growth_pct   REAL,
    dividend_yield_pct  REAL,
    market_cap_cr       REAL,
    book_value          REAL,
    source              TEXT DEFAULT 'kaggle_seed',
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (symbol, quarter)
);

CREATE TABLE IF NOT EXISTS shareholding_pattern (
    symbol            TEXT NOT NULL REFERENCES companies(symbol),
    quarter           TEXT NOT NULL,
    promoter_pct      REAL,
    fii_pct           REAL,
    dii_pct           REAL,
    public_pct        REAL,
    pledge_pct        REAL,
    mutual_funds_pct  REAL,
    government_pct    REAL,
    others_pct        REAL,
    period_end        TEXT,
    source            TEXT DEFAULT 'kaggle_seed',
    updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (symbol, quarter)
);

CREATE INDEX IF NOT EXISTS idx_shareholding_symbol_period ON shareholding_pattern (symbol, period_end DESC);

CREATE TABLE IF NOT EXISTS financial_statements (
    symbol              TEXT NOT NULL REFERENCES companies(symbol),
    period_type         TEXT NOT NULL CHECK (period_type IN ('quarterly', 'annual')),
    period_end          TEXT NOT NULL,
    period_label        TEXT NOT NULL,
    revenue_cr          REAL,
    net_profit_cr       REAL,
    eps                 REAL,
    ebitda_cr           REAL,
    ebitda_margin_pct   REAL,
    operating_margin_pct REAL,
    cash_cr             REAL,
    debt_cr             REAL,
    free_cash_flow_cr   REAL,
    source              TEXT NOT NULL DEFAULT 'yfinance',
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (symbol, period_type, period_end)
);

CREATE INDEX IF NOT EXISTS idx_financial_statements_symbol_type ON financial_statements (symbol, period_type, period_end DESC);

-- ============================================================
-- 4. Scores
-- ============================================================

CREATE TABLE IF NOT EXISTS scores (
    symbol              TEXT PRIMARY KEY REFERENCES companies(symbol),
    as_of_date          TEXT NOT NULL,
    fundamental_score   REAL,
    technical_score     REAL,
    overall_score       REAL,
    verdict             TEXT,
    rationale           TEXT,
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- 5. Journal & Pipeline
-- ============================================================

CREATE TABLE IF NOT EXISTS journal_entries (
    id                  TEXT PRIMARY KEY,
    user_id             TEXT,
    symbol              TEXT NOT NULL REFERENCES companies(symbol),
    title               TEXT,
    thesis              TEXT NOT NULL,
    fundamental_reasons TEXT,
    technical_reasons   TEXT,
    sector_reasons      TEXT,
    macro_reasons       TEXT,
    personal_notes      TEXT,
    sell_trigger        TEXT,
    assumptions         TEXT,
    risks_accepted      TEXT,
    entry_price         REAL,
    target_price        REAL,
    expected_return_pct REAL,
    horizon_months      INTEGER,
    confidence_level    INTEGER,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    review_due_at       TEXT
);

CREATE TABLE IF NOT EXISTS journal_reviews (
    id                  TEXT PRIMARY KEY,
    entry_id            TEXT NOT NULL REFERENCES journal_entries(id),
    reviewed_at         TEXT NOT NULL DEFAULT (datetime('now')),
    thesis_played_out   TEXT,
    what_actually_happened TEXT,
    mistakes            TEXT,
    lessons             TEXT,
    would_buy_again     INTEGER,
    ai_comparison_summary TEXT
);

CREATE TABLE IF NOT EXISTS pipeline_items (
    id          TEXT PRIMARY KEY,
    user_id     TEXT,
    symbol      TEXT NOT NULL REFERENCES companies(symbol),
    stage       TEXT NOT NULL DEFAULT 'Watching',
    note        TEXT,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- 6. Weekly Sector Intelligence
-- ============================================================

CREATE TABLE IF NOT EXISTS news_articles (
    id              TEXT PRIMARY KEY,
    provider        TEXT NOT NULL,
    title           TEXT NOT NULL,
    url             TEXT NOT NULL,
    summary         TEXT,
    published_at    TEXT,
    fetched_at      TEXT NOT NULL DEFAULT (datetime('now')),
    dedup_key       TEXT NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_news_articles_published ON news_articles (published_at DESC);

CREATE TABLE IF NOT EXISTS news_article_sectors (
    article_id      TEXT NOT NULL REFERENCES news_articles(id),
    sector          TEXT NOT NULL,
    importance      REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (article_id, sector)
);

CREATE INDEX IF NOT EXISTS idx_news_article_sectors_sector ON news_article_sectors (sector);

CREATE TABLE IF NOT EXISTS weekly_sector_intelligence (
    sector              TEXT NOT NULL,
    week_start_date     TEXT NOT NULL,
    week_end_date       TEXT NOT NULL,
    outlook             TEXT NOT NULL,
    summary             TEXT NOT NULL,
    major_events        TEXT NOT NULL DEFAULT '[]',
    article_count       INTEGER NOT NULL DEFAULT 0,
    generated_at        TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (sector, week_start_date)
);

CREATE INDEX IF NOT EXISTS idx_weekly_sector_intel_week ON weekly_sector_intelligence (week_start_date DESC);
