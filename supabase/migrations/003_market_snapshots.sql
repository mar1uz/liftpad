-- Daily market snapshots + job run status. Apply via Supabase migrations.
-- Service role writes (Edge Function); the app reads through reviewed API routes only.

create table public.token_market_snapshots (
  token_id text not null, -- `${chain}:${poolAddress}`, matches Token.id in the app
  chain text not null check (chain in ('solana','base','bsc','hyperevm','arbitrum','robinhood','arc')),
  token_address text not null,
  pool_address text not null,
  name text not null,
  symbol text not null,
  quote_symbol text,
  price_usd numeric,
  change_24h numeric,
  volume_24h numeric,
  liquidity_usd numeric,
  market_cap numeric,
  image text,
  source text not null default 'dexscreener',
  -- UTC calendar day of the observation; one row per token per day (the "daily close").
  day date not null,
  observed_at timestamptz not null default now(),
  primary key (token_id, day)
);
alter table public.token_market_snapshots enable row level security;
-- No anon/authenticated policies: writes use the service role, public reads go through /api/movers and /api/snapshots.
create index token_market_snapshots_day_change_idx on public.token_market_snapshots (day desc, change_24h desc);
create index token_market_snapshots_chain_day_volume_idx on public.token_market_snapshots (chain, day desc, volume_24h desc);

create table public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  status text not null check (status in ('running','success','error')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  items integer,
  error text
);
alter table public.job_runs enable row level security;
create index job_runs_job_started_idx on public.job_runs (job, started_at desc);

comment on table public.token_market_snapshots is 'One daily-close market snapshot per tracked token. Written by the market-snapshot Edge Function; keeps the project active and powers charts, ranks and the homepage movers strip.';
comment on table public.job_runs is 'Execution log for scheduled background jobs (status, item counts, errors).';
