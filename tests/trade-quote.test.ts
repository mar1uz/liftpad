import assert from 'node:assert/strict';
import test from 'node:test';
import type { Token } from '../src/lib/types';
import { NATIVE_EVM, defaultQuoteAddress, tradeQuoteAddress, tradeQuoteSymbol } from '../src/lib/trade-quote';

function token(partial: Partial<Token>): Token {
  return {
    id: 'bsc:token',
    chain: 'bsc',
    address: '0xb4a16c4872c788a1447c436187fa382d0604e155',
    poolAddress: '0x32214687C6B9d520Fc91f68943Af1a3F96EFb568',
    name: 'Genius',
    symbol: 'GENIUS',
    quoteSymbol: 'BNB',
    quoteAddress: undefined,
    priceUsd: null,
    change24h: null,
    volume24h: null,
    liquidityUsd: null,
    marketCap: null,
    source: 'liftpad',
    observedAt: new Date(0).toISOString(),
    ...partial,
  };
}

test('EVM sell quotes native BNB when the launch record omitted quoteAddress', () => {
  const genius = token({});
  assert.equal(tradeQuoteSymbol(genius), 'BNB');
  assert.equal(tradeQuoteAddress(genius), NATIVE_EVM);
  assert.equal(defaultQuoteAddress('bsc'), NATIVE_EVM);
});

test('EVM sell does not use the token mint as the quote asset', () => {
  const genius = token({ quoteAddress: '0xb4a16c4872c788a1447c436187fa382d0604e155' });
  assert.equal(tradeQuoteAddress(genius), NATIVE_EVM);
});

test('Solana lift launches stay SOL-quoted', () => {
  const mint = token({
    chain: 'solana',
    address: 'So11111111111111111111111111111111111111112',
    quoteSymbol: 'xStock',
    source: 'liftpad',
    dexId: 'launchlab',
  });
  assert.equal(tradeQuoteSymbol(mint), 'SOL');
  assert.equal(tradeQuoteAddress(mint), 'So11111111111111111111111111111111111111112');
});
