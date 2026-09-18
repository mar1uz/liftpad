import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectInjectedEvmProviders,
  describeEvmWalletError,
  findEvmProviderForAddress,
  normalizeEvmProvider,
  preferredInjectedEvmProvider,
  type EvmProvider,
} from '../src/lib/evm-provider';

function provider(account: string, flags: Partial<EvmProvider> = {}): EvmProvider {
  return {
    ...flags,
    request: async ({ method }) => (method === 'eth_accounts' ? [account] : null),
  };
}

test('selects the provider that owns the connected EVM account', async () => {
  const phantom = provider('0x0000000000000000000000000000000000000001', { isPhantom: true });
  const metamask = provider('0x6810EB6699f8d497de9DcCCE34774fAD87759552', { isMetaMask: true });

  const selected = await findEvmProviderForAddress(
    [phantom, metamask],
    '0x6810eb6699f8d497de9dccce34774fad87759552',
  );

  assert.equal(selected, metamask);
});

test('does not fall back to a different wallet when the connected account is absent', async () => {
  const phantom = provider('0x0000000000000000000000000000000000000001', { isPhantom: true });
  assert.equal(
    await findEvmProviderForAddress(
      [phantom],
      '0x6810EB6699f8d497de9DcCCE34774fAD87759552',
    ),
    undefined,
  );
});

test('prefers MetaMask when Phantom and MetaMask are both injected', () => {
  const phantom = provider('0x0000000000000000000000000000000000000001', { isPhantom: true, isMetaMask: true });
  const metamask = provider('0x6810EB6699f8d497de9DcCCE34774fAD87759552', { isMetaMask: true });
  const ethereum = Object.assign(phantom, { providers: [phantom, metamask] });
  const candidates = collectInjectedEvmProviders(ethereum, phantom);
  const preferred = preferredInjectedEvmProvider(candidates);

  assert.equal(preferred?.isMetaMask, true);
  assert.equal(preferred?.isPhantom, false);
});

test('uses MetaMask when Phantom also exposes the same account', async () => {
  const account = '0x6810EB6699f8d497de9DcCCE34774fAD87759552';
  const phantom = provider(account, { isPhantom: true, isMetaMask: true });
  const metamask = provider(account, { isMetaMask: true });
  const selected = await findEvmProviderForAddress([phantom, metamask], account);
  assert.equal(selected, metamask);
});

test('Phantom spoofing isMetaMask is treated as Phantom', () => {
  const spoofed = normalizeEvmProvider(provider('0x1', { isMetaMask: true, isPhantom: true }));
  assert.equal(spoofed.isPhantom, true);
  assert.equal(spoofed.isMetaMask, false);
});

test('maps Phantom Unexpected error to a MetaMask reconnect hint', () => {
  assert.match(describeEvmWalletError(new Error('Unexpected error')), /MetaMask/);
  assert.match(describeEvmWalletError({ message: 'Unexpected error' }), /Phantom intercepted/);
  assert.equal(describeEvmWalletError(new Error('User rejected the request')), 'Transaction was cancelled in the wallet.');
});
