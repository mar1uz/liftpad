import assert from 'node:assert/strict';
import test from 'node:test';
import { usableTokenImage } from '../src/lib/format';
import { ProviderError } from '../src/lib/server/errors';
import {
  assertSufficientLaunchLabBalance,
  estimateBeforeSlippage,
  formatLaunchLabTokenAmount,
  parseLaunchLabTokenAmount,
} from '../src/lib/server/launchlab-amounts';

test('formats LaunchLab raw token output with the mint decimals', () => {
  assert.equal(formatLaunchLabTokenAmount(35_586_490_508n, 6), '35586.490508');
  assert.equal(formatLaunchLabTokenAmount('1000000', 6), '1');
});

test('parses a sell amount exactly and rejects excess precision', () => {
  assert.equal(parseLaunchLabTokenAmount('1.25', 6), 1_250_000n);
  assert.throws(
    () => parseLaunchLabTokenAmount('1.0000001', 6),
    (error) => error instanceof ProviderError && error.code === 'INVALID_TOKEN_AMOUNT' && error.status === 400,
  );
});

test('recovers the displayed pre-slippage amount from Raydium minimum output', () => {
  assert.equal(estimateBeforeSlippage(35_408_558_055n, 50), 35_586_490_508n);
});

test('rejects a sell quote before Raydium when the wallet balance is too small', () => {
  assert.doesNotThrow(() => assertSufficientLaunchLabBalance(2_000_000n, 1_000_000n));
  assert.throws(
    () => assertSufficientLaunchLabBalance(999_999n, 1_000_000n),
    (error) => error instanceof ProviderError && error.code === 'INSUFFICIENT_BALANCE' && error.status === 400,
  );
});

test('accepts data-URL and HTTPS token images while rejecting unsafe protocols', () => {
  const dataUrl = 'data:image/png;base64,AA==';
  const httpsUrl = 'https://example.com/token.png';

  assert.equal(usableTokenImage(dataUrl), dataUrl);
  assert.equal(usableTokenImage(httpsUrl), httpsUrl);
  assert.equal(usableTokenImage('http://example.com/token.png'), undefined);
  assert.equal(usableTokenImage('javascript:alert(1)'), undefined);
});
