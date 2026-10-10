import { z } from 'zod';
import { chainKeys } from '@/lib/types';
import { buildSolanaLaunch } from '@/lib/server/solana-launch';
import { buildEvmLaunch, supportsEvmLaunch } from '@/lib/server/evm-launch';
import { getLiftPlatformId } from '@/lib/server/lift-platform';
import { buildNearLaunch } from '@/lib/server/near-launch';
import { ProviderError, errorResponse } from '@/lib/server/errors';
import { readJson } from '@/lib/server/http';

const schema = z.object({
  chain: z.enum(chainKeys),
  name: z.string().min(1).max(32),
  symbol: z.string().min(1).max(10),
  description: z.string().max(500).optional(),
  uri: z.string().max(200).optional(),
  supply: z.string().optional(),
  initialBuy: z.string().optional(),
  // EVM/Solana addresses are ≥32 chars; NEAR named accounts can be 2–64 (validated in the builder).
  account: z.string().min(2).max(90),
  /** Confirmed fee signature — skip charging and build mint only. */
  feeTx: z.string().min(43).max(128).optional(),
  /** NEAR: tiny data-URL icon stored in NEP-148 metadata. */
  icon: z.string().max(8_000).optional(),
  /** When true and feeTx omitted, scan recent account txs for a matching fee payment. */
  discoverFee: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await readJson(request, 32_000));
    if (!parsed.success) throw new ProviderError('Check the token name, symbol and wallet.', 400, 'INVALID_LAUNCH');
    const input = parsed.data;
    if (input.chain !== 'near' && input.account.length < 32) throw new ProviderError('Check the token name, symbol and wallet.', 400, 'INVALID_LAUNCH');
    if (input.chain === 'near') {
      const built = await buildNearLaunch({
        name: input.name,
        symbol: input.symbol,
        supply: input.supply || '1000000000',
        account: input.account,
        icon: input.icon,
        feeTx: input.feeTx,
      });
      return Response.json(built, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (input.chain === 'solana') {
      const built = await buildSolanaLaunch({
        name: input.name,
        symbol: input.symbol,
        description: input.description,
        uri: input.uri,
        account: input.account,
        initialBuySol: input.initialBuy || '0',
        feeTx: input.feeTx,
        discoverFee: input.discoverFee,
      });
      return Response.json({ ...built, platformId: getLiftPlatformId() || null }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (!supportsEvmLaunch(input.chain)) throw new ProviderError(`Launch on ${input.chain} is not enabled yet.`, 503, 'LAUNCH_UNSUPPORTED');
    const built = buildEvmLaunch({
      chain: input.chain,
      name: input.name,
      symbol: input.symbol,
      supply: input.supply || '1000000000',
      account: input.account,
    });
    return Response.json({
      kind: 'evm',
      transactions: [built.fee, built.deploy],
      treasury: built.treasury,
      expiresAt: built.expiresAt,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return errorResponse(e);
  }
}
