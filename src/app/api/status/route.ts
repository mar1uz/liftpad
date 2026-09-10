import { chainKeys } from '@/lib/types';
import { dexConfig, quoteAssets, stocksEnabled } from '@/lib/server/config';
export async function GET(){
 const chains=chainKeys.map(chain=>{let dex=false;try{dexConfig(chain);dex=true;}catch{}return {chain,marketData:'available',rpc:!!process.env[`RPC_${chain.toUpperCase()}`],trading:dex&&!!process.env[`RPC_${chain.toUpperCase()}`],launch:false,reason:chain==='solana'?'LaunchLab platform configuration and integration validation required.':'Token deployment artifact and liquidity workflow require validation.'};});
 return Response.json({chains,storage:!!(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY),stocks:stocksEnabled(),publicLaunch:false});
}
