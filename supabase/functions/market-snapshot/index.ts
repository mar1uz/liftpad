// Supabase Edge Function: market-snapshot
// Daily job: pull the app's merged market view (/api/market) and store one daily-close
// row per token in public.token_market_snapshots, recording the run in public.job_runs.
// Invoke via pg_cron + pg_net (see README.md) or manually with the service role key.
import { createClient } from 'npm:@supabase/supabase-js@2';

const APP_ORIGIN = Deno.env.get('MARKET_SNAPSHOT_APP_ORIGIN') || 'https://liftpad.xyz';
const CHAINS = new Set(['solana', 'base', 'bsc', 'hyperevm', 'arbitrum', 'robinhood', 'arc']);

type MarketToken = {
  id?: string;
  chain?: string;
  address?: string;
  poolAddress?: string;
  name?: string;
  symbol?: string;
  quoteSymbol?: string;
  priceUsd?: number | null;
  change24h?: number | null;
  volume24h?: number | null;
  liquidityUsd?: number | null;
  marketCap?: number | null;
  image?: string;
  source?: string;
};

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

Deno.serve(async (req) => {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const url = Deno.env.get('SUPABASE_URL');
  if (!serviceKey || !url) {
    return Response.json({ error: 'Function environment is not configured.' }, { status: 500 });
  }
  // Only the scheduler (or an operator) holding the service role key may run the job.
  if (req.headers.get('authorization') !== `Bearer ${serviceKey}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: run, error: runError } = await db
    .from('job_runs')
    .insert({ job: 'market-snapshot', status: 'running' })
    .select('id')
    .single();
  if (runError) {
    return Response.json({ error: `Could not open job run: ${runError.message}` }, { status: 500 });
  }
  const finish = async (status: 'success' | 'error', items: number | null, error: string | null) => {
    await db.from('job_runs').update({ status, items, error, finished_at: new Date().toISOString() }).eq('id', run.id);
  };

  try {
    const res = await fetch(`${APP_ORIGIN}/api/market`, {
      headers: { Accept: 'application/json', 'User-Agent': 'liftpad-market-snapshot/1' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`Market API returned ${res.status}`);
    const payload = (await res.json()) as { tokens?: MarketToken[] };
    const tokens = Array.isArray(payload.tokens) ? payload.tokens : [];
    const day = new Date().toISOString().slice(0, 10); // UTC day = daily close bucket
    const observedAt = new Date().toISOString();

    const rows = [];
    const seen = new Set<string>();
    for (const t of tokens) {
      if (!t.chain || !CHAINS.has(t.chain) || !t.address || !t.name || !t.symbol) continue;
      const pool = t.poolAddress || t.address;
      const tokenId = t.id || `${t.chain}:${pool}`;
      if (seen.has(tokenId)) continue;
      seen.add(tokenId);
      rows.push({
        token_id: tokenId,
        chain: t.chain,
        token_address: t.address,
        pool_address: pool,
        name: t.name.slice(0, 120),
        symbol: t.symbol.slice(0, 40),
        quote_symbol: t.quoteSymbol || null,
        price_usd: num(t.priceUsd),
        change_24h: num(t.change24h),
        volume_24h: num(t.volume24h),
        liquidity_usd: num(t.liquidityUsd),
        market_cap: num(t.marketCap),
        image: t.image || null,
        source: t.source === 'liftpad' ? 'liftpad' : 'dexscreener',
        day,
        observed_at: observedAt,
      });
    }

    // Upsert keeps the job idempotent: a re-run on the same UTC day refreshes the close.
    for (let i = 0; i < rows.length; i += 400) {
      const chunk = rows.slice(i, i + 400);
      const { error } = await db.from('token_market_snapshots').upsert(chunk, { onConflict: 'token_id,day' });
      if (error) throw new Error(`Snapshot upsert failed: ${error.message}`);
    }

    await finish('success', rows.length, null);
    return Response.json({ ok: true, day, items: rows.length });
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 400) : 'unknown error';
    await finish('error', null, message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
});
