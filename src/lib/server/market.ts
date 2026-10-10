import { z } from 'zod';
import { chainFromDex } from '../chains';
import { chainKeys, type ChainKey, type Token } from '../types';
import { ProviderError } from './errors';
import { usableTokenImage } from '../format';

const num = z.number().finite().nullable().optional();
const pairSchema = z.object({
  chainId: z.string(),
  pairAddress: z.string(),
  dexId: z.string().optional(),
  baseToken: z.object({ address: z.string(), name: z.string(), symbol: z.string() }),
  quoteToken: z.object({ address: z.string(), symbol: z.string() }),
  priceUsd: z.string().optional(),
  priceChange: z.object({ m5: num, h1: num, h6: num, h24: num }).optional(),
  volume: z.object({ h24: num }).optional(),
  liquidity: z.object({ usd: num }).optional(),
  marketCap: num,
  fdv: num,
  pairCreatedAt: z.number().optional(),
  info: z.object({ imageUrl: z.string().optional() }).optional(),
  url: z.string().optional(),
});

const QUOTE_SYMBOLS = new Set(['SOL', 'WSOL', 'USDC', 'USDT', 'ETH', 'WETH', 'BNB', 'WBNB', 'HYPE', 'USDT0', 'USD', 'DAI', 'USDC.E', 'NEAR', 'WNEAR']);
const PER_CHAIN = 20;
const SEARCH: Record<ChainKey, string> = {
  solana: 'pump',
  base: 'base',
  bsc: 'bnb',
  hyperevm: 'hype',
  arbitrum: 'arbitrum',
  robinhood: 'hood',
  arc: 'arc',
  // 'near' alone returns mostly Solana/BSC tickers; wNEAR pairs are NEAR-native.
  near: 'wrap.near',
};

function headers() {
  return { Accept: 'application/json', 'User-Agent': 'LIFT-launchpad' };
}

function sparkFromChanges(price: number, chg?: { m5?: number | null; h1?: number | null; h6?: number | null; h24?: number | null }) {
  if (!Number.isFinite(price) || price <= 0) return undefined;
  const at = (pct?: number | null) => {
    if (pct == null || !Number.isFinite(pct) || pct <= -99.999) return undefined;
    const prev = price / (1 + pct / 100);
    return Number.isFinite(prev) && prev > 0 ? prev : undefined;
  };
  const pts = [at(chg?.h24), at(chg?.h6), at(chg?.h1), at(chg?.m5), price].filter((n): n is number => n != null);
  return pts.length >= 2 ? pts : undefined;
}

export function toToken(raw: unknown): Token | undefined {
  const parsed = pairSchema.safeParse(raw);
  if (!parsed.success) return;
  const p = parsed.data;
  const chain = chainFromDex(p.chainId);
  if (!chain) return;
  const price = Number(p.priceUsd);
  return {
    id: `${chain}:${p.pairAddress}`,
    chain,
    address: p.baseToken.address,
    poolAddress: p.pairAddress,
    name: p.baseToken.name,
    symbol: p.baseToken.symbol,
    quoteSymbol: p.quoteToken.symbol,
    quoteAddress: p.quoteToken.address,
    priceUsd: p.priceUsd && Number.isFinite(price) ? price : null,
    change24h: p.priceChange?.h24 ?? null,
    volume24h: p.volume?.h24 ?? null,
    liquidityUsd: p.liquidity?.usd ?? null,
    marketCap: p.marketCap ?? null,
    spark: Number.isFinite(price) && price > 0 ? sparkFromChanges(price, p.priceChange) : undefined,
    image: usableTokenImage(p.info?.imageUrl),
    createdAt: p.pairCreatedAt ? new Date(p.pairCreatedAt).toISOString() : undefined,
    source: 'dexscreener',
    observedAt: new Date().toISOString(),
    url: p.url || `https://dexscreener.com/${p.chainId}/${p.pairAddress}`,
    dexId: p.dexId,
  };
}

export function normalizePairs(data: unknown): Token[] {
  const tokens: Token[] = [];
  const list = Array.isArray(data) ? data : z.object({ pairs: z.array(z.unknown()).nullable() }).parse(data).pairs || [];
  for (const raw of list) {
    const token = toToken(raw);
    if (token) tokens.push(token);
  }
  return [...new Map(tokens.map((t) => [t.id, t])).values()];
}

async function dexGet(url: string, revalidate = 45): Promise<unknown> {
  const response = await fetch(url, { headers: headers(), next: { revalidate }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new ProviderError(response.status === 429 ? 'Market data is busy. Please try again shortly.' : 'Market data is temporarily unavailable.', 503, 'MARKET_UNAVAILABLE');
  return response.json();
}

export async function searchMarket(query: string): Promise<Token[]> {
  return normalizePairs(await dexGet(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`, 30));
}

export async function getPair(chain: string, pool: string): Promise<Token | undefined> {
  return normalizePairs(await dexGet(`https://api.dexscreener.com/latest/dex/pairs/${encodeURIComponent(chain)}/${encodeURIComponent(pool)}`, 15))[0];
}

async function tokensFor(chainId: string, addresses: string[]): Promise<Token[]> {
  if (!addresses.length) return [];
  const unique = [...new Set(addresses)].slice(0, 30);
  try {
    const data = await dexGet(`https://api.dexscreener.com/tokens/v1/${encodeURIComponent(chainId)}/${unique.join(',')}`, 45);
    return normalizePairs(data);
  } catch {
    return [];
  }
}

function profileIconUrl(icon?: string): string | undefined {
  if (!icon) return undefined;
  if (icon.startsWith('https://')) return usableTokenImage(icon);
  if (/^[A-Za-z0-9_-]+$/.test(icon)) {
    return usableTokenImage(`https://cdn.dexscreener.com/cms/images/${icon}`);
  }
  return undefined;
}

export async function newLaunches(): Promise<Token[]> {
  const profileUrls = ['https://api.dexscreener.com/token-profiles/latest/v1', 'https://api.dexscreener.com/token-boosts/latest/v1'];
  const searches = [
    ...chainKeys.map((chain) => dexGet(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(SEARCH[chain])}`, 45).catch(() => ({ pairs: [] }))),
    dexGet('https://api.dexscreener.com/latest/dex/search?q=xstock', 45).catch(() => ({ pairs: [] })),
    dexGet('https://api.dexscreener.com/latest/dex/search?q=googl', 45).catch(() => ({ pairs: [] })),
  ];
  const extras = profileUrls.map((url) => dexGet(url, 45).catch(() => []));
  const results = await Promise.all([...searches, ...extras]);
  const searchTokens = results.slice(0, searches.length).flatMap((data) => normalizePairs(data));
  const profileItems = results.slice(searches.length).flatMap((data) => (Array.isArray(data) ? data : [])) as {
    chainId?: string;
    tokenAddress?: string;
    icon?: string;
  }[];
  const byChain = new Map<string, string[]>();
  const iconByMint = new Map<string, string>();
  for (const item of profileItems) {
    if (!item.chainId || !item.tokenAddress || !chainFromDex(item.chainId)) continue;
    const list = byChain.get(item.chainId) || [];
    list.push(item.tokenAddress);
    byChain.set(item.chainId, list);
    const icon = profileIconUrl(item.icon);
    const chain = chainFromDex(item.chainId);
    if (icon && chain) iconByMint.set(`${chain}:${item.tokenAddress.toLowerCase()}`, icon);
  }
  const profileTokens = (await Promise.all([...byChain.entries()].map(([id, addrs]) => tokensFor(id, addrs)))).flat();
  const merged = [...new Map([...profileTokens, ...searchTokens].map((t) => [t.id, t])).values()].map((t) => {
    const fallback = iconByMint.get(`${t.chain}:${t.address.toLowerCase()}`);
    return { ...t, image: usableTokenImage(t.image) || fallback || t.image };
  });
  const out: Token[] = [];
  for (const chain of chainKeys) {
    const rows = merged
      .filter((t) => t.chain === chain && !QUOTE_SYMBOLS.has(t.symbol.toUpperCase()) && t.poolAddress)
      .sort((a, b) => (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0))
      .slice(0, PER_CHAIN);
    out.push(...rows);
  }
  return out;
}
