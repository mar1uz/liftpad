import { z } from 'zod';
import { createPublicClient, erc20Abi, getAddress, http, parseEther } from 'viem';
import { chainKeys } from '@/lib/types';
import { CHAINS } from '@/lib/chains';
import { PROTOCOL } from '@/lib/protocol';
import { ProviderError, errorResponse } from '@/lib/server/errors';
import { readJson } from '@/lib/server/http';
import { inspectEvmLiquidity } from '@/lib/server/evm-launch';
import { upsertPlatformLaunch } from '@/lib/server/platform-launches';
import { rpcUrl } from '@/lib/server/config';
import { verifyNearLaunch } from '@/lib/server/near-launch';

const schema = z.object({
  id: z.string().min(8).max(80),
  chain: z.enum(chainKeys),
  name: z.string().min(1).max(32),
  symbol: z.string().min(1).max(10),
  description: z.string().max(500).optional(),
  imageUrl: z.string().max(2_000_000).optional(),
  // NEAR named accounts / refv1-<id> pools / 43-char tx hashes are shorter than EVM/Solana ids.
  tokenAddress: z.string().min(2).max(90),
  poolAddress: z.string().min(6).max(90).optional(),
  creatorWallet: z.string().min(2).max(90),
  feeTx: z.string().min(43).max(128).optional(),
  mintTx: z.string().min(43).max(128).optional(),
  quoteSymbol: z.string().max(24).optional(),
  quoteAddress: z.string().max(90).optional(),
  quoteDecimals: z.number().int().min(0).max(36).optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await readJson(request, 2_100_000));
    if (!parsed.success) throw new ProviderError('Launch completion payload is invalid.', 400, 'INVALID_COMPLETE');
    const input = parsed.data;
    if (input.chain !== 'near' && (input.tokenAddress.length < 32 || input.creatorWallet.length < 32 || (input.poolAddress && input.poolAddress.length < 32))) {
      throw new ProviderError('Launch completion payload is invalid.', 400, 'INVALID_COMPLETE');
    }
    if (input.chain === 'near') {
      if (!input.poolAddress || !input.feeTx) throw new ProviderError('NEAR launches need the verified fee and Ref pool.', 400, 'POOL_REQUIRED');
      await verifyNearLaunch({
        tokenAddress: input.tokenAddress,
        poolAddress: input.poolAddress,
        creatorWallet: input.creatorWallet,
        name: input.name,
        symbol: input.symbol,
        feeTx: input.feeTx,
      });
    }
    if (input.chain !== 'solana' && !input.poolAddress) {
      throw new ProviderError('EVM launches are not live until the pool is verified on-chain.', 400, 'POOL_REQUIRED');
    }
    if (input.chain !== 'solana' && input.chain !== 'near') {
      if (!input.mintTx || !input.feeTx) {
        throw new ProviderError('The confirmed fee and deployment transactions are required.', 400, 'LAUNCH_TX_REQUIRED');
      }
      const chainId = CHAINS[input.chain].id;
      if (!chainId) throw new ProviderError('Unknown EVM chain.', 400);
      const client = createPublicClient({ transport: http(rpcUrl(input.chain), { timeout: 10_000, retryCount: 1 }) });
      const [rpcChainId, deployReceipt, deployTx, feeReceipt, feeTx, pool] = await Promise.all([
        client.getChainId(),
        client.getTransactionReceipt({ hash: input.mintTx as `0x${string}` }),
        client.getTransaction({ hash: input.mintTx as `0x${string}` }),
        client.getTransactionReceipt({ hash: input.feeTx as `0x${string}` }),
        client.getTransaction({ hash: input.feeTx as `0x${string}` }),
        inspectEvmLiquidity({
          chain: input.chain,
          token: input.tokenAddress,
          quoteToken: input.quoteAddress,
        }),
      ]);
      const creator = getAddress(input.creatorWallet);
      const token = getAddress(input.tokenAddress);
      if (rpcChainId !== chainId) throw new ProviderError('The RPC returned an unexpected network.', 503, 'RPC_CHAIN_MISMATCH');
      if (
        deployReceipt.status !== 'success' ||
        deployReceipt.contractAddress?.toLowerCase() !== token.toLowerCase() ||
        deployTx.from.toLowerCase() !== creator.toLowerCase()
      ) {
        throw new ProviderError('The token deployment does not match this creator and contract.', 409, 'DEPLOYMENT_MISMATCH');
      }
      if (
        feeReceipt.status !== 'success' ||
        feeTx.from.toLowerCase() !== creator.toLowerCase() ||
        feeTx.to?.toLowerCase() !== getAddress(PROTOCOL.treasuryEvm).toLowerCase() ||
        feeTx.value < parseEther(input.chain === 'arc' ? '1' : String(PROTOCOL.launchFeeEth))
      ) {
        throw new ProviderError('The launch fee transaction could not be verified.', 409, 'FEE_MISMATCH');
      }
      if (!pool.live || !pool.poolAddress || pool.poolAddress.toLowerCase() !== getAddress(input.poolAddress!).toLowerCase()) {
        throw new ProviderError('The submitted pool is not the live canonical liquidity pool.', 409, 'POOL_MISMATCH');
      }
      const [onchainName, onchainSymbol] = await Promise.all([
        client.readContract({ address: token, abi: erc20Abi, functionName: 'name' }),
        client.readContract({ address: token, abi: erc20Abi, functionName: 'symbol' }),
      ]);
      if (onchainName !== input.name || onchainSymbol !== input.symbol) {
        throw new ProviderError('The on-chain token metadata does not match this launch.', 409, 'TOKEN_METADATA_MISMATCH');
      }
    }
    // Keep https + data:image so token pages show the creator photo before IPFS/DEX index.
    const rawImage = input.imageUrl?.trim();
    const imageUrl =
      rawImage && (rawImage.startsWith('https://') || rawImage.startsWith('data:image/'))
        ? rawImage
        : undefined;
    const row = await upsertPlatformLaunch({
      id: input.id,
      chain: input.chain,
      name: input.name,
      symbol: input.symbol,
      description: input.description,
      imageUrl,
      tokenAddress: input.tokenAddress,
      poolAddress: input.poolAddress,
      creatorWallet: input.creatorWallet,
      feeTx: input.feeTx,
      mintTx: input.mintTx,
      quoteSymbol: input.quoteSymbol,
      quoteAddress: input.quoteAddress,
      quoteDecimals: input.quoteDecimals,
      createdAt: new Date().toISOString(),
      stage: 'complete',
    });

    // Best-effort Supabase mirror when configured (schema may require auth user — ignore failures).
    try {
      const { database } = await import('@/lib/server/supabase');
      const db = database();
      await db.from('launches').upsert(
        {
          id: input.id,
          chain: input.chain,
          token_address: input.tokenAddress,
          pool_address: input.poolAddress || null,
          stage: 'complete',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'chain,token_address' },
      );
    } catch {
      /* optional */
    }

    return Response.json({ ok: true, launch: row }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return errorResponse(e);
  }
}
