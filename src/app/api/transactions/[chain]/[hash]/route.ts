import { chainKeys,type ChainKey } from '@/lib/types';
import { adapter } from '@/lib/server/adapters';
import { NearAdapter } from '@/lib/server/adapters/near';
import { errorResponse } from '@/lib/server/errors';
const HASH: Record<'solana'|'near'|'evm',RegExp>={solana:/^[1-9A-HJ-NP-Za-km-z]{64,100}$/,near:/^[1-9A-HJ-NP-Za-km-z]{43,44}$/,evm:/^0x[a-fA-F0-9]{64}$/};
export async function GET(request:Request,{params}:{params:Promise<{chain:string;hash:string}>}){const {chain,hash}=await params;const family=chain==='solana'||chain==='near'?chain:'evm';if(!chainKeys.includes(chain as ChainKey)||!HASH[family].test(hash))return Response.json({error:'Invalid transaction identifier.'},{status:400});try{if(chain==='near'){const sender=new URL(request.url).searchParams.get('account')||undefined;return Response.json(await new NearAdapter().verifyTransaction(hash,sender),{headers:{'Cache-Control':'no-store'}});}return Response.json(await adapter(chain as ChainKey).verifyTransaction(hash),{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
