import assert from 'node:assert/strict';
import test from 'node:test';
import { explorerName, explorerUrl } from '../src/lib/chains';

test('BNB token links go to BscScan, not Solscan', () => {
  const token = '0xb4a16c4872c788a1447c436187fa382d0604e155';
  assert.equal(explorerUrl('bsc', 'token', token), `https://bscscan.com/token/${token}`);
  assert.equal(explorerName('bsc'), 'BscScan');
  assert.equal(explorerUrl('solana', 'token', 'Mint111111111111111111111111111111111111111'), 'https://solscan.io/token/Mint111111111111111111111111111111111111111');
  assert.equal(explorerName('solana'), 'Solscan');
  assert.equal(explorerName('base'), 'Basescan');
});
