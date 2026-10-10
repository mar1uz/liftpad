import assert from 'node:assert/strict';
import test from 'node:test';
import { explorerName, explorerUrl } from '../src/lib/chains';
import { isNearAccountId, nearConfig, nearPoolAddress, nearPoolId, nearTokenAccountId, toBaseUnits, fromBaseUnits } from '../src/lib/near';
import { launchFeeLabel } from '../src/lib/protocol';
import { isEvmLiquidityPending } from '../src/lib/create-session';
import { defaultQuoteAddress } from '../src/lib/trade-quote';
import { chainKeys, type LaunchDraft } from '../src/lib/types';
import { buildFactoryArgs, launchTransactions, liquidityTransactions } from '../src/lib/server/near-launch';

test('NEAR is network #8 with mainnet defaults', () => {
  assert.equal(chainKeys.length, 8);
  assert.ok(chainKeys.includes('near'));
  const cfg = nearConfig();
  assert.equal(cfg.factory, 'tkn.near');
  assert.equal(cfg.ref, 'v2.ref-finance.near');
  assert.equal(cfg.wrap, 'wrap.near');
  assert.equal(defaultQuoteAddress('near'), 'wrap.near');
  assert.equal(launchFeeLabel('near'), '0.1 NEAR');
});

test('NEAR ids, pools and explorer links', () => {
  assert.equal(nearTokenAccountId('ORBIT'), 'orbit.tkn.near');
  assert.throws(() => nearTokenAccountId('OR-BIT'));
  assert.ok(isNearAccountId('marius.near'));
  assert.ok(!isNearAccountId('0x6810EB6699f8d497de9DcCCE34774fAD87759552'));
  assert.equal(nearPoolAddress(8941), 'refv1-8941');
  assert.equal(nearPoolId('refv1-8941'), 8941);
  assert.equal(nearPoolId('0xabc'), undefined);
  assert.equal(explorerUrl('near', 'token', 'orbit.tkn.near'), 'https://nearblocks.io/token/orbit.tkn.near');
  assert.equal(explorerUrl('near', 'tx', 'Abc'), 'https://nearblocks.io/txns/Abc');
  assert.equal(explorerName('near'), 'NearBlocks');
});

test('base units are exact for 18/24 decimals', () => {
  assert.equal(toBaseUnits('1', 24), '1000000000000000000000000');
  assert.equal(toBaseUnits('0.1', 24), '100000000000000000000000');
  assert.equal(toBaseUnits('800000000', 18), '800000000000000000000000000');
  assert.equal(fromBaseUnits('1500000000000000000000000', 24), '1.5');
  assert.throws(() => toBaseUnits('1e5', 18));
});

test('launch = LIFT fee transfer, then factory create_token with the whole supply to the creator', () => {
  const args = buildFactoryArgs({ name: 'Orbit', symbol: 'orbit', supply: '1000', account: 'marius.near' });
  assert.equal(args.owner_id, 'marius.near');
  assert.equal(args.total_supply, '1000000000000000000000');
  assert.equal(args.metadata.symbol, 'ORBIT');
  assert.equal(args.metadata.decimals, 18);
  const txs = launchTransactions({ args, deposit: '2300000000000000000000000', feeYocto: '100000000000000000000000', treasury: 'liftpad.near', factory: 'tkn.near' });
  assert.equal(txs.length, 2);
  assert.deepEqual(txs[0], { receiverId: 'liftpad.near', actions: [{ type: 'Transfer', deposit: '100000000000000000000000' }] });
  assert.equal(txs[1].receiverId, 'tkn.near');
  const call = txs[1].actions[0];
  assert.ok(call.type === 'FunctionCall' && call.methodName === 'create_token' && call.deposit === '2300000000000000000000000');
  const skipped = launchTransactions({ args, deposit: '1', feeYocto: '1', treasury: 'liftpad.near', factory: 'tkn.near', skipFee: true });
  assert.equal(skipped.length, 1);
});

test('new Ref pool: create, deposit both sides, add liquidity from the creator', () => {
  const txs = liquidityTransactions({
    ref: 'v2.ref-finance.near', wrap: 'wrap.near', token: 'orbit.tkn.near', account: 'marius.near',
    tokenRaw: '10', nearRaw: '20', poolId: 9000, createPool: true,
    refRegistered: false, refOnToken: false, accountOnWrap: false, depositToken: true, depositNear: true,
  });
  assert.deepEqual(txs.map((t) => t.receiverId), ['v2.ref-finance.near', 'orbit.tkn.near', 'wrap.near', 'v2.ref-finance.near']);
  const methods = txs.map((t) => t.actions.map((a) => (a.type === 'FunctionCall' ? a.methodName : a.type)));
  assert.deepEqual(methods[0], ['storage_deposit', 'register_tokens', 'add_simple_pool']);
  assert.deepEqual(methods[1], ['storage_deposit', 'ft_transfer_call']);
  assert.deepEqual(methods[2], ['storage_deposit', 'near_deposit', 'ft_transfer_call']);
  const add = txs[3].actions[0];
  assert.ok(add.type === 'FunctionCall' && add.methodName === 'add_liquidity');
  assert.deepEqual((add as { args: unknown }).args, { pool_id: 9000, amounts: ['10', '20'] });
});

test('resume with deposits already made sends only add_liquidity', () => {
  const txs = liquidityTransactions({
    ref: 'v2.ref-finance.near', wrap: 'wrap.near', token: 'orbit.tkn.near', account: 'marius.near',
    tokenRaw: '10', nearRaw: '20', poolId: 9000, createPool: false,
    refRegistered: true, refOnToken: true, accountOnWrap: true, depositToken: false, depositNear: false,
  });
  assert.equal(txs.length, 1);
  assert.equal(txs[0].receiverId, 'v2.ref-finance.near');
});

test('NEAR token without pool is resumable like EVM', () => {
  const draft = { chain: 'near', tokenAddress: 'orbit.tkn.near', stage: 'complete' } as LaunchDraft;
  assert.ok(isEvmLiquidityPending(draft));
  assert.ok(!isEvmLiquidityPending({ ...draft, poolAddress: 'refv1-1' }));
});
