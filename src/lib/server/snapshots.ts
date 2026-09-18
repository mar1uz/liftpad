import type { ChainKey, Token } from '../types';
import { database } from './supabase';

/** Row shape of public.token_market_snapshots (migration 003). */
export type SnapshotRow = {
  token_id: string;
  chain: ChainKey;
  token_address: string;
  pool_address: string;
  name: string;
  symbol: string;
  quote_symbol: string | null;
  price_usd: number | null;
  change_24h: number | null;
  volume_24h: number | null;
  liquidity_usd: number | null;
  market_cap: number | null;
  image: string | null;
  source: string;
  day: string; // YYYY-MM-DD (UTC)
  observed_at: string;
};

export type DailyClose = { day: string; closeUsd: number };
export type NetworkRank = { rank: number; total: number; day: string };

/** Smallest liquidity floor for a token to count as a "mover" (dust pairs produce absurd % moves). */
export const MOVER_MIN_LIQUIDITY_USD = 1000;

/**
 * Pick the day's biggest gainers. Rows from days before `day` are ignored.
 * Tokens without a usable 24h change, price, or enough liquidity are excluded.
 */
export function topMovers(rows: SnapshotRow[], day: string, limit = 3): SnapshotRow[] {
  return rows
    .filter(
      (r) =>
        r.day === day &&
        r.change_24h != null &&
        Number.isFinite(r.change_24h) &&
        r.price_usd != null &&
        r.price_usd > 0 &&
        (r.liquidity_usd ?? 0) >= MOVER_MIN_LIQUIDITY_USD,
    )
    .sort((a, b) => (b.change_24h ?? 0) - (a.change_24h ?? 0))
    .slice(0, limit);
}

/** Daily-close series for one token, oldest first. Rows with no usable close price are skipped. */
export function dailyCloses(rows: SnapshotRow[]): DailyClose[] {
  return rows
    .filter((r) => r.price_usd != null && r.price_usd > 0)
    .map((r) => ({ day: r.day, closeUsd: r.price_usd as number }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * 1-based rank of `tokenId` within its chain by 24h volume for `day`.
 * Only tokens with a recorded 24h volume are counted. Null when the token has no row that day.
 */
export function networkRank(rows: SnapshotRow[], day: string, chain: ChainKey, tokenId: string): NetworkRank | null {
  const peers = rows
    .filter((r) => r.day === day && r.chain === chain && r.volume_24h != null && Number.isFinite(r.volume_24h))
    .sort((a, b) => (b.volume_24h ?? 0) - (a.volume_24h ?? 0));
  const index = peers.findIndex((r) => r.token_id === tokenId);
  if (index === -1) return null;
  return { rank: index + 1, total: peers.length, day };
}

/** Map a snapshot row to the app's Token shape (for TokenCard reuse). */
export function snapshotToToken(row: SnapshotRow): Token {
  return {
    id: row.token_id,
    chain: row.chain,
    address: row.token_address,
    poolAddress: row.pool_address,
    name: row.name,
    symbol: row.symbol,
    quoteSymbol: row.quote_symbol || 'USD',
    priceUsd: row.price_usd,
    change24h: row.change_24h,
    volume24h: row.volume_24h,
    liquidityUsd: row.liquidity_usd,
    marketCap: row.market_cap,
    image: row.image || undefined,
    source: row.source === 'liftpad' ? 'liftpad' : 'dexscreener',
    observedAt: row.observed_at,
  };
}

async function latestDay(db: ReturnType<typeof database>): Promise<string | null> {
  const { data, error } = await db.from('token_market_snapshots').select('day').order('day', { ascending: false }).limit(1);
  if (error) throw new Error(`Snapshot lookup failed: ${error.message}`);
  return data?.[0]?.day ?? null;
}

/** Rows for the most recent snapshot day, optionally limited to one chain. Empty when none exist yet. */
export async function latestSnapshotRows(chain?: ChainKey): Promise<{ day: string; rows: SnapshotRow[] } | null> {
  const db = database();
  const day = await latestDay(db);
  if (!day) return null;
  let query = db.from('token_market_snapshots').select('*').eq('day', day);
  if (chain) query = query.eq('chain', chain);
  const { data, error } = await query;
  if (error) throw new Error(`Snapshot lookup failed: ${error.message}`);
  return { day, rows: (data || []) as SnapshotRow[] };
}

/** All stored daily closes for one token, oldest first. */
export async function snapshotHistory(tokenId: string, limit = 90): Promise<SnapshotRow[]> {
  const db = database();
  const { data, error } = await db
    .from('token_market_snapshots')
    .select('*')
    .eq('token_id', tokenId)
    .order('day', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Snapshot lookup failed: ${error.message}`);
  return ((data || []) as SnapshotRow[]).reverse();
}
