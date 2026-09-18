import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MOVER_MIN_LIQUIDITY_USD,
  dailyCloses,
  networkRank,
  snapshotToToken,
  topMovers,
  type SnapshotRow,
} from '../src/lib/server/snapshots';

function row(partial: Partial<SnapshotRow>): SnapshotRow {
  return {
    token_id: 'solana:poolA',
    chain: 'solana',
    token_address: 'mintA',
    pool_address: 'poolA',
    name: 'Token A',
    symbol: 'TKA',
    quote_symbol: 'SOL',
    price_usd: 1,
    change_24h: 5,
    volume_24h: 1000,
    liquidity_usd: 50_000,
    market_cap: 1_000_000,
    image: null,
    source: 'dexscreener',
    day: '2026-09-18',
    observed_at: '2026-09-18T00:05:00.000Z',
    ...partial,
  };
}

test('topMovers keeps only the given day, sorted by 24h change, capped at the limit', () => {
  const rows = [
    row({ token_id: 'solana:a', change_24h: 12 }),
    row({ token_id: 'solana:b', change_24h: 48 }),
    row({ token_id: 'solana:c', change_24h: 30 }),
    row({ token_id: 'solana:d', change_24h: 99 }),
    row({ token_id: 'solana:e', change_24h: 77, day: '2026-09-17' }), // older day, ignored
  ];
  const movers = topMovers(rows, '2026-09-18', 3);
  assert.deepEqual(movers.map((r) => r.token_id), ['solana:d', 'solana:b', 'solana:c']);
});

test('topMovers drops dust pairs, missing prices and missing changes', () => {
  const rows = [
    row({ token_id: 'solana:dust', change_24h: 900, liquidity_usd: MOVER_MIN_LIQUIDITY_USD - 1 }),
    row({ token_id: 'solana:noprice', change_24h: 50, price_usd: null }),
    row({ token_id: 'solana:nochange', change_24h: null }),
    row({ token_id: 'solana:ok', change_24h: 4 }),
  ];
  const movers = topMovers(rows, '2026-09-18', 3);
  assert.deepEqual(movers.map((r) => r.token_id), ['solana:ok']);
});

test('topMovers accepts exactly the liquidity floor', () => {
  const movers = topMovers([row({ liquidity_usd: MOVER_MIN_LIQUIDITY_USD })], '2026-09-18', 3);
  assert.equal(movers.length, 1);
});

test('dailyCloses returns oldest-first points and skips unusable closes', () => {
  const rows = [
    row({ day: '2026-09-18', price_usd: 1.5 }),
    row({ day: '2026-09-16', price_usd: 1.1 }),
    row({ day: '2026-09-17', price_usd: null }), // skipped
    row({ day: '2026-09-15', price_usd: 0 }), // skipped
    row({ day: '2026-09-14', price_usd: 1.0 }),
  ];
  assert.deepEqual(dailyCloses(rows), [
    { day: '2026-09-14', closeUsd: 1.0 },
    { day: '2026-09-16', closeUsd: 1.1 },
    { day: '2026-09-18', closeUsd: 1.5 },
  ]);
});

test('networkRank ranks by 24h volume inside one chain and day only', () => {
  const rows = [
    row({ token_id: 'solana:a', volume_24h: 500 }),
    row({ token_id: 'solana:b', volume_24h: 900 }),
    row({ token_id: 'solana:c', volume_24h: 100 }),
    row({ token_id: 'base:x', chain: 'base', volume_24h: 5000 }), // other chain
    row({ token_id: 'solana:old', volume_24h: 9999, day: '2026-09-17' }), // other day
    row({ token_id: 'solana:novol', volume_24h: null }), // not counted
  ];
  assert.deepEqual(networkRank(rows, '2026-09-18', 'solana', 'solana:b'), { rank: 1, total: 3, day: '2026-09-18' });
  assert.deepEqual(networkRank(rows, '2026-09-18', 'solana', 'solana:c'), { rank: 3, total: 3, day: '2026-09-18' });
  assert.equal(networkRank(rows, '2026-09-18', 'solana', 'solana:missing'), null);
  assert.equal(networkRank(rows, '2026-09-18', 'solana', 'solana:novol'), null);
});

test('snapshotToToken maps snapshot rows into the app Token shape', () => {
  const token = snapshotToToken(row({ image: 'https://cdn.dexscreener.com/x.png', source: 'liftpad' }));
  assert.equal(token.id, 'solana:poolA');
  assert.equal(token.chain, 'solana');
  assert.equal(token.address, 'mintA');
  assert.equal(token.poolAddress, 'poolA');
  assert.equal(token.priceUsd, 1);
  assert.equal(token.change24h, 5);
  assert.equal(token.source, 'liftpad');
  assert.equal(token.image, 'https://cdn.dexscreener.com/x.png');
});
