import { z } from 'zod';
import { chainKeys, type ChainKey, type QuoteAsset } from '../types';
import { ProviderError } from './errors';
const address=z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const dexSchema=z.object({ factory:address, router:address, quoter:address, routerStyle:z.enum(['swap-router-02','swap-router-v1']), fee:z.number().int().min(1).max(100000), approvedPools:z.array(address).min(1), reviewed:z.literal(true) });
export function rpcUrl(chain:ChainKey):string {
  const value=process.env[`RPC_${chain.toUpperCase()}`];
  if(!value) throw new ProviderError(`${chain} RPC is not configured.`,503,'RPC_NOT_CONFIGURED');
  const url=new URL(value); if(url.protocol!=='https:' && !(process.env.NODE_ENV==='development' && url.hostname==='127.0.0.1')) throw new ProviderError('RPC must use HTTPS.');
  return value;
}
export function dexConfig(chain:ChainKey) {
  try { return dexSchema.parse(JSON.parse(process.env[`DEX_${chain.toUpperCase()}`] || '{}')); }
  catch { throw new ProviderError(`Trading on ${chain} awaits a reviewed DEX configuration.`,503,'DEX_NOT_CONFIGURED'); }
}
const quoteSchema=z.object({chain:z.enum(chainKeys),address, symbol:z.string().min(1).max(40),name:z.string().min(1).max(100),decimals:z.number().int().min(0).max(36),kind:z.enum(['crypto','stock']),issuer:z.string().optional(),oracle:address.optional(),enabled:z.boolean()});
export function quoteAssets():QuoteAsset[] {
  try { return z.array(quoteSchema).parse(JSON.parse(process.env.QUOTE_ASSETS_JSON || '[]')).filter(a=>a.kind!=='stock'||a.chain==='robinhood'); }
  catch { throw new ProviderError('The quote asset registry is invalid.',503,'REGISTRY_INVALID'); }
}
export function stocksEnabled(){ return process.env.STOCK_TOKENS_ENABLED==='true' && !!process.env.ELIGIBILITY_VERIFIER_URL; }
