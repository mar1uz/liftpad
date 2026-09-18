import assert from 'node:assert/strict';
import test from 'node:test';
import { isEvmLiquidityPending, isResumableLaunchDraft, nextEvmLiquidityAction } from '../src/lib/create-session';
import type { LaunchDraft } from '../src/lib/types';

function launch(stage: LaunchDraft['stage']): LaunchDraft {
  return {
    id: 'launch-1',
    chain: 'bsc',
    name: 'Genius',
    symbol: 'GENIUS',
    description: '',
    imageUrl: '',
    quoteAddress: '',
    quoteSymbol: 'BNB',
    supply: '1000000',
    tokenLiquidity: '1000',
    quoteLiquidity: '0.07',
    initialBuy: '0',
    stage,
    updatedAt: new Date(0).toISOString(),
    transactions: [],
  };
}

test('incomplete Create drafts remain resumable', () => {
  assert.equal(isResumableLaunchDraft(launch('draft')), true);
  assert.equal(isResumableLaunchDraft(launch('token')), true);
  assert.equal(isResumableLaunchDraft(launch('liquidity')), true);
});

test('completed launches with a verified pool are not resumed in Create', () => {
  const live = {
    ...launch('complete'),
    tokenAddress: '0x0000000000000000000000000000000000000001',
    poolAddress: '0x0000000000000000000000000000000000000002',
  };
  assert.equal(isResumableLaunchDraft(live), false);
  assert.equal(isResumableLaunchDraft(undefined), false);
});

test('an EVM contract is not live until its pool address is stored', () => {
  const deployed = { ...launch('complete'), tokenAddress: '0x0000000000000000000000000000000000000001' };
  assert.equal(isEvmLiquidityPending(deployed), true);
  assert.equal(isResumableLaunchDraft(deployed), true);
  assert.equal(
    isEvmLiquidityPending({
      ...deployed,
      tokenLiquidity: '',
      quoteLiquidity: '',
    }),
    true,
  );
  assert.equal(
    isEvmLiquidityPending({ ...deployed, poolAddress: '0x0000000000000000000000000000000000000002' }),
    false,
  );
  assert.equal(isEvmLiquidityPending({ ...deployed, chain: 'solana' }), false);
});

test('a confirmed liquidity tx without a live pair must be sent again', () => {
  assert.equal(nextEvmLiquidityAction({ live: true, liquidityTxStatus: 'confirmed' }), 'complete');
  assert.equal(nextEvmLiquidityAction({ live: false, liquidityTxStatus: 'pending' }), 'wait-pending');
  assert.equal(nextEvmLiquidityAction({ live: false, liquidityTxStatus: 'confirmed' }), 'send');
  assert.equal(nextEvmLiquidityAction({ live: false, liquidityTxStatus: 'failed' }), 'send');
  assert.equal(nextEvmLiquidityAction({ live: false }), 'send');
});
