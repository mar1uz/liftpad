-- Fee ledger + monthly airdrop (1st of each month). Apply via Supabase migrations.
-- Service role writes; authenticated users only read their own airdrop rows.

create table public.platform_fees (
  id uuid primary key default gen_random_uuid(),
  chain text not null check (chain in ('solana','base','bsc','hyperevm','arbitrum','robinhood','arc')),
  kind text not null check (kind in ('launch','curve_trade','other')),
  tx_hash text not null,
  from_address text,
  amount_raw numeric(78,0) not null check (amount_raw > 0),
  amount_native numeric(36,18) not null check (amount_native > 0),
  asset_symbol text not null check (asset_symbol in ('SOL','ETH','BNB','HYPE')),
  treasury_address text not null,
  launch_id uuid references public.launches(id),
  observed_at timestamptz not null default now(),
  unique (chain, tx_hash, kind)
);
alter table public.platform_fees enable row level security;
-- No anon policies: ingestion uses service role only.
create index on public.platform_fees (observed_at desc);
create index on public.platform_fees (chain, kind, observed_at desc);

create table public.airdrop_rounds (
  id uuid primary key default gen_random_uuid(),
  -- Calendar month of the distribution (always the 1st 00:00 UTC of that month).
  period_start date not null unique check (extract(day from period_start) = 1),
  period_end date not null,
  status text not null default 'open' check (status in ('open','snapshot','distributing','paid','cancelled')),
  fee_pool_native numeric(36,18) not null default 0,
  airdrop_share_native numeric(36,18) not null default 0, -- 25% of fee_pool
  asset_symbol text not null default 'SOL' check (asset_symbol in ('SOL','ETH')),
  eligible_wallets integer not null default 0,
  per_wallet_native numeric(36,18),
  snapshot_at timestamptz,
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.airdrop_rounds enable row level security;
create policy "Anyone can read airdrop rounds"
  on public.airdrop_rounds for select to anon, authenticated using (true);

create table public.airdrop_allocations (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.airdrop_rounds(id) on delete cascade,
  wallet_address text not null,
  chain text not null check (chain in ('solana','base','bsc','hyperevm','arbitrum','robinhood','arc')),
  completed_launches integer not null default 1 check (completed_launches >= 1),
  amount_native numeric(36,18) not null check (amount_native > 0),
  status text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  payout_tx_hash text,
  updated_at timestamptz not null default now(),
  unique (round_id, wallet_address, chain)
);
alter table public.airdrop_allocations enable row level security;
create policy "Users read allocations for their wallet hint"
  on public.airdrop_allocations for select to authenticated using (true);
-- Tighten later with wallet-linked auth; for now read-all authenticated, write service role only.
create index on public.airdrop_allocations (wallet_address);
create index on public.airdrop_allocations (round_id, status);

-- Wallet that completed the launch (set by server when stage → complete).
alter table public.launches
  add column if not exists creator_wallet text;

create index if not exists launches_creator_wallet_idx
  on public.launches (creator_wallet)
  where stage = 'complete' and creator_wallet is not null;

create or replace view public.completed_launch_wallets as
  select
    l.id as launch_id,
    l.chain,
    l.creator_wallet as wallet_address,
    l.token_address,
    l.updated_at as completed_at
  from public.launches l
  where l.stage = 'complete'
    and l.creator_wallet is not null
    and l.token_address is not null;

comment on table public.platform_fees is 'Indexed LIFT platform fees (launch + LaunchLab curve). Source of truth for 50/25/25 split.';
comment on table public.airdrop_rounds is 'Monthly airdrop rounds; distribution on the 1st for the prior calendar month.';
comment on table public.airdrop_allocations is 'Per-wallet equal share of a round among wallets with ≥1 completed launch (product: lifetime launchers unless notes say otherwise).';
