import type { ChainKey } from '../types';

const GT_NETWORK: Partial<Record<ChainKey, string>> = {
  solana: 'solana',
  base: 'base',
  bsc: 'bsc',
  hyperevm: 'hyperevm',
  robinhood: 'robinhood',
  arc: 'arc',
  near: 'near',
};

type CacheEntry = { at: number; data: number[] };

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<number[] | null>>();
const TTL = 60_000;
const MAX_INFLIGHT = 4;
let active = 0;
const waiters: Array<() => void> = [];

async function limit<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_INFLIGHT) await new Promise<void>((resolve) => waiters.push(resolve));
  active += 1;
  try {
    return await fn();
  } finally {
    active -= 1;
    waiters.shift()?.();
  }
}

function downsample(values: number[], max = 60): number[] {
  if (values.length <= max) return values;
  const out: number[] = [];
  const last = values.length - 1;
  for (let i = 0; i < max; i++) out.push(values[Math.round((i * last) / (max - 1))]);
  return out;
}

async function fetchCloses(network: string, pool: string): Promise<number[] | null> {
  try {
    const res = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/${network}/pools/${encodeURIComponent(pool)}/ohlcv/minute?aggregate=1&limit=60`,
      { headers: { Accept: 'application/json', 'User-Agent': 'LIFT-launchpad' }, signal: AbortSignal.timeout(2500) },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { attributes?: { ohlcv_list?: unknown[] } } };
    const list = json?.data?.attributes?.ohlcv_list ?? [];
    const closes: number[] = [];
    const rows: { t: number; c: number }[] = [];
    for (const row of list) {
      if (!Array.isArray(row) || row.length < 5) continue;
      const t = Number(row[0]);
      const c = Number(row[4]);
      if (!Number.isFinite(t) || !Number.isFinite(c)) continue;
      rows.push({ t, c });
    }
    if (rows.length < 2) return null;
    rows.sort((a, b) => a.t - b.t);
    for (const r of rows) closes.push(r.c);
    return downsample(closes);
  } catch {
    return null;
  }
}

export async function get24hCloses(chain: ChainKey, poolAddress: string): Promise<number[] | null> {
  const network = GT_NETWORK[chain];
  if (!network) return null;
  const key = `${network}/${poolAddress}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  let pending = inflight.get(key);
  if (!pending) {
    pending = limit(() => fetchCloses(network, poolAddress))
      .then((data) => {
        if (data && data.length >= 2) cache.set(key, { at: Date.now(), data });
        return data;
      })
      .finally(() => {
        inflight.delete(key);
      });
    inflight.set(key, pending);
  }
  return pending;
}
