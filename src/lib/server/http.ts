import { ProviderError } from './errors';
export async function readJson(request:Request,max=16384){
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw new ProviderError('JSON content is required.',415);
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new ProviderError('Cross-origin writes are not allowed.',403);
 const reader=request.body?.getReader();if(!reader)throw new ProviderError('Request body is required.',400);let size=0;const chunks:Uint8Array[]=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw new ProviderError('Request is too large.',413);}chunks.push(value);}}finally{reader.releaseLock();}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new ProviderError('Invalid JSON.',400);}
}
