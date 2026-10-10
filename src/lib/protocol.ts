import { CHAINS } from './chains';
import { nearConfig } from './near';
import type { ChainKey, Token } from './types';

/** LIFT protocol token. Standard mint. Fees split off-chain / via treasury, no transfer tax. */
export const PROTOCOL = {
  id: 'demo-lift',
  symbol: 'LIFT',
  name: 'LIFT',
  chain: 'solana' as const,
  treasuryShare: 0.5,
  creatorShare: 0.25,
  burnShare: 0.25,
  totalSupply: 1_000_000_000,
  launchFeeSol: 0.01,
  launchFeeEth: 0.00005,
  tradeFeeBps: 25,
  treasurySol: '9hcL7zEG5X8V4uwhRE2pLQN8KzVzAiqYTqa9Epmp2GDP',
  treasuryEvm: '0x6810EB6699f8d497de9DcCCE34774fAD87759552',
  solMint: 'So11111111111111111111111111111111111111112',
  siteUrl: 'https://liftpad.xyz',
  /** Creator airdrop: 25% of platform fees, paid on the 1st for the prior month. */
  airdropCadence: 'monthly_on_1st' as const,
  airdropShare: 0.25,
} as const;

export const PROTOCOL_HREF = PROTOCOL.siteUrl;

export type ProtocolSnapshot = {
  feesUsd: number;
  treasuryUsd: number;
  creatorUsd: number;
  burnedUsd: number;
  burnedTokens: number;
  remaining: number;
  burnedPct: number;
  creators: number;
  perCreatorUsd: number;
  illustrative: boolean;
};

const GENESIS = Date.parse('2026-09-01T00:00:00Z');
const BASE_FEES_USD = 84_200;
const USD_PER_HOUR = 18.4;
const LIFT_PER_USD = 286;
const BASE_CREATORS = 48;

export function protocolSnapshot(now = Date.now()): ProtocolSnapshot {
  const hours = Math.max(0, (now - GENESIS) / 3_600_000);
  const feesUsd = BASE_FEES_USD + hours * USD_PER_HOUR;
  const treasuryUsd = feesUsd * PROTOCOL.treasuryShare;
  const creatorUsd = feesUsd * PROTOCOL.creatorShare;
  const burnedUsd = feesUsd * PROTOCOL.burnShare;
  const burnedTokens = Math.min(PROTOCOL.totalSupply, Math.floor(burnedUsd * LIFT_PER_USD));
  const creators = BASE_CREATORS + Math.floor(hours / 18);
  return {
    feesUsd,
    treasuryUsd,
    creatorUsd,
    burnedUsd,
    burnedTokens,
    remaining: PROTOCOL.totalSupply - burnedTokens,
    burnedPct: (burnedTokens / PROTOCOL.totalSupply) * 100,
    creators,
    perCreatorUsd: creatorUsd / Math.max(1, creators),
    illustrative: true,
  };
}

export function isProtocolToken(token: Pick<Token, 'id'> | string) {
  return (typeof token === 'string' ? token : token.id) === PROTOCOL.id;
}

const CRYPTO_QUOTES = new Set(['SOL','WSOL','USDC','USDT','ETH','WETH','BNB','WBNB','HYPE','USDT0','USD','DAI','USDG','USDBC','USDC.E','WHYPE','BTCB','EMBER','PUMP','MET','ZORA','AXLUSDC']);

export function isStockPair(token: Pick<Token, 'chain' | 'quoteSymbol' | 'name' | 'symbol'>) {
  const q = (token.quoteSymbol || '').trim();
  const blob = `${q} ${token.name || ''} ${token.symbol || ''}`.toLowerCase();
  if (blob.includes('stock token') || blob.includes('xstock') || blob.includes('tokenized stock')) return true;
  if (/^[A-Z]{1,5}x$/i.test(q)) return true;
  if (token.chain === 'robinhood' && q && !CRYPTO_QUOTES.has(q.toUpperCase())) return true;
  return false;
}

export function launchFeeLabel(chain: ChainKey) {
  return chain === 'solana'
    ? `${PROTOCOL.launchFeeSol} ${CHAINS[chain].symbol}`
    : chain === 'near'
    ? `${nearConfig().launchFee} NEAR`
    : chain === 'arc'
    ? '1 USDC'
    : `${PROTOCOL.launchFeeEth} ${CHAINS[chain].symbol}`;
}
