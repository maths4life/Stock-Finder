-- Migration 001 — Module 7 (Quarterly & Annual Financial Statements) +
-- Module 7.5 (Shareholding Pattern breakdown).
--
-- Safe to run against an existing database that was created from an
-- older version of db/schema.sql. Every statement here is also present,
-- verbatim, inside the main db/schema.sql — so a *fresh* database only
-- ever needs `psql $DATABASE_URL -f db/schema.sql`. This file exists for
-- the "I already have a running database and don't want to replay the
-- whole schema" path. Idempotent: safe to run more than once.
--
-- Usage:
--   psql "$DATABASE_URL" -f db/migrations/001_financial_statements_and_shareholding_breakdown.sql

begin;

-- --- Module 7.5: finer shareholding breakdown -----------------------------
alter table shareholding_pattern add column if not exists mutual_funds_pct numeric;
alter table shareholding_pattern add column if not exists government_pct  numeric;
alter table shareholding_pattern add column if not exists others_pct      numeric;
alter table shareholding_pattern add column if not exists period_end      date;

create index if not exists idx_shareholding_symbol_period on shareholding_pattern (symbol, period_end desc nulls last);

-- --- Module 8: company metadata quality improvement ------------------------
alter table companies add column if not exists industry text;

-- --- Module 7: real multi-period financial statement history --------------
create table if not exists financial_statements (
    symbol                text not null references companies(symbol),
    period_type           text not null check (period_type in ('quarterly', 'annual')),
    period_end            date not null,
    period_label          text not null,
    revenue_cr            numeric,
    net_profit_cr         numeric,
    eps                   numeric,
    ebitda_cr             numeric,
    ebitda_margin_pct     numeric,
    operating_margin_pct  numeric,
    cash_cr               numeric,
    debt_cr               numeric,
    free_cash_flow_cr     numeric,
    source                text not null default 'yfinance',
    updated_at            timestamptz not null default now(),
    primary key (symbol, period_type, period_end)
);

create index if not exists idx_financial_statements_symbol_type
    on financial_statements (symbol, period_type, period_end desc);

commit;
