import type { LaunchDraft } from './types';
export const STAGES = ['draft','token','approval','pool','liquidity','complete'] as const;
export function advanceDraft(draft: LaunchDraft, stage: LaunchDraft['stage'], hash: string, result: { status:'pending'|'confirmed'|'failed'; contractAddress?:string }): LaunchDraft {
  const index=STAGES.indexOf(stage);
  if(index !== STAGES.indexOf(draft.stage)+1) throw new Error('Launch steps must be confirmed in order.');
  if(draft.transactions.some(tx=>tx.hash===hash && tx.status==='confirmed')) return draft;
  const transactions=[...draft.transactions.filter(tx=>tx.hash!==hash),{stage,hash,status:result.status}];
  return {...draft,transactions,stage:result.status==='confirmed'?stage:draft.stage,
    ...(stage==='token'&&result.status==='confirmed'&&result.contractAddress?{tokenAddress:result.contractAddress}:{}),updatedAt:new Date().toISOString()};
}
