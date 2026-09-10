import { searchMarket } from '@/lib/server/market';
import { errorResponse } from '@/lib/server/errors';
export async function GET(request:Request){
  const q=(new URL(request.url).searchParams.get('q')||'SOL').trim();
  if(q.length<2||q.length>80) return Response.json({error:'Search must contain 2–80 characters.'},{status:400});
  try{return Response.json({tokens:await searchMarket(q),source:'dexscreener',observedAt:new Date().toISOString()}, {headers:{'Cache-Control':'public, s-maxage=30, stale-while-revalidate=60'}});}catch(e){return errorResponse(e);}
}
