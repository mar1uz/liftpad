import { z } from 'zod';
import { chainKeys } from '@/lib/types';
import { adapter } from '@/lib/server/adapters';
import { quoteAssets } from '@/lib/server/config';
import { ProviderError,errorResponse } from '@/lib/server/errors';
import { readJson } from '@/lib/server/http';
const schema=z.object({chain:z.enum(chainKeys),pool:z.string().regex(/^[a-zA-Z0-9]{20,90}$/),tokenIn:z.string().regex(/^0x[a-fA-F0-9]{40}$/),amountIn:z.string().regex(/^\d{1,30}(\.\d{1,36})?$/),slippageBps:z.number().int().min(1).max(500),account:z.string().regex(/^0x[a-fA-F0-9]{40}$/)});
export async function POST(request:Request){try{const parsed=schema.safeParse(await readJson(request));if(!parsed.success)throw new ProviderError('Check the amount, account, network and pool.',400,'INVALID_TRADE');const {chain,...input}=parsed.data;const impl=adapter(chain);const pool=await impl.getPoolData(input.pool);const stock=quoteAssets().find(a=>a.chain===chain&&a.kind==='stock'&&[pool.token0,pool.token1].some(t=>t.toLowerCase()===a.address.toLowerCase()));
 // Fail closed until the issuer-approved access policy is implemented and reviewed.
 if(stock)throw new ProviderError('Stock Token trading requires a validated issuer eligibility integration.',403,'STOCK_ELIGIBILITY_REQUIRED');
 return Response.json(await impl.quote(input),{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
