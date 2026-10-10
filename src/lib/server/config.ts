import { z } from 'zod';
import { readFileSync } from 'fs';
import { join } from 'path';
import { chainKeys, type ChainKey, type QuoteAsset } from '../types';
import { ProviderError } from './errors';
import { nearConfig } from '../near';
const PUBLIC_RPC: Partial<Record<ChainKey, string>> = {
  solana: 'https://api.mainnet-beta.solana.com',
  base: 'https://mainnet.base.org',
  bsc: 'https://bsc-dataseed.binance.org',
  hyperevm: 'https://rpc.hyperliquid.xyz/evm',
  arbitrum: 'https://arb1.arbitrum.io/rpc',
  robinhood: 'https://rpc.mainnet.chain.robinhood.com',
  arc: 'https://rpc.mainnet.arc.io',
  near: nearConfig().rpc,
};
const address=z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const dexSchema=z.object({ factory:address, router:address, quoter:address, routerStyle:z.enum(['swap-router-02','swap-router-v1']), fee:z.number().int().min(1).max(100000), approvedPools:z.array(address).min(1), reviewed:z.literal(true) });
export function rpcUrl(chain:ChainKey):string {
  const value=process.env[`RPC_${chain.toUpperCase()}`] || PUBLIC_RPC[chain];
  if(!value) throw new ProviderError(`${chain} RPC is not configured.`,503,'RPC_NOT_CONFIGURED');
  const url=new URL(value); if(url.protocol!=='https:' && !(process.env.NODE_ENV==='development' && url.hostname==='127.0.0.1')) throw new ProviderError('RPC must use HTTPS.');
  return value;
}
export function dexConfig(chain:ChainKey) {
  try { return dexSchema.parse(JSON.parse(process.env[`DEX_${chain.toUpperCase()}`] || '{}')); }
  catch { throw new ProviderError(`Trading on ${chain} awaits a reviewed DEX configuration.`,503,'DEX_NOT_CONFIGURED'); }
}
const quoteSchema=z.object({chain:z.enum(chainKeys),address:z.string().min(1), symbol:z.string().min(1).max(40),name:z.string().min(1).max(100),decimals:z.number().int().min(0).max(36),kind:z.enum(['crypto','stock']),issuer:z.string().optional(),oracle:z.string().optional(),enabled:z.boolean()});

function loadQuoteAssetsRaw(): unknown {
  if (process.env.QUOTE_ASSETS_JSON) {
    return JSON.parse(process.env.QUOTE_ASSETS_JSON);
  }
  try {
    return JSON.parse(readFileSync(join(process.cwd(), 'data/quote-assets.json'), 'utf8'));
  } catch {
    return [];
  }
}

/** Stock quotes: Robinhood Stock Tokens on RH, Backed xStocks on Solana. */
export function quoteAssets(): QuoteAsset[] {
  try {
    const parsed = z.array(quoteSchema).parse(loadQuoteAssetsRaw());
    return parsed.filter((a) => {
      if (a.kind !== 'stock') return true;
      if (a.chain === 'robinhood') return true;
      if (a.chain === 'solana') return true; // xStocks
      return false;
    }) as QuoteAsset[];
  } catch {
    throw new ProviderError('The quote asset registry is invalid.', 503, 'REGISTRY_INVALID');
  }
}
export function stocksEnabled() {
  return process.env.STOCK_TOKENS_ENABLED === 'true' && !!process.env.ELIGIBILITY_VERIFIER_URL;
}
