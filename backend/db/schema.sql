-- Quant Terminal — core schema
-- Designed for Supabase / Neon free tier (plain Postgres, no paid extensions).
-- Run this once against a fresh database: psql $DATABASE_URL -f db/schema.sql

-- ============================================================
-- 1. Reference data
-- ============================================================

create table if not exists companies (
    symbol          text primary key,          -- e.g. 'POLYCAB'
    yahoo_ticker    text not null,              -- e.g. 'POLYCAB.NS'
    exchange        text not null default 'NSE',
    name            text not null,
    sector          text,
    isin            text,
    is_active       boolean not null default true,
    created_at      timestamptz not null default now()
);

-- ============================================================
-- 2. Prices — the only thing yfinance is fully trustworthy for
-- ============================================================

create table if not exists prices_daily (
    symbol      text not null references companies(symbol),
    date        date not null,
    open        numeric,
    high        numeric,
    low         numeric,
    close       numeric,
    volume      bigint,
    primary key (symbol, date)
);

create index if not exists idx_prices_symbol_date on prices_daily (symbol, date desc);

-- Derived technical snapshot, recomputed from prices_daily on each refresh.
-- Kept separate from prices_daily so indicator logic can change without
-- re-fetching data.
create table if not exists technical_snapshot (
    symbol          text primary key references companies(symbol),
    as_of_date      date not null,
    close           numeric,
    change_pct      numeric,
    rsi_14          numeric,
    ma20            numeric,
    ma50            numeric,
    ma200           numeric,
    vwap            numeric,
    high_52w        numeric,
    low_52w         numeric,
    avg_volume_20   bigint,
    above_50dma     boolean,
    above_200dma    boolean,
    golden_cross    boolean,        -- MA50 crossed above MA200 recently
    updated_at      timestamptz not null default now()
);

-- ============================================================
-- 3. Fundamentals — sourced from the Kaggle seed + manual NSE refresh,
--    NOT from yfinance (see project notes on why).
-- ============================================================

create table if not exists financials_quarterly (
    symbol              text not null references companies(symbol),
    quarter             text not null,          -- e.g. 'Q2FY25', or an ISO
                                                 -- period-end date, or the
                                                 -- literal 'TTM' / 'latest'
                                                 -- for the Kaggle seed data
    fiscal_year_end     date,
    revenue_cr          numeric,
    net_profit_cr       numeric,
    ebitda_margin_pct   numeric,     -- approximated from OPM% in the seed
                                      -- data (operating margin, not a true
                                      -- EBITDA margin) — see seed script notes
    eps                 numeric,
    roe_pct             numeric,
    roce_pct            numeric,
    debt_to_equity      numeric,
    current_ratio       numeric,
    free_cash_flow_cr   numeric,
    pe                  numeric,
    pb                  numeric,
    peg                 numeric,
    revenue_growth_pct  numeric,     -- YoY
    profit_growth_pct   numeric,     -- YoY
    dividend_yield_pct  numeric,
    market_cap_cr       numeric,     -- needed for screener market-cap
                                      -- filters; only populated on the
                                      -- 'latest' snapshot row (point-in-time
                                      -- as of the Kaggle export, not a
                                      -- historical series)
    book_value          numeric,     -- per-share book value, same
                                      -- 'latest'-row-only caveat as above
    source              text default 'kaggle_seed',
    updated_at          timestamptz not null default now(),
    primary key (symbol, quarter)
);

-- Idempotent migration guard: `create table if not exists` above is a no-op
-- on a database that already has this table from an older version of this
-- file, so any column added since then has to be bolted on explicitly here.
-- Safe to re-run any number of times, on any prior version of this schema.
alter table financials_quarterly add column if not exists fiscal_year_end     date;
alter table financials_quarterly add column if not exists revenue_cr          numeric;
alter table financials_quarterly add column if not exists net_profit_cr       numeric;
alter table financials_quarterly add column if not exists ebitda_margin_pct   numeric;
alter table financials_quarterly add column if not exists eps                 numeric;
alter table financials_quarterly add column if not exists roe_pct             numeric;
alter table financials_quarterly add column if not exists roce_pct            numeric;
alter table financials_quarterly add column if not exists debt_to_equity      numeric;
alter table financials_quarterly add column if not exists current_ratio       numeric;
alter table financials_quarterly add column if not exists free_cash_flow_cr   numeric;
alter table financials_quarterly add column if not exists pe                  numeric;
alter table financials_quarterly add column if not exists pb                  numeric;
alter table financials_quarterly add column if not exists peg                 numeric;
alter table financials_quarterly add column if not exists revenue_growth_pct  numeric;
alter table financials_quarterly add column if not exists profit_growth_pct   numeric;
alter table financials_quarterly add column if not exists dividend_yield_pct  numeric;
alter table financials_quarterly add column if not exists market_cap_cr       numeric;
alter table financials_quarterly add column if not exists book_value          numeric;
alter table financials_quarterly add column if not exists source              text default 'kaggle_seed';
alter table financials_quarterly add column if not exists updated_at          timestamptz not null default now();

create table if not exists shareholding_pattern (
    symbol          text not null references companies(symbol),
    quarter         text not null,
    promoter_pct    numeric,
    fii_pct         numeric,
    dii_pct         numeric,
    public_pct      numeric,
    pledge_pct      numeric,
    source          text default 'kaggle_seed',
    updated_at      timestamptz not null default now(),
    primary key (symbol, quarter)
);

alter table shareholding_pattern add column if not exists promoter_pct    numeric;
alter table shareholding_pattern add column if not exists fii_pct         numeric;
alter table shareholding_pattern add column if not exists dii_pct         numeric;
alter table shareholding_pattern add column if not exists public_pct     numeric;
alter table shareholding_pattern add column if not exists pledge_pct      numeric;
alter table shareholding_pattern add column if not exists source          text default 'kaggle_seed';
alter table shareholding_pattern add column if not exists updated_at      timestamptz not null default now();

-- ============================================================
-- 4. Scores — derived from (2) + (3), never fetched, always computed
-- ============================================================

create table if not exists scores (
    symbol              text primary key references companies(symbol),
    as_of_date          date not null,
    fundamental_score   numeric,     -- 0-100
    technical_score     numeric,     -- 0-100
    overall_score       numeric,     -- 0-100
    verdict             text,        -- 'Strong Conviction' | 'Watch' | 'Under Review' | 'Pass'
    rationale           text,        -- short generated explanation, built from real deltas
    updated_at          timestamptz not null default now()
);

-- ============================================================
-- 5. Journal — 100% first-party data, no external sourcing needed
-- ============================================================

create table if not exists journal_entries (
    id                      uuid primary key default gen_random_uuid(),
    user_id                 uuid,               -- nullable until auth is added
    symbol                  text not null references companies(symbol),
    title                   text,
    thesis                  text not null,
    fundamental_reasons     text,
    technical_reasons       text,
    sector_reasons          text,
    macro_reasons           text,
    personal_notes          text,
    sell_trigger            text,               -- "what would make you sell this?"
    assumptions             text,
    risks_accepted          text,
    target_price            numeric,
    expected_return_pct     numeric,
    horizon_months          integer,
    confidence_level        integer,            -- 1-5
    created_at              timestamptz not null default now(),
    review_due_at           timestamptz          -- created_at + horizon, auto-set by app
);

create table if not exists journal_reviews (
    id                  uuid primary key default gen_random_uuid(),
    entry_id            uuid not null references journal_entries(id),
    reviewed_at         timestamptz not null default now(),
    thesis_played_out   text,       -- 'yes' | 'partially' | 'no'
    what_actually_happened text,
    mistakes            text,
    lessons              text,
    would_buy_again      boolean,
    ai_comparison_summary text     -- generated by comparing thesis vs current financials/price
);

create table if not exists pipeline_items (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid,
    symbol      text not null references companies(symbol),
    stage       text not null default 'Watching',  -- 'Watching' | 'Researching' | 'Conviction'
    note        text,
    updated_at  timestamptz not null default now()
);
