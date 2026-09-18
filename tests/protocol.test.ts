import assert from 'node:assert/strict';
import test from 'node:test';
import { launchFeeLabel } from '../src/lib/protocol';

test('labels launch fees with each network native currency', () => {
  assert.equal(launchFeeLabel('solana'), '0.01 SOL');
  assert.equal(launchFeeLabel('base'), '0.00005 ETH');
  assert.equal(launchFeeLabel('bsc'), '0.00005 BNB');
  assert.equal(launchFeeLabel('hyperevm'), '0.00005 HYPE');
  assert.equal(launchFeeLabel('robinhood'), '0.00005 ETH');
  assert.equal(launchFeeLabel('arc'), '1 USDC');
});
