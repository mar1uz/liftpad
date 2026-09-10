'use client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { LaunchDraft } from './types';
let client:SupabaseClient|undefined;
export function cloudAvailable(){return !!(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);}
export function cloud(){if(!cloudAvailable())throw new Error('Cloud sync is not configured yet. Your drafts are saved on this device.');return client??=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);}
export async function syncWorkspace(kind:'evm'|'solana',drafts:LaunchDraft[],watch:string[]){
 const c=cloud();
 // Let Supabase verify SIWE/SIWS; a wallet connection alone is never authentication.
 const auth=await c.auth.signInWithWeb3(kind==='evm'?{chain:'ethereum',statement:'Sign in to LIFT to sync your drafts and watchlist.'}:{chain:'solana',statement:'Sign in to LIFT to sync your drafts and watchlist.'});
 if(auth.error)throw auth.error;if(!auth.data.user)throw new Error('Wallet sign-in did not complete.');
 const userId=auth.data.user.id;
 const existing=await c.from('launch_drafts').select('payload').eq('owner_id',userId);if(existing.error)throw existing.error;
 const merged=new Map<string,LaunchDraft>();for(const {payload} of existing.data||[])merged.set(payload.id,payload as LaunchDraft);
 for(const d of drafts){const old=merged.get(d.id);if(!old||Date.parse(d.updatedAt)>Date.parse(old.updatedAt))merged.set(d.id,d);}
 if(merged.size){const saved=await c.from('launch_drafts').upsert([...merged.values()].map(payload=>({id:payload.id,owner_id:userId,payload,updated_at:payload.updatedAt})),{onConflict:'id'});if(saved.error)throw saved.error;}
 const remoteWatch=await c.from('watchlist').select('token_id').eq('owner_id',userId);if(remoteWatch.error)throw remoteWatch.error;
 const allWatch=[...new Set([...watch,...(remoteWatch.data||[]).map(row=>row.token_id)])];
 if(allWatch.length){const saved=await c.from('watchlist').upsert(allWatch.map(token_id=>({owner_id:userId,token_id})),{onConflict:'owner_id,token_id'});if(saved.error)throw saved.error;}
 return {drafts:[...merged.values()],watch:allWatch};
}
