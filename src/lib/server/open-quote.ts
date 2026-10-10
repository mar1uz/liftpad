import { createPublicClient, http, parseUnits, formatUnits, erc20Abi, getAddress, type Hex } from 'viem';
import { CHAINS } from '@/lib/chains';
import type { ChainKey, PreparedTransaction, QuoteRequest, TradeQuote } from '@/lib/types';
import { ProviderError } from './errors';
import { buildEvmV2TradeQuote, supportsEvmLaunch } from './evm-launch';
import { buildLaunchLabTradeQuote } from './solana-launch';
import { buildNearTradeQuote } from './near-launch';

export const SOL_MINT = 'So11111111111111111111111111111111111111112';
const NATIVE_EVM = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const WETH: Partial<Record<ChainKey, string>> = {
  base: '0x4200000000000000000000000000000000000006',
  bsc: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
  arbitrum: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
};
const KYBER: Partial<Record<ChainKey, string>> = { base: 'base', bsc: 'bsc' };
export const PUBLIC_RPC: Partial<Record<ChainKey, string>> = {
  solana: process.env.RPC_SOLANA || 'https://api.mainnet-beta.solana.com',
  base: process.env.RPC_BASE || 'https://mainnet.base.org',
  bsc: process.env.RPC_BSC || 'https://bsc-dataseed.binance.org',
  hyperevm: process.env.RPC_HYPEREVM || 'https://rpc.hyperliquid.xyz/evm',
  arbitrum: process.env.RPC_ARBITRUM || 'https://arb1.arbitrum.io/rpc',
  robinhood: process.env.RPC_ROBINHOOD || 'https://rpc.mainnet.chain.robinhood.com',
  arc: process.env.RPC_ARC || 'https://rpc.mainnet.arc.io',
};

function toRaw(amount: string, decimals: number): bigint {
  return parseUnits(amount, decimals);
}

async function solanaDecimals(mint: string): Promise<number> {
  if (mint === SOL_MINT) return 9;
  const rpc = PUBLIC_RPC.solana!;
  const r = await fetch(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTokenSupply', params: [mint] }),
    signal: AbortSignal.timeout(8000),
  });
  const data = await r.json();
  const decimals = data.result?.value?.decimals;
  if (typeof decimals !== 'number') throw new ProviderError('Could not read token decimals.', 400);
  return decimals;
}

async function evmDecimals(chain: ChainKey, token: string): Promise<number> {
  const wrap = WETH[chain];
  if (token.toLowerCase() === NATIVE_EVM.toLowerCase() || (wrap && token.toLowerCase() === wrap.toLowerCase())) return 18;
  const rpc = PUBLIC_RPC[chain];
  if (!rpc) throw new ProviderError(`Trading on ${chain} is not available yet.`, 503, 'TRADE_UNSUPPORTED');
  const client = createPublicClient({ transport: http(rpc, { timeout: 8000 }) });
  return client.readContract({ address: getAddress(token), abi: erc20Abi, functionName: 'decimals' });
}

async function jupiterQuote(request: QuoteRequest, tokenOut: string): Promise<TradeQuote> {
  const tokenIn = request.tokenIn || SOL_MINT;
  const [decIn, decOut] = await Promise.all([solanaDecimals(tokenIn), solanaDecimals(tokenOut)]);
  const amount = toRaw(request.amountIn, decIn);
  if (amount <= 0n) throw new ProviderError('Enter a positive amount.', 400);
  const quoteUrl = `https://lite-api.jup.ag/swap/v1/quote?inputMint=${encodeURIComponent(tokenIn)}&outputMint=${encodeURIComponent(tokenOut)}&amount=${amount.toString()}&slippageBps=${request.slippageBps}&swapMode=ExactIn`;
  const quoteRes = await fetch(quoteUrl, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } });
  if (!quoteRes.ok) throw new ProviderError('No Solana route for this pair.', 400, 'NO_ROUTE');
  const quote = await quoteRes.json();
  if (!quote?.outAmount) throw new ProviderError('No Solana route for this pair.', 400, 'NO_ROUTE');
  const swapRes = await fetch('https://lite-api.jup.ag/swap/v1/swap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(8000),
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: request.account,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto',
    }),
  });
  if (!swapRes.ok) throw new ProviderError('Could not build the Solana swap.', 503);
  const swap = await swapRes.json();
  if (!swap.swapTransaction) throw new ProviderError('Could not build the Solana swap.', 503);
  const expiresAt = Date.now() + 30000;
  const out = formatUnits(BigInt(quote.outAmount), decOut);
  const min = formatUnits(BigInt(quote.otherAmountThreshold || quote.outAmount), decOut);
  return {
    chain: 'solana',
    source: 'jupiter',
    observedAt: new Date().toISOString(),
    expiresAt,
    amountIn: request.amountIn,
    amountOut: out,
    minimumOut: min,
    tokenIn,
    tokenOut,
    fee: 0,
    transaction: {
      chain: 'solana',
      chainId: 0,
      data: '0x',
      value: '0',
      description: 'Swap via Jupiter',
      expiresAt,
      encoded: swap.swapTransaction,
    },
  };
}

async function kyberQuote(chain: ChainKey, request: QuoteRequest, tokenOut: string): Promise<TradeQuote> {
  const slug = KYBER[chain];
  const rpc = PUBLIC_RPC[chain];
  const chainId = CHAINS[chain].id;
  if (!slug || !rpc || !chainId) throw new ProviderError(`Trading on ${chain} is not available yet.`, 503, 'TRADE_UNSUPPORTED');
  let tokenIn = request.tokenIn;
  const wrap = WETH[chain];
  if (wrap && tokenIn.toLowerCase() === wrap.toLowerCase()) tokenIn = NATIVE_EVM;
  let out = tokenOut;
  if (wrap && out.toLowerCase() === wrap.toLowerCase()) out = NATIVE_EVM;
  const decIn = await evmDecimals(chain, tokenIn);
  const decOut = await evmDecimals(chain, out);
  const amount = toRaw(request.amountIn, decIn);
  if (amount <= 0n) throw new ProviderError('Enter a positive amount.', 400);
  const headers = { Accept: 'application/json', 'x-client-id': 'lift' };
  const routeUrl = `https://aggregator-api.kyberswap.com/${slug}/api/v1/routes?tokenIn=${tokenIn}&tokenOut=${out}&amountIn=${amount.toString()}`;
  const routeRes = await fetch(routeUrl, { headers, signal: AbortSignal.timeout(8000) });
  if (!routeRes.ok) throw new ProviderError('No route for this pair.', 400, 'NO_ROUTE');
  const route = await routeRes.json();
  if (route.code !== 0 || !route.data?.routeSummary) throw new ProviderError('No route for this pair.', 400, 'NO_ROUTE');
  const buildRes = await fetch(`https://aggregator-api.kyberswap.com/${slug}/api/v1/route/build`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(8000),
    body: JSON.stringify({
      routeSummary: route.data.routeSummary,
      sender: getAddress(request.account),
      recipient: getAddress(request.account),
      slippageTolerance: request.slippageBps,
    }),
  });
  if (!buildRes.ok) throw new ProviderError('Could not build the swap.', 503);
  const built = await buildRes.json();
  const tx = built.data;
  if (!tx?.data || !tx?.routerAddress) throw new ProviderError('Could not build the swap.', 503);
  const expiresAt = Date.now() + 30000;
  const amountOut = formatUnits(BigInt(route.data.routeSummary.amountOut), decOut);
  const minOut = formatUnits((BigInt(route.data.routeSummary.amountOut) * BigInt(10000 - request.slippageBps)) / 10000n, decOut);
  const value = BigInt(tx.value || tx.transactionValue || 0).toString();
  const transaction: PreparedTransaction = {
    chain,
    chainId,
    to: getAddress(tx.routerAddress),
    data: tx.data as Hex,
    value,
    description: 'Swap via Kyber',
    expiresAt,
  };
  let approval: PreparedTransaction | undefined;
  if (tokenIn !== NATIVE_EVM) {
    const client = createPublicClient({ transport: http(rpc, { timeout: 8000 }) });
    const allowance = await client.readContract({
      address: getAddress(tokenIn),
      abi: erc20Abi,
      functionName: 'allowance',
      args: [getAddress(request.account), getAddress(tx.routerAddress)],
    });
    if (allowance < amount) {
      const { encodeFunctionData } = await import('viem');
      approval = {
        chain,
        chainId,
        to: getAddress(tokenIn),
        data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [getAddress(tx.routerAddress), amount] }),
        value: '0',
        description: 'Approve the exact input amount',
        expiresAt,
      };
    }
  }
  return {
    chain,
    source: 'kyber',
    observedAt: new Date().toISOString(),
    expiresAt,
    amountIn: request.amountIn,
    amountOut,
    minimumOut: minOut,
    tokenIn: request.tokenIn,
    tokenOut,
    fee: 0,
    approval,
    transaction,
  };
}

export async function openQuote(chain: ChainKey, request: QuoteRequest): Promise<TradeQuote> {
  const tokenOut = request.tokenOut;
  if (!tokenOut) throw new ProviderError('Output token is required.', 400);
  if (chain === 'near') return buildNearTradeQuote(request);
  if (chain === 'solana') {
    // Fresh LIFT launches live on LaunchLab bonding curves before Jupiter indexes them.
    try {
      return await buildLaunchLabTradeQuote({
        tokenIn: request.tokenIn || SOL_MINT,
        tokenOut,
        amountIn: request.amountIn,
        slippageBps: request.slippageBps,
        account: request.account,
      });
    } catch (launchLabErr) {
      if (launchLabErr instanceof ProviderError && launchLabErr.code === 'CURVE_NOT_READY') {
        // Fall through to Jupiter (migrated / indexed pools).
      } else if (!(launchLabErr instanceof ProviderError && launchLabErr.code === 'LAUNCHLAB_SOL_ONLY')) {
        // Other LaunchLab errors: still try Jupiter, then surface LaunchLab message if Jupiter also fails.
        try {
          return await jupiterQuote(request, tokenOut);
        } catch {
          throw launchLabErr;
        }
      }
    }
    return jupiterQuote(request, tokenOut);
  }
  if (supportsEvmLaunch(chain)) {
    try {
      return await buildEvmV2TradeQuote(chain, request);
    } catch (error) {
      // Base/BSC can still serve non-LIFT pools through Kyber. Never hide an
      // error from a recognized LIFT pool behind an unrelated aggregator call.
      if (!(error instanceof ProviderError && error.code === 'NOT_LIFT_POOL')) throw error;
    }
  }
  if (KYBER[chain]) return kyberQuote(chain, request, tokenOut);
  throw new ProviderError(`Trading on ${CHAINS[chain].name} is not wired yet.`, 503, 'TRADE_UNSUPPORTED');
}
