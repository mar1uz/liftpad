import { promises as fs } from 'fs';
import path from 'path';
import { chainKeys, type ChainKey, type Token } from '../types';
import { CHAINS, explorerUrl } from '../chains';
import { PROTOCOL } from '../protocol';
import { defaultQuoteAddress } from '../trade-quote';
import { usableTokenImage } from '../format';

export type PlatformLaunchRecord = {
  id: string;
  chain: ChainKey;
  name: string;
  symbol: string;
  description?: string;
  imageUrl?: string;
  tokenAddress: string;
  poolAddress?: string;
  creatorWallet: string;
  feeTx?: string;
  mintTx?: string;
  quoteSymbol?: string;
  quoteAddress?: string;
  quoteDecimals?: number;
  createdAt: string;
  stage: 'complete';
};

const FILE = path.join(process.cwd(), 'data', 'platform-launches.json');

async function readAll(): Promise<PlatformLaunchRecord[]> {
  try {
    const raw = await fs.readFile(FILE, 'utf8');
    const parsed = JSON.parse(raw) as PlatformLaunchRecord[];
    return Array.isArray(parsed)
      ? parsed.filter((row) => chainKeys.includes(row?.chain as ChainKey))
      : [];
  } catch {
    return [];
  }
}

async function writeAll(rows: PlatformLaunchRecord[]) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(rows, null, 2), 'utf8');
  await fs.rename(tmp, FILE);
}

export async function listPlatformLaunches(): Promise<PlatformLaunchRecord[]> {
  const rows = await readAll();
  // LaunchLab tokens are tradable before migration; EVM tokens require a verified pool address.
  return rows.filter((row) => row.chain === 'solana' || Boolean(row.poolAddress));
}

/** Lookup a completed LIFT launch by pool id or mint/token address. */
export async function findPlatformLaunch(
  chain: ChainKey,
  poolOrMint: string,
): Promise<PlatformLaunchRecord | undefined> {
  const needle = poolOrMint.trim();
  if (!needle) return undefined;
  const rows = await readAll();
  return rows.find(
    (r) =>
      r.chain === chain &&
      (r.poolAddress === needle || r.tokenAddress === needle || r.id === needle),
  );
}

export async function upsertPlatformLaunch(row: PlatformLaunchRecord): Promise<PlatformLaunchRecord> {
  const rows = await readAll();
  const without = rows.filter(
    (r) => !(r.chain === row.chain && r.tokenAddress === row.tokenAddress) && r.id !== row.id,
  );
  const next = [row, ...without].slice(0, 500);
  await writeAll(next);
  return row;
}

/** Map completed LIFT launches into Explore tokens until DEX Screener indexes them. */
export function platformLaunchToToken(row: PlatformLaunchRecord): Token {
  const pool = row.poolAddress || row.tokenAddress;
  const solana = row.chain === 'solana';
  return {
    id: `${row.chain}:${pool}`,
    chain: row.chain,
    address: row.tokenAddress,
    poolAddress: pool,
    name: row.name,
    symbol: row.symbol,
    // LaunchLab curve is always SOL-quoted; preferred xStock is display-only.
    quoteSymbol: solana ? 'SOL' : (row.quoteSymbol || CHAINS[row.chain].symbol),
    quoteAddress: solana ? PROTOCOL.solMint : (row.quoteAddress || defaultQuoteAddress(row.chain)),
    priceUsd: null,
    change24h: null,
    volume24h: null,
    liquidityUsd: null,
    marketCap: null,
    createdAt: row.createdAt,
    image: usableTokenImage(row.imageUrl),
    source: 'liftpad',
    observedAt: new Date().toISOString(),
    url: explorerUrl(row.chain, 'token', row.tokenAddress),
    description: row.description,
    dexId: solana ? 'launchlab' : undefined,
  };
}
