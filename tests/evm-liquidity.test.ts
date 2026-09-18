import assert from 'node:assert/strict';
import test from 'node:test';
import { parseEther, parseUnits } from 'viem';
import { buildEvmLaunch, buildEvmLiquidity, minimumOutput } from '../src/lib/server/evm-launch';
import { chainKeys } from '../src/lib/types';

const RH_V2_ROUTER = '0x89e5DB8B5aA49aA85AC63f691524311AEB649eba';
const RH_V3_NPM = '0x73991a25c818bf1f1128deaab1492d45638de0d3';
const ACCOUNT = '0x6810EB6699f8d497de9DcCCE34774fAD87759552';
const TOKEN = '0xb4a16c4872c788a1447c436187fa382d0604e155';

const NATIVE_V2 = [
  ['base', 8453, '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24'],
  ['bsc', 56, '0x10ED43C718714eb63d5aA57B78B54704E256024E'],
  ['hyperevm', 999, '0xb4a9C4e6Ea8E2191d2FA5B380452a634Fb21240A'],
  ['arbitrum', 42161, '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24'],
  ['robinhood', 4663, RH_V2_ROUTER],
] as const;

test('all five EVM create networks build deploy and native liquidity transactions on the selected chain', () => {
  for (const [chain, chainId, router] of NATIVE_V2) {
    const launch = buildEvmLaunch({ chain, name: 'Audit Token', symbol: 'AUDIT', supply: '1000000', account: ACCOUNT });
    assert.equal(launch.fee.chainId, chainId);
    assert.equal(launch.deploy.chainId, chainId);
    assert.ok(launch.deploy.data.length > 1000);

    const liquidity = buildEvmLiquidity({
      chain,
      token: TOKEN,
      tokenAmount: '1000',
      quoteAmount: '0.07',
      account: ACCOUNT,
    });
    assert.equal(liquidity.add.chainId, chainId);
    assert.equal(liquidity.add.to?.toLowerCase(), router.toLowerCase());
    assert.equal(liquidity.add.value, parseEther('0.07').toString());
    const encodedTokenAmount = BigInt(`0x${liquidity.add.data.slice(74, 138)}`);
    assert.equal(encodedTokenAmount, parseUnits('1000', 18));
  }
});

test('Arc builds a USDC-funded Uniswap V3 position with 6-decimal quote amounts', () => {
  const launch = buildEvmLaunch({ chain: 'arc', name: 'Arc Token', symbol: 'ARCX', supply: '1000000', account: ACCOUNT });
  assert.equal(launch.fee.chainId, 5042);
  assert.equal(launch.fee.value, parseEther('1').toString());
  const liquidity = buildEvmLiquidity({
    chain: 'arc',
    token: TOKEN,
    tokenAmount: '1000',
    quoteAmount: '10.5',
    quoteToken: '0x3600000000000000000000000000000000000000',
    quoteDecimals: 6,
    account: ACCOUNT,
  });
  assert.equal(liquidity.add.chainId, 5042);
  assert.equal(liquidity.add.to?.toLowerCase(), '0x39654a85a4c05127f5fd6ed22caec077a0fb1377');
  assert.equal(liquidity.add.value, '0');
  const approveQuote = (liquidity as { approveQuote?: { data: string } }).approveQuote;
  assert.ok(approveQuote && approveQuote.data.length > 10);
});

test('network catalog includes Arbitrum and no longer exposes Stable', () => {
  assert.ok(chainKeys.includes('arbitrum'));
  assert.ok(chainKeys.includes('arc'));
  assert.equal((chainKeys as readonly string[]).includes('stable'), false);
});

test('slippage protection keeps a non-zero minimum for normal quotes', () => {
  assert.equal(minimumOutput(1_000_000n, 500), 950_000n);
  assert.equal(minimumOutput(1_000_000n, 30), 997_000n);
  assert.throws(() => minimumOutput(1n, 10_000), /slippage/i);
});

test('Robinhood native ETH liquidity uses Uniswap V2, not the v3 position NFT', () => {
  const built = buildEvmLiquidity({
    chain: 'robinhood',
    token: TOKEN,
    tokenAmount: '1000',
    quoteAmount: '0.0195',
    account: ACCOUNT,
  });
  assert.equal(built.add.to?.toLowerCase(), RH_V2_ROUTER.toLowerCase());
  assert.notEqual(built.add.to?.toLowerCase(), RH_V3_NPM.toLowerCase());
  assert.equal(built.add.chainId, 4663);
});
