import { z } from 'zod';
import { chainFromDex } from '../chains';
import type { Token } from '../types';
import { ProviderError } from './errors';
const num=z.number().finite().nullable().optional();
const pairSchema=z.object({ chainId:z.string(),pairAddress:z.string(),baseToken:z.object({address:z.string(),name:z.string(),symbol:z.string()}),quoteToken:z.object({address:z.string(),symbol:z.string()}),priceUsd:z.string().optional(),priceChange:z.object({h24:num}).optional(),volume:z.object({h24:num}).optional(),liquidity:z.object({usd:num}).optional(),marketCap:num,fdv:num,pairCreatedAt:z.number().optional(),info:z.object({imageUrl:z.string().optional()}).optional() });
export function normalizePairs(data:unknown):Token[] {
  const result=z.object({pairs:z.array(z.unknown()).nullable()}).parse(data);
  const tokens:Token[]=[];
  for(const raw of result.pairs||[]){
    const parsed=pairSchema.safeParse(raw); if(!parsed.success)continue;
    const p=parsed.data,chain=chainFromDex(p.chainId); if(!chain)continue;
    const price=Number(p.priceUsd);
    tokens.push({id:`${chain}:${p.pairAddress}`,chain,address:p.baseToken.address,poolAddress:p.pairAddress,name:p.baseToken.name,symbol:p.baseToken.symbol,quoteSymbol:p.quoteToken.symbol,quoteAddress:p.quoteToken.address,priceUsd:p.priceUsd&&Number.isFinite(price)?price:null,change24h:p.priceChange?.h24??null,volume24h:p.volume?.h24??null,liquidityUsd:p.liquidity?.usd??null,marketCap:p.marketCap??null,image:p.info?.imageUrl?.startsWith('https://')?p.info.imageUrl:undefined,createdAt:p.pairCreatedAt?new Date(p.pairCreatedAt).toISOString():undefined,source:'dexscreener',observedAt:new Date().toISOString(),url:`https://dexscreener.com/${p.chainId}/${p.pairAddress}`});
  }
  return [...new Map(tokens.map(t=>[t.id,t])).values()];
}
export async function searchMarket(query:string):Promise<Token[]> {
  const response=await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`,{next:{revalidate:30},signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new ProviderError(response.status===429?'Market data is busy. Please try again shortly.':'Market data is temporarily unavailable.',503,'MARKET_UNAVAILABLE');
  return normalizePairs(await response.json());
}
export async function getPair(chain:string,pool:string):Promise<Token|undefined>{
  const response=await fetch(`https://api.dexscreener.com/latest/dex/pairs/${encodeURIComponent(chain)}/${encodeURIComponent(pool)}`,{next:{revalidate:15},signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new ProviderError('Pair data is temporarily unavailable.');
  return normalizePairs(await response.json())[0];
}
