import {
  createPublicClient,
  encodeDeployData,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  getAddress,
  http,
  parseAbi,
  parseEther,
  parseUnits,
  zeroAddress,
  type Abi,
  type Hex,
} from 'viem';
import { CHAINS } from '@/lib/chains';
import { PROTOCOL } from '@/lib/protocol';
import { ARC_USDC, NATIVE_EVM } from '@/lib/trade-quote';
import type { ChainKey, PreparedTransaction, QuoteRequest, TradeQuote } from '@/lib/types';
import { rpcUrl } from './config';
import { ProviderError } from './errors';
import { findPlatformLaunch } from './platform-launches';
import artifact from './lift-erc20.json';

const EVM_LAUNCH: ChainKey[] = ['base', 'bsc', 'hyperevm', 'arbitrum', 'robinhood', 'arc'];
const FEE_WEI = parseEther(String(PROTOCOL.launchFeeEth));

export function supportsEvmLaunch(chain: ChainKey) {
  return EVM_LAUNCH.includes(chain);
}

export function buildEvmLaunch(input: {
  chain: ChainKey;
  name: string;
  symbol: string;
  supply: string;
  account: string;
}) {
  if (!supportsEvmLaunch(input.chain)) throw new ProviderError(`Launch on ${input.chain} is not enabled yet.`, 503, 'LAUNCH_UNSUPPORTED');
  const chainId = CHAINS[input.chain].id;
  if (!chainId) throw new ProviderError('Unknown chain id.', 400);
  const supply = parseUnits(input.supply || '1000000000', 18);
  if (supply <= 0n) throw new ProviderError('Supply must be positive.', 400);
  const bytecode = artifact.bytecode as Hex;
  const abi = artifact.abi as Abi;
  const deployData = encodeDeployData({ abi, bytecode, args: [input.name, input.symbol, supply] });
  const expiresAt = Date.now() + 60_000;
  const feeAmount = input.chain === 'arc' ? parseEther('1') : FEE_WEI;
  const feeLabel = input.chain === 'arc' ? '1 USDC' : `${PROTOCOL.launchFeeEth} ${CHAINS[input.chain].symbol}`;
  const fee: PreparedTransaction = {
    chain: input.chain,
    chainId,
    to: getAddress(PROTOCOL.treasuryEvm),
    data: '0x',
    value: feeAmount.toString(),
    description: `LIFT launch fee ${feeLabel}`,
    expiresAt,
  };
  const deploy: PreparedTransaction = {
    chain: input.chain,
    chainId,
    data: deployData,
    value: '0',
    description: `Deploy ${input.symbol}`,
    expiresAt,
  };
  return { fee, deploy, treasury: PROTOCOL.treasuryEvm, expiresAt };
}

const V2_ROUTER: Partial<Record<ChainKey, `0x${string}`>> = {
  base: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24',
  bsc: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
  // HyperSwap V2 on HyperEVM (verified: factory + WHYPE via router.WETH())
  hyperevm: '0xb4a9C4e6Ea8E2191d2FA5B380452a634Fb21240A',
  // Official Uniswap V2 Router02 on Arbitrum One (42161)
  arbitrum: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24',
  // Official Uniswap V2 Router02 on Robinhood Chain (4663)
  robinhood: '0x89e5DB8B5aA49aA85AC63f691524311AEB649eba',
};

/** Official Uniswap V3 + WETH on Robinhood Chain (4663). Native ETH pools use V2. */
const RH = {
  weth: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73' as const,
  npm: '0x73991a25c818bf1f1128deaab1492d45638de0d3' as const,
  fee: 3000,
  tickSpacing: 60,
};
const ARC = {
  usdc: ARC_USDC as `0x${string}`,
  factory: '0xf0db7b58379503491d857db50ac9ece64c653918' as `0x${string}`,
  quoter: '0x7dfd4f31be6814d2906bde155c3e1b146eac1468' as `0x${string}`,
  router: '0x53bf6b0684ec7ef91e1387da3d1a1769bc5a6f77' as `0x${string}`,
  npm: '0x39654a85a4c05127f5fd6ed22caec077a0fb1377' as `0x${string}`,
  fee: 3000,
  tickSpacing: 60,
};

const routerAbi = [
  {
    type: 'function',
    name: 'addLiquidityETH',
    stateMutability: 'payable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amountTokenDesired', type: 'uint256' },
      { name: 'amountTokenMin', type: 'uint256' },
      { name: 'amountETHMin', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [
      { name: 'amountToken', type: 'uint256' },
      { name: 'amountETH', type: 'uint256' },
      { name: 'liquidity', type: 'uint256' },
    ],
  },
] as const;
const arcRouterAbi = parseAbi([
  'function addLiquidity(address tokenA,address tokenB,uint256 amountADesired,uint256 amountBDesired,uint256 amountAMin,uint256 amountBMin,address to,uint256 deadline) returns (uint256 amountA,uint256 amountB,uint256 liquidity)',
  'function getAmountsOut(uint256 amountIn,address[] path) view returns (uint256[] amounts)',
  'function factory() view returns (address)',
]);
const arcQuoterAbi = parseAbi([
  'function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)',
]);
const arcSwapRouterAbi = parseAbi([
  'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)',
]);

const v2RouterMetadataAbi = parseAbi([
  'function factory() view returns (address)',
  'function WETH() view returns (address)',
  'function getAmountsOut(uint256 amountIn,address[] path) view returns (uint256[] amounts)',
]);
const v2FactoryAbi = parseAbi(['function getPair(address,address) view returns (address)']);
const v2PairAbi = parseAbi([
  'function getReserves() view returns (uint112 reserve0,uint112 reserve1,uint32 blockTimestampLast)',
  'function totalSupply() view returns (uint256)',
]);
const v3FactoryAbi = parseAbi(['function getPool(address,address,uint24) view returns (address)']);
const v3PoolLiquidityAbi = parseAbi(['function liquidity() view returns (uint128)']);

const npmAbi = [
  {
    type: 'function',
    name: 'createAndInitializePoolIfNecessary',
    stateMutability: 'payable',
    inputs: [
      { name: 'token0', type: 'address' },
      { name: 'token1', type: 'address' },
      { name: 'fee', type: 'uint24' },
      { name: 'sqrtPriceX96', type: 'uint160' },
    ],
    outputs: [{ name: 'pool', type: 'address' }],
  },
  {
    type: 'function',
    name: 'mint',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'token0', type: 'address' },
          { name: 'token1', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'tickLower', type: 'int24' },
          { name: 'tickUpper', type: 'int24' },
          { name: 'amount0Desired', type: 'uint256' },
          { name: 'amount1Desired', type: 'uint256' },
          { name: 'amount0Min', type: 'uint256' },
          { name: 'amount1Min', type: 'uint256' },
          { name: 'recipient', type: 'address' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
    ],
    outputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'liquidity', type: 'uint128' },
      { name: 'amount0', type: 'uint256' },
      { name: 'amount1', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'refundETH',
    stateMutability: 'payable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'multicall',
    stateMutability: 'payable',
    inputs: [{ name: 'data', type: 'bytes[]' }],
    outputs: [{ name: 'results', type: 'bytes[]' }],
  },
] as const;

function isqrt(n: bigint): bigint {
  if (n < 0n) throw new Error('isqrt negative');
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

/** sqrt(amount1/amount0) * 2^96 as uint160 */
function encodeSqrtRatioX96(amount1: bigint, amount0: bigint): bigint {
  if (amount0 <= 0n || amount1 <= 0n) throw new ProviderError('Both token and ETH amounts are required for the initial pool price.', 400);
  const ratioX192 = (amount1 << 192n) / amount0;
  const sqrt = isqrt(ratioX192);
  const maxUint160 = (1n << 160n) - 1n;
  if (sqrt <= 0n || sqrt > maxUint160) throw new ProviderError('Initial pool price is out of range.', 400);
  return sqrt;
}

function nearestUsableTick(tick: number, spacing: number) {
  const rounded = Math.round(tick / spacing) * spacing;
  if (rounded < -887272) return Math.ceil(-887272 / spacing) * spacing;
  if (rounded > 887272) return Math.floor(887272 / spacing) * spacing;
  return rounded;
}

function buildV2Liquidity(input: {
  chain: ChainKey;
  token: string;
  tokenAmount: string;
  quoteAmount: string;
  account: string;
}) {
  const chainId = CHAINS[input.chain].id;
  const router = V2_ROUTER[input.chain];
  if (!chainId || !router) throw new ProviderError('Unknown router.', 400);
  const tokenAmount = parseUnits(input.tokenAmount, 18);
  const ethAmount = parseEther(input.quoteAmount);
  if (tokenAmount <= 0n || ethAmount <= 0n) throw new ProviderError(`You must add both tokens and ${CHAINS[input.chain].symbol}. LIFT never provides liquidity.`, 400);
  const minToken = (tokenAmount * 95n) / 100n;
  const minEth = (ethAmount * 95n) / 100n;
  const expiresAt = Date.now() + 60_000;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
  const account = getAddress(input.account);
  const token = getAddress(input.token);
  const approve: PreparedTransaction = {
    chain: input.chain,
    chainId,
    to: token,
    data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [router, tokenAmount] }),
    value: '0',
    description: 'Approve your tokens for the pool',
    expiresAt,
  };
  const add: PreparedTransaction = {
    chain: input.chain,
    chainId,
    to: router,
    data: encodeFunctionData({
      abi: routerAbi,
      functionName: 'addLiquidityETH',
      args: [token, tokenAmount, minToken, minEth, account, deadline],
    }),
    value: ethAmount.toString(),
    description: 'Add your liquidity',
    expiresAt,
  };
  return { approve, add, expiresAt };
}

function buildArcLiquidity(input: {
  token: string;
  tokenAmount: string;
  quoteAmount: string;
  account: string;
  quoteDecimals?: number;
}) {
  const chainId = CHAINS.arc.id!;
  const tokenAmount = parseUnits(input.tokenAmount, 18);
  const quoteAmount = parseUnits(input.quoteAmount, input.quoteDecimals ?? 6);
  if (tokenAmount <= 0n || quoteAmount <= 0n) throw new ProviderError('You must add both your token and USDC. LIFT never provides liquidity.', 400);
  const account = getAddress(input.account);
  const token = getAddress(input.token);
  const usdc = getAddress(ARC.usdc);
  const npm = getAddress(ARC.npm);
  const token0 = token.toLowerCase() < usdc.toLowerCase() ? token : usdc;
  const token1 = token.toLowerCase() < usdc.toLowerCase() ? usdc : token;
  const amount0Desired = token0.toLowerCase() === token.toLowerCase() ? tokenAmount : quoteAmount;
  const amount1Desired = token1.toLowerCase() === token.toLowerCase() ? tokenAmount : quoteAmount;
  const sqrtPriceX96 = encodeSqrtRatioX96(amount1Desired, amount0Desired);
  const tickLower = nearestUsableTick(-887220, ARC.tickSpacing);
  const tickUpper = nearestUsableTick(887220, ARC.tickSpacing);
  const amount0Min = (amount0Desired * 95n) / 100n;
  const amount1Min = (amount1Desired * 95n) / 100n;
  const expiresAt = Date.now() + 60_000;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
  const createData = encodeFunctionData({ abi: npmAbi, functionName: 'createAndInitializePoolIfNecessary', args: [token0, token1, ARC.fee, sqrtPriceX96] });
  const mintData = encodeFunctionData({ abi: npmAbi, functionName: 'mint', args: [{ token0, token1, fee: ARC.fee, tickLower, tickUpper, amount0Desired, amount1Desired, amount0Min, amount1Min, recipient: account, deadline }] });
  const multicallData = encodeFunctionData({ abi: npmAbi, functionName: 'multicall', args: [[createData, mintData]] });
  const approve: PreparedTransaction = { chain: 'arc', chainId, to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [npm, tokenAmount] }), value: '0', description: 'Approve your tokens for the Arc pool', expiresAt };
  const approveQuote: PreparedTransaction = { chain: 'arc', chainId, to: usdc, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [npm, quoteAmount] }), value: '0', description: 'Approve USDC for the Arc pool', expiresAt };
  const add: PreparedTransaction = { chain: 'arc', chainId, to: npm, data: multicallData, value: '0', description: 'Create the Arc token/USDC pool', expiresAt };
  return { approve, approveQuote, add, expiresAt };
}

function isNativeQuote(addr?: string) {
  if (!addr) return true;
  const a = addr.toLowerCase();
  return a === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' || a === RH.weth.toLowerCase();
}

function buildRobinhoodV3Liquidity(input: {
  token: string;
  tokenAmount: string;
  quoteAmount: string;
  account: string;
  quoteToken?: string;
  quoteDecimals?: number;
}) {
  const chainId = CHAINS.robinhood.id!;
  const tokenAmount = parseUnits(input.tokenAmount, 18);
  const quoteIsNative = isNativeQuote(input.quoteToken);
  const quoteDecimals = quoteIsNative ? 18 : (input.quoteDecimals ?? 18);
  const quoteAmountRaw = quoteIsNative ? parseEther(input.quoteAmount) : parseUnits(input.quoteAmount, quoteDecimals);
  if (tokenAmount <= 0n || quoteAmountRaw <= 0n) {
    throw new ProviderError('You must add both your token and the quote asset. LIFT never provides liquidity.', 400);
  }
  const account = getAddress(input.account);
  const token = getAddress(input.token);
  const quote = getAddress(quoteIsNative ? RH.weth : input.quoteToken!);
  const npm = getAddress(RH.npm);
  const token0 = token.toLowerCase() < quote.toLowerCase() ? token : quote;
  const token1 = token.toLowerCase() < quote.toLowerCase() ? quote : token;
  const amount0Desired = token0.toLowerCase() === token.toLowerCase() ? tokenAmount : quoteAmountRaw;
  const amount1Desired = token1.toLowerCase() === token.toLowerCase() ? tokenAmount : quoteAmountRaw;
  const sqrtPriceX96 = encodeSqrtRatioX96(amount1Desired, amount0Desired);
  const tickLower = nearestUsableTick(-887220, RH.tickSpacing);
  const tickUpper = nearestUsableTick(887220, RH.tickSpacing);
  const amount0Min = (amount0Desired * 95n) / 100n;
  const amount1Min = (amount1Desired * 95n) / 100n;
  const expiresAt = Date.now() + 60_000;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

  const createData = encodeFunctionData({
    abi: npmAbi,
    functionName: 'createAndInitializePoolIfNecessary',
    args: [token0, token1, RH.fee, sqrtPriceX96],
  });
  const mintData = encodeFunctionData({
    abi: npmAbi,
    functionName: 'mint',
    args: [
      {
        token0,
        token1,
        fee: RH.fee,
        tickLower,
        tickUpper,
        amount0Desired,
        amount1Desired,
        amount0Min,
        amount1Min,
        recipient: account,
        deadline,
      },
    ],
  });
  const refundData = encodeFunctionData({ abi: npmAbi, functionName: 'refundETH' });
  const multicallData = encodeFunctionData({
    abi: npmAbi,
    functionName: 'multicall',
    args: [quoteIsNative ? [createData, mintData, refundData] : [createData, mintData]],
  });

  const approveToken: PreparedTransaction = {
    chain: 'robinhood',
    chainId,
    to: token,
    data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [npm, tokenAmount] }),
    value: '0',
    description: 'Approve your tokens for Uniswap v3',
    expiresAt,
  };

  if (!quoteIsNative) {
    const approveQuote: PreparedTransaction = {
      chain: 'robinhood',
      chainId,
      to: quote,
      data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [npm, quoteAmountRaw] }),
      value: '0',
      description: 'Approve Stock Token for Uniswap v3',
      expiresAt,
    };
    const add: PreparedTransaction = {
      chain: 'robinhood',
      chainId,
      to: npm,
      data: multicallData,
      value: '0',
      description: 'Create Uniswap v3 pool with Stock Token quote',
      expiresAt,
    };
    return { approve: approveToken, approveQuote, add, expiresAt };
  }

  const add: PreparedTransaction = {
    chain: 'robinhood',
    chainId,
    to: npm,
    data: multicallData,
    value: quoteAmountRaw.toString(),
    description: 'Create Uniswap v3 pool and add your liquidity',
    expiresAt,
  };
  return { approve: approveToken, add, expiresAt };
}

export function buildEvmLiquidity(input: {
  chain: ChainKey;
  token: string;
  tokenAmount: string;
  quoteAmount: string;
  account: string;
  quoteToken?: string;
  quoteDecimals?: number;
}) {
  if (!supportsEvmLaunch(input.chain)) throw new ProviderError(`Liquidity on ${input.chain} is not enabled yet.`, 503);
  if (input.chain === 'arc') return buildArcLiquidity(input);
  // Native ETH on Robinhood uses Uniswap V2 (same as Base/BSC) so MetaMask shows
  // addLiquidityETH instead of an unknown Uniswap v3 NFT mint that greys out Confirm.
  if (input.chain === 'robinhood' && !isNativeQuote(input.quoteToken)) return buildRobinhoodV3Liquidity(input);
  return buildV2Liquidity(input);
}

export async function inspectEvmLiquidity(input: {
  chain: ChainKey;
  token: string;
  account?: string;
  tokenAmount?: string;
  quoteAmount?: string;
  quoteToken?: string;
}) {
  if (!supportsEvmLaunch(input.chain)) {
    throw new ProviderError(`Liquidity on ${input.chain} is not enabled yet.`, 503);
  }
  const chainId = CHAINS[input.chain].id;
  if (!chainId) throw new ProviderError('Unknown chain id.', 400);
  const client = createPublicClient({ transport: http(rpcUrl(input.chain), { timeout: 10_000, retryCount: 1 }) });
  if (await client.getChainId() !== chainId) throw new ProviderError('The RPC returned an unexpected network.');

  const token = getAddress(input.token);
  const account = input.account ? getAddress(input.account) : undefined;
  const desired = input.tokenAmount ? parseUnits(input.tokenAmount, 18) : undefined;

  if (input.chain === 'arc') {
    const router = getAddress(ARC.npm);
    const token = getAddress(input.token);
    const usdc = getAddress(ARC.usdc);
    if (input.quoteToken && input.quoteToken.toLowerCase() !== usdc.toLowerCase()) {
      throw new ProviderError('Arc launches use USDC as the quote asset.', 400, 'ARC_QUOTE_REQUIRED');
    }
    const pool = await client.readContract({ address: ARC.factory, abi: v3FactoryAbi, functionName: 'getPool', args: [token, usdc, ARC.fee] });
    const [liquidity, tokenAllowance, quoteAllowance] = await Promise.all([
      pool === zeroAddress ? Promise.resolve(0n) : client.readContract({ address: pool, abi: v3PoolLiquidityAbi, functionName: 'liquidity' }),
      account && desired !== undefined ? client.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [account, router] }) : Promise.resolve(undefined),
      account && input.quoteToken ? client.readContract({ address: usdc, abi: erc20Abi, functionName: 'allowance', args: [account, router] }) : Promise.resolve(undefined),
    ]);
    const live = pool !== zeroAddress && liquidity > 0n;
    const tokenNeedsApproval = tokenAllowance !== undefined && desired !== undefined && tokenAllowance < desired;
    const quoteNeedsApproval = quoteAllowance !== undefined && input.quoteAmount !== undefined && quoteAllowance < parseUnits(input.quoteAmount, 6);
    return { live, poolAddress: live ? pool : undefined, pairAddress: pool !== zeroAddress ? pool : undefined, allowance: tokenAllowance === undefined ? undefined : formatUnits(tokenAllowance, 18), quoteAllowance: quoteAllowance === undefined ? undefined : formatUnits(quoteAllowance, 6), approvalRequired: tokenNeedsApproval || quoteNeedsApproval };
  }

  if (input.chain === 'robinhood' && !isNativeQuote(input.quoteToken)) {
    const quote = getAddress(isNativeQuote(input.quoteToken) ? RH.weth : input.quoteToken!);
    const factory = await client.readContract({ address: RH.npm, abi: v2RouterMetadataAbi, functionName: 'factory' });
    const pair = await client.readContract({
      address: factory,
      abi: v3FactoryAbi,
      functionName: 'getPool',
      args: [token, quote, RH.fee],
    });
    const liquidity = pair === zeroAddress
      ? 0n
      : await client.readContract({ address: pair, abi: v3PoolLiquidityAbi, functionName: 'liquidity' });
    const allowance = account && desired !== undefined
      ? await client.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [account, RH.npm] })
      : undefined;
    return {
      live: pair !== zeroAddress && liquidity > 0n,
      poolAddress: pair !== zeroAddress && liquidity > 0n ? pair : undefined,
      pairAddress: pair !== zeroAddress ? pair : undefined,
      allowance: allowance === undefined ? undefined : formatUnits(allowance, 18),
      approvalRequired: allowance === undefined || desired === undefined ? undefined : allowance < desired,
    };
  }

  const router = V2_ROUTER[input.chain];
  if (!router) throw new ProviderError('Unknown router.', 400);
  const [factory, wrapped] = await Promise.all([
    client.readContract({ address: router, abi: v2RouterMetadataAbi, functionName: 'factory' }),
    client.readContract({ address: router, abi: v2RouterMetadataAbi, functionName: 'WETH' }),
  ]);
  const pair = await client.readContract({
    address: factory,
    abi: v2FactoryAbi,
    functionName: 'getPair',
    args: [token, wrapped],
  });
  const [reserves, lpSupply, allowance] = await Promise.all([
    pair === zeroAddress
      ? Promise.resolve([0n, 0n, 0] as const)
      : client.readContract({ address: pair, abi: v2PairAbi, functionName: 'getReserves' }),
    pair === zeroAddress
      ? Promise.resolve(0n)
      : client.readContract({ address: pair, abi: v2PairAbi, functionName: 'totalSupply' }),
    account && desired !== undefined
      ? client.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [account, router] })
      : Promise.resolve(undefined),
  ]);
  const live = pair !== zeroAddress && reserves[0] > 0n && reserves[1] > 0n && lpSupply > 0n;
  return {
    live,
    poolAddress: live ? pair : undefined,
    pairAddress: pair !== zeroAddress ? pair : undefined,
    allowance: allowance === undefined ? undefined : formatUnits(allowance, 18),
    approvalRequired: allowance === undefined || desired === undefined ? undefined : allowance < desired,
  };
}

const WNATIVE: Partial<Record<ChainKey, `0x${string}`>> = {
  base: '0x4200000000000000000000000000000000000006',
  bsc: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
  hyperevm: '0x5555555555555555555555555555555555555555',
  arbitrum: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  robinhood: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',
};

const swapExactEthAbi = [
  {
    type: 'function',
    name: 'swapExactETHForTokens',
    stateMutability: 'payable',
    inputs: [
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
] as const;

const swapExactTokensForEthAbi = parseAbi([
  'function swapExactTokensForETH(uint256 amountIn,uint256 amountOutMin,address[] path,address to,uint256 deadline) returns (uint256[] amounts)',
]);
const swapExactTokensForTokensAbi = parseAbi([
  'function swapExactTokensForTokens(uint256 amountIn,uint256 amountOutMin,address[] path,address to,uint256 deadline) returns (uint256[] amounts)',
]);

export function minimumOutput(amountOut: bigint, slippageBps: number): bigint {
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps >= 10_000) {
    throw new ProviderError('Invalid slippage.', 400, 'INVALID_SLIPPAGE');
  }
  return (amountOut * BigInt(10_000 - slippageBps)) / 10_000n;
}

/** Creator first buy from the new pool. */
export async function buildEvmInitialBuy(input: {
  chain: ChainKey;
  token: string;
  quoteAmount: string;
  account: string;
}) {
  if (!supportsEvmLaunch(input.chain)) throw new ProviderError(`Buy on ${input.chain} is not enabled yet.`, 503);
  if (input.chain === 'arc') {
    const router = getAddress(ARC.router);
    const chainId = CHAINS.arc.id!;
    const usdc = getAddress(ARC.usdc);
    const amountIn = parseUnits(input.quoteAmount, 6);
    if (amountIn <= 0n) throw new ProviderError('Initial buy must be greater than zero.', 400);
    const account = getAddress(input.account);
    const token = getAddress(input.token);
    const client = createPublicClient({ transport: http(rpcUrl('arc'), { timeout: 10_000, retryCount: 1 }) });
    let expectedOut: bigint;
    try {
      const result = await client.simulateContract({ address: ARC.quoter, abi: arcQuoterAbi, functionName: 'quoteExactInputSingle', args: [{ tokenIn: usdc, tokenOut: token, amountIn, fee: ARC.fee, sqrtPriceLimitX96: 0n }] });
      expectedOut = result.result[0];
    } catch {
      throw new ProviderError('The Arc pool is live, but the optional first buy could not be quoted safely.', 409, 'INITIAL_BUY_NO_ROUTE');
    }
    if (expectedOut <= 0n) throw new ProviderError('The Arc pool returned no output for the optional first buy.', 409, 'INITIAL_BUY_NO_ROUTE');
    const minOut = minimumOutput(expectedOut, 500);
    const expiresAt = Date.now() + 60_000;
    const allowance = await client.readContract({ address: usdc, abi: erc20Abi, functionName: 'allowance', args: [account, router] });
    const approval: PreparedTransaction | undefined = allowance < amountIn ? {
      chain: 'arc', chainId, to: usdc,
      data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [router, amountIn] }), value: '0',
      description: 'Approve USDC for the initial buy', expiresAt,
    } : undefined;
    const buy: PreparedTransaction = {
      chain: 'arc', chainId, to: router,
      data: encodeFunctionData({ abi: arcSwapRouterAbi, functionName: 'exactInputSingle', args: [{ tokenIn: usdc, tokenOut: token, fee: ARC.fee, recipient: account, amountIn, amountOutMinimum: minOut, sqrtPriceLimitX96: 0n }] }),
      value: '0', description: `Initial buy with ${input.quoteAmount} USDC`, expiresAt,
    };
    return { buy, approval, amountOut: formatUnits(expectedOut, 18), minimumOut: formatUnits(minOut, 18), expiresAt };
  }
  const router = V2_ROUTER[input.chain];
  const wnative = WNATIVE[input.chain];
  const chainId = CHAINS[input.chain].id;
  if (!router || !wnative || !chainId) {
    throw new ProviderError(`Initial buy after launch is not available on ${CHAINS[input.chain].name} yet (use the trade UI).`, 503, 'INITIAL_BUY_UNSUPPORTED');
  }
  const ethAmount = parseEther(input.quoteAmount);
  if (ethAmount <= 0n) throw new ProviderError('Initial buy must be greater than zero.', 400);
  const expiresAt = Date.now() + 60_000;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
  const account = getAddress(input.account);
  const token = getAddress(input.token);
  const wrapped = getAddress(wnative);
  const client = createPublicClient({ transport: http(rpcUrl(input.chain), { timeout: 10_000, retryCount: 1 }) });
  let expectedOut: bigint;
  try {
    const amounts = await client.readContract({
      address: router,
      abi: v2RouterMetadataAbi,
      functionName: 'getAmountsOut',
      args: [ethAmount, [wrapped, token]],
    });
    expectedOut = amounts[amounts.length - 1] || 0n;
  } catch {
    throw new ProviderError('The pool is live, but the optional first buy could not be quoted safely.', 409, 'INITIAL_BUY_NO_ROUTE');
  }
  if (expectedOut <= 0n) {
    throw new ProviderError('The pool returned no output for the optional first buy.', 409, 'INITIAL_BUY_NO_ROUTE');
  }
  const minOut = minimumOutput(expectedOut, 500);
  const buy: PreparedTransaction = {
    chain: input.chain,
    chainId,
    to: router,
    data: encodeFunctionData({
      abi: swapExactEthAbi,
      functionName: 'swapExactETHForTokens',
      args: [minOut, [wrapped, token], account, deadline],
    }),
    value: ethAmount.toString(),
    description: `Initial buy with ${input.quoteAmount} ${CHAINS[input.chain].symbol}`,
    expiresAt,
  };
  return {
    buy,
    amountOut: formatUnits(expectedOut, 18),
    minimumOut: formatUnits(minOut, 18),
    expiresAt,
  };
}

async function buildArcTradeQuote(request: QuoteRequest): Promise<TradeQuote> {
  const launch = await findPlatformLaunch('arc', request.pool);
  if (!launch?.poolAddress) throw new ProviderError('This Arc token does not have a live pool yet.', 404, 'NOT_LIFT_POOL');
  const router = getAddress(ARC.router);
  const usdc = getAddress(ARC.usdc);
  const token = getAddress(launch.tokenAddress);
  const input = getAddress(request.tokenIn);
  const output = getAddress(request.tokenOut || '0x0000000000000000000000000000000000000000');
  const buy = input.toLowerCase() === usdc.toLowerCase() && output.toLowerCase() === token.toLowerCase();
  const sell = input.toLowerCase() === token.toLowerCase() && output.toLowerCase() === usdc.toLowerCase();
  if (!buy && !sell) throw new ProviderError('Arc pools only support the token/USDC pair.', 400, 'PAIR_MISMATCH');
  const client = createPublicClient({ transport: http(rpcUrl('arc'), { timeout: 10_000, retryCount: 1 }) });
  if (await client.getChainId() !== CHAINS.arc.id) throw new ProviderError('The Arc RPC returned an unexpected network.', 503, 'RPC_CHAIN_MISMATCH');
  const [tokenDecimals] = await Promise.all([
    client.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' }),
  ]);
  const pool = await client.readContract({ address: ARC.factory, abi: v3FactoryAbi, functionName: 'getPool', args: [token, usdc, ARC.fee] });
  if (pool === zeroAddress || pool.toLowerCase() !== getAddress(launch.poolAddress).toLowerCase()) throw new ProviderError('The saved Arc pool is not canonical.', 409, 'POOL_MISMATCH');
  const inputDecimals = buy ? 6 : tokenDecimals;
  const outputDecimals = buy ? tokenDecimals : 6;
  const amountIn = parseUnits(request.amountIn, inputDecimals);
  if (amountIn <= 0n) throw new ProviderError('Enter a positive amount.', 400);
  let expectedOut: bigint;
  try {
    const result = await client.simulateContract({ address: ARC.quoter, abi: arcQuoterAbi, functionName: 'quoteExactInputSingle', args: [{ tokenIn: input, tokenOut: output, amountIn, fee: ARC.fee, sqrtPriceLimitX96: 0n }] });
    expectedOut = result.result[0];
  } catch { throw new ProviderError('The Arc pool has insufficient liquidity for this amount.', 400, 'NO_ROUTE'); }
  if (expectedOut <= 0n) throw new ProviderError('The Arc pool returned no output for this amount.', 400, 'NO_ROUTE');
  const minOut = minimumOutput(expectedOut, request.slippageBps);
  const account = getAddress(request.account);
  const expiresAt = Date.now() + 30_000;
  let approval: PreparedTransaction | undefined;
  if (!buy) {
    const allowance = await client.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [account, router] });
    if (allowance < amountIn) approval = { chain: 'arc', chainId: CHAINS.arc.id!, to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [router, amountIn] }), value: '0', description: `Approve ${launch.symbol} for this sale`, expiresAt };
  }
  const transaction: PreparedTransaction = { chain: 'arc', chainId: CHAINS.arc.id!, to: router, data: encodeFunctionData({ abi: arcSwapRouterAbi, functionName: 'exactInputSingle', args: [{ tokenIn: input, tokenOut: output, fee: ARC.fee, recipient: account, amountIn, amountOutMinimum: minOut, sqrtPriceLimitX96: 0n }] }), value: '0', description: buy ? `Buy ${launch.symbol} with USDC` : `Sell ${launch.symbol} for USDC`, expiresAt };
  return { chain: 'arc', source: 'lift-v3-arc', observedAt: new Date().toISOString(), expiresAt, amountIn: request.amountIn, amountOut: formatUnits(expectedOut, outputDecimals), minimumOut: formatUnits(minOut, outputDecimals), tokenIn: request.tokenIn, tokenOut: request.tokenOut!, fee: ARC.fee, approval, transaction };
}

/** Quote a completed LIFT EVM launch directly against its canonical V2 pool. */
export async function buildEvmV2TradeQuote(chain: ChainKey, request: QuoteRequest): Promise<TradeQuote> {
  if (!supportsEvmLaunch(chain)) {
    throw new ProviderError(`Trading on ${CHAINS[chain].name} is not available yet.`, 503, 'TRADE_UNSUPPORTED');
  }
  const launch = await findPlatformLaunch(chain, request.pool);
  if (!launch) throw new ProviderError('This is not a completed LIFT pool.', 404, 'NOT_LIFT_POOL');
  if (!launch.poolAddress) {
    throw new ProviderError('The token contract exists, but its liquidity pool is not live yet.', 409, 'POOL_NOT_READY');
  }

  if (chain === 'arc') return buildArcTradeQuote(request);

  const router = V2_ROUTER[chain];
  const configuredWrapped = WNATIVE[chain];
  const chainId = CHAINS[chain].id;
  if (!router || !configuredWrapped || !chainId) {
    throw new ProviderError(`Trading on ${CHAINS[chain].name} is not available yet.`, 503, 'TRADE_UNSUPPORTED');
  }
  if (
    launch.quoteAddress &&
    launch.quoteAddress.toLowerCase() !== NATIVE_EVM.toLowerCase() &&
    launch.quoteAddress.toLowerCase() !== configuredWrapped.toLowerCase()
  ) {
    throw new ProviderError('Direct trading for this Stock Token pair is not enabled yet.', 503, 'TRADE_UNSUPPORTED');
  }

  const token = getAddress(launch.tokenAddress);
  const requestedIn = request.tokenIn.toLowerCase();
  const requestedOut = (request.tokenOut || '').toLowerCase();
  const native = NATIVE_EVM.toLowerCase();
  const configuredWrap = configuredWrapped.toLowerCase();
  const buy = (requestedIn === native || requestedIn === configuredWrap) && requestedOut === token.toLowerCase();
  const sell = requestedIn === token.toLowerCase() && (requestedOut === native || requestedOut === configuredWrap);
  if (!buy && !sell) {
    throw new ProviderError('This LIFT pool only supports its token/native pair.', 400, 'PAIR_MISMATCH');
  }

  const client = createPublicClient({ transport: http(rpcUrl(chain), { timeout: 10_000, retryCount: 1 }) });
  if (await client.getChainId() !== chainId) {
    throw new ProviderError('The RPC returned an unexpected network.', 503, 'RPC_CHAIN_MISMATCH');
  }
  const [factory, wrapped, tokenDecimals] = await Promise.all([
    client.readContract({ address: router, abi: v2RouterMetadataAbi, functionName: 'factory' }),
    client.readContract({ address: router, abi: v2RouterMetadataAbi, functionName: 'WETH' }),
    client.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' }),
  ]);
  if (wrapped.toLowerCase() !== configuredWrap) {
    throw new ProviderError('The configured router returned an unexpected wrapped native token.', 503, 'ROUTER_MISMATCH');
  }
  const canonicalPair = await client.readContract({
    address: factory,
    abi: v2FactoryAbi,
    functionName: 'getPair',
    args: [token, wrapped],
  });
  if (canonicalPair === zeroAddress || canonicalPair.toLowerCase() !== getAddress(launch.poolAddress).toLowerCase()) {
    throw new ProviderError('The saved pool does not match the canonical router pair.', 409, 'POOL_MISMATCH');
  }

  const inputDecimals = buy ? 18 : tokenDecimals;
  const outputDecimals = buy ? tokenDecimals : 18;
  const amountIn = parseUnits(request.amountIn, inputDecimals);
  if (amountIn <= 0n) throw new ProviderError('Enter a positive amount.', 400);
  const path = buy ? [wrapped, token] as const : [token, wrapped] as const;
  let amounts: readonly bigint[];
  try {
    amounts = await client.readContract({
      address: router,
      abi: v2RouterMetadataAbi,
      functionName: 'getAmountsOut',
      args: [amountIn, [...path]],
    });
  } catch {
    throw new ProviderError('The pool has insufficient liquidity for this amount.', 400, 'NO_ROUTE');
  }
  const expectedOut = amounts[amounts.length - 1] || 0n;
  if (expectedOut <= 0n) throw new ProviderError('The pool returned no output for this amount.', 400, 'NO_ROUTE');
  const minOut = minimumOutput(expectedOut, request.slippageBps);
  const account = getAddress(request.account);
  const expiresAt = Date.now() + 30_000;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 120);

  let approval: PreparedTransaction | undefined;
  let transaction: PreparedTransaction;
  if (buy) {
    transaction = {
      chain,
      chainId,
      to: router,
      data: encodeFunctionData({
        abi: swapExactEthAbi,
        functionName: 'swapExactETHForTokens',
        args: [minOut, [wrapped, token], account, deadline],
      }),
      value: amountIn.toString(),
      description: `Buy ${launch.symbol} from its LIFT pool`,
      expiresAt,
    };
  } else {
    const allowance = await client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [account, router],
    });
    if (allowance < amountIn) {
      approval = {
        chain,
        chainId,
        to: token,
        data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [router, amountIn] }),
        value: '0',
        description: `Approve ${launch.symbol} for this sale`,
        expiresAt,
      };
    }
    transaction = {
      chain,
      chainId,
      to: router,
      data: encodeFunctionData({
        abi: swapExactTokensForEthAbi,
        functionName: 'swapExactTokensForETH',
        args: [amountIn, minOut, [token, wrapped], account, deadline],
      }),
      value: '0',
      description: `Sell ${launch.symbol} through its LIFT pool`,
      expiresAt,
    };
  }

  return {
    chain,
    source: 'lift-v2',
    observedAt: new Date().toISOString(),
    expiresAt,
    amountIn: request.amountIn,
    amountOut: formatUnits(expectedOut, outputDecimals),
    minimumOut: formatUnits(minOut, outputDecimals),
    tokenIn: request.tokenIn,
    tokenOut: request.tokenOut!,
    fee: 0,
    approval,
    transaction,
  };
}
