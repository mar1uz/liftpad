import {z} from 'zod';
import {chainKeys} from '@/lib/types';
import {validWebhook} from '@/lib/server/webhook';
import {database} from '@/lib/server/supabase';
import {EvmAdapter} from '@/lib/server/adapters/evm';
import {ProviderError,errorResponse} from '@/lib/server/errors';
const schema=z.object({chain:z.enum(chainKeys).exclude(['solana']),transactionHash:z.string().regex(/^0x[a-fA-F0-9]{64}$/),logIndex:z.number().int().min(0),blockHash:z.string().regex(/^0x[a-fA-F0-9]{64}$/)});
export async function POST(request:Request){try{
 const secret=process.env.PROVIDER_WEBHOOK_SECRET;if(!secret)throw new ProviderError('Provider ingestion is not configured.');
 const reader=request.body?.getReader();if(!reader)throw new ProviderError('Body required.',400);const chunks:Uint8Array[]=[];let size=0;try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();throw new ProviderError('Payload too large.',413);}chunks.push(value);}}finally{reader.releaseLock();}
 const raw=Buffer.concat(chunks).toString('utf8');if(!validWebhook(raw,request.headers.get('x-still-timestamp')||'',request.headers.get('x-still-signature')||'',secret))throw new ProviderError('Invalid webhook signature.',401);
 let input;try{input=schema.parse(JSON.parse(raw));}catch{throw new ProviderError('Invalid event envelope.',400);}
 const adapter=new EvmAdapter(input.chain),client=adapter.client();const receipt=await client.getTransactionReceipt({hash:input.transactionHash as `0x${string}`});
 if(receipt.blockHash.toLowerCase()!==input.blockHash.toLowerCase()||receipt.status!=='success')throw new ProviderError('Event no longer belongs to a successful canonical transaction.',409);
 const log=receipt.logs.find(l=>l.logIndex===input.logIndex);if(!log)throw new ProviderError('Event log not found.',404);
 await adapter.getPoolData(log.address);
 const finalized=await client.getBlock({blockTag:'finalized'});if(receipt.blockNumber>finalized.number)throw new ProviderError('Retry when the event is finalized.',409,'EVENT_NOT_FINAL');
 const {error}=await database().from('chain_events').upsert({chain:input.chain,transaction_hash:input.transactionHash.toLowerCase(),log_index:input.logIndex,block_hash:receipt.blockHash,block_number:receipt.blockNumber.toString(),pool_address:log.address.toLowerCase(),payload:{topics:log.topics,data:log.data}},{onConflict:'chain,transaction_hash,log_index',ignoreDuplicates:true});if(error)throw new ProviderError('Event persistence failed. Retry delivery.');
 return Response.json({accepted:true});
 }catch(e){return errorResponse(e);}}
