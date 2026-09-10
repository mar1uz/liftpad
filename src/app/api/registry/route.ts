import { quoteAssets, stocksEnabled } from '@/lib/server/config';
import { errorResponse } from '@/lib/server/errors';
export async function GET(){try{return Response.json({assets:quoteAssets().filter(a=>a.enabled&&(a.kind!=='stock'||stocksEnabled())),stocksEnabled:stocksEnabled()});}catch(e){return errorResponse(e);}}
