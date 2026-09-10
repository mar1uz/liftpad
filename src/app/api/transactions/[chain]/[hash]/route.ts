import { chainKeys,type ChainKey } from '@/lib/types';
import { adapter } from '@/lib/server/adapters';
import { errorResponse } from '@/lib/server/errors';
export async function GET(_request:Request,{params}:{params:Promise<{chain:string;hash:string}>}){const {chain,hash}=await params;if(!chainKeys.includes(chain as ChainKey)||!(chain==='solana'?/^[1-9A-HJ-NP-Za-km-z]{64,100}$/:/^0x[a-fA-F0-9]{64}$/).test(hash))return Response.json({error:'Invalid transaction identifier.'},{status:400});try{return Response.json(await adapter(chain as ChainKey).verifyTransaction(hash),{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
