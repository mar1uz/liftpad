import type { LaunchDraft } from './types';

const EVM_LAUNCH_CHAINS = new Set<LaunchDraft['chain']>([
  'base',
  'bsc',
  'hyperevm',
  'arbitrum',
  'robinhood',
  'near',
]);

/** An EVM token contract exists, but no verified pool address is stored. */
export function isEvmLiquidityPending(
  draft: LaunchDraft | null | undefined,
): draft is LaunchDraft & { tokenAddress: string } {
  return Boolean(
    draft &&
      EVM_LAUNCH_CHAINS.has(draft.chain) &&
      draft.tokenAddress &&
      !draft.poolAddress,
  );
}

/** Incomplete launches, plus EVM tokens waiting on a pool, can reopen in Create. */
export function isResumableLaunchDraft(
  draft: LaunchDraft | null | undefined,
): draft is LaunchDraft {
  return Boolean(draft && (draft.stage !== 'complete' || isEvmLiquidityPending(draft)));
}

/** What Resume liquidity should do next. A confirmed-but-unpooled tx must not block a new send. */
export function nextEvmLiquidityAction(input: {
  live: boolean;
  liquidityTxStatus?: 'pending' | 'confirmed' | 'failed';
}): 'complete' | 'wait-pending' | 'send' {
  if (input.live) return 'complete';
  if (input.liquidityTxStatus === 'pending') return 'wait-pending';
  return 'send';
}
