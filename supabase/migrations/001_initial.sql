-- Apply through the Supabase migration workflow. Never place the service role key in the browser.
create table public.launch_drafts (
 id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 800000),
 updated_at timestamptz not null default now(),
 created_at timestamptz not null default now()
);
alter table public.launch_drafts enable row level security;
create policy "Users read own drafts" on public.launch_drafts for select to authenticated using (owner_id = auth.uid());
create policy "Users create own drafts" on public.launch_drafts for insert to authenticated with check (owner_id = auth.uid());
create policy "Users update own drafts" on public.launch_drafts for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Users delete own drafts" on public.launch_drafts for delete to authenticated using (owner_id = auth.uid());
create index on public.launch_drafts(owner_id, updated_at desc);

create table public.watchlist (
 owner_id uuid not null references auth.users(id) on delete cascade,
 token_id text not null check (length(token_id) between 5 and 180),
 created_at timestamptz not null default now(),
 primary key(owner_id, token_id)
);
alter table public.watchlist enable row level security;
create policy "Users manage own watchlist" on public.watchlist for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Only trusted server processes write chain state. Drafts are never evidence of deployment.
create table public.launches (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 chain text not null check(chain in ('solana','base','bsc','hyperevm','arbitrum','robinhood','arc')),
 token_address text,
 pool_address text,
 stage text not null default 'draft' check(stage in ('draft','token','approval','pool','liquidity','complete')),
 updated_at timestamptz not null default now(),
 unique(chain, token_address), unique(chain, pool_address)
);
alter table public.launches enable row level security;
create policy "Users read own launches" on public.launches for select to authenticated using(owner_id=auth.uid());

create table public.launch_steps (
 id uuid primary key default gen_random_uuid(),
 launch_id uuid not null references public.launches(id),
 step text not null,
 chain text not null,
 tx_hash text not null,
 status text not null check(status in ('pending','confirmed','failed')),
 expected_tx jsonb not null,
 block_hash text,
 created_at timestamptz not null default now(),
 unique(chain,tx_hash)
);
create unique index launch_one_pending_step on public.launch_steps(launch_id) where status='pending';
create unique index launch_one_confirmed_step on public.launch_steps(launch_id,step) where status='confirmed';
alter table public.launch_steps enable row level security;
create policy "Users read their transaction steps" on public.launch_steps for select to authenticated using(exists(select 1 from public.launches l where l.id=launch_id and l.owner_id=auth.uid()));

create table public.chain_events (
 chain text not null,
 transaction_hash text not null,
 log_index integer not null,
 block_hash text not null,
 block_number numeric(78,0) not null,
 pool_address text not null,
 payload jsonb not null,
 observed_at timestamptz not null default now(),
 primary key(chain,transaction_hash,log_index)
);
alter table public.chain_events enable row level security;
-- No anon/authenticated policies: provider ingestion uses service role only.
create index on public.chain_events(chain,pool_address,block_number desc);

create table public.provider_checkpoints (
 provider text not null,
 chain text not null,
 block_number numeric(78,0) not null,
 updated_at timestamptz not null default now(),
 primary key(provider,chain)
);
alter table public.provider_checkpoints enable row level security;

create table public.candles (
 chain text not null,
 pool_address text not null,
 bucket timestamptz not null,
 open numeric not null,
 high numeric not null,
 low numeric not null,
 close numeric not null,
 quote_volume numeric not null,
 primary key(chain,pool_address,bucket)
);
alter table public.candles enable row level security;
-- Public API reads through reviewed pool allowlist; no direct public table access.
