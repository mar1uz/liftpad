import type { ChainAdapter,LaunchDraft,QuoteRequest,TradeQuote,PreparedTransaction } from '@/lib/types';
import { rpcUrl } from '../config';
import { ProviderError } from '../errors';
export class SolanaAdapter implements ChainAdapter {
 async launch(_draft:LaunchDraft):Promise<PreparedTransaction>{throw new ProviderError('LaunchLab Platform PDA and transaction-builder validation are required.',503,'LAUNCHLAB_NOT_CONFIGURED');}
 async quote(_request:QuoteRequest):Promise<TradeQuote>{throw new ProviderError('Solana trading awaits the configured LaunchLab/Raydium transaction integration.',503,'SOLANA_TRADING_NOT_CONFIGURED');}
 async buildTransaction(_quote:TradeQuote):Promise<PreparedTransaction>{throw new ProviderError('Solana transactions are not enabled.',503);}
 async verifyTransaction(hash:string){
  const r=await fetch(rpcUrl('solana'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getSignatureStatuses',params:[[hash],{searchTransactionHistory:true}]}),signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw new ProviderError('Solana RPC is unavailable.');const data=await r.json();if(data.error)throw new ProviderError('Solana RPC rejected the request.');const value=data.result?.value?.[0];
  if(!value)return {status:'pending' as const};return {status:value.err?'failed' as const:value.confirmationStatus==='finalized'?'confirmed' as const:'pending' as const,block:String(value.slot)};
 }
 async getPoolData(_address:string):Promise<{token0:string;token1:string;fee:number;source:string;observedAt:string}>{throw new ProviderError('Solana pool decoding awaits integration validation.');}
}
