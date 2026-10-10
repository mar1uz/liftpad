import { z } from 'zod';
import { chainKeys } from '@/lib/types';
import { buildEvmLiquidity, inspectEvmLiquidity } from '@/lib/server/evm-launch';
import { buildNearLiquidity, inspectNearLiquidity } from '@/lib/server/near-launch';
import { ProviderError, errorResponse } from '@/lib/server/errors';
import { readJson } from '@/lib/server/http';

const schema = z.object({
  chain: z.enum(chainKeys),
  token: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  tokenAmount: z.string().regex(/^\d{1,30}(\.\d{1,18})?$/),
  quoteAmount: z.string().regex(/^\d{1,18}(\.\d{1,18})?$/),
  account: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  quoteToken: z.string().optional(),
  quoteDecimals: z.number().int().min(0).max(36).optional(),
});

const nearSchema = z.object({
  chain: z.literal('near'),
  token: z.string().min(2).max(64),
  tokenAmount: z.string().regex(/^\d{1,30}(\.\d{1,18})?$/),
  quoteAmount: z.string().regex(/^\d{1,18}(\.\d{1,24})?$/),
  account: z.string().min(2).max(64),
  pool: z.string().max(32).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    if ((body as { chain?: string } | null)?.chain === 'near') {
      const near = nearSchema.safeParse(body);
      if (!near.success) throw new ProviderError('Enter the token amount and NEAR you will provide. LIFT does not add liquidity.', 400);
      return Response.json(await buildNearLiquidity(near.data), { headers: { 'Cache-Control': 'no-store' } });
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ProviderError('Enter the token amount and quote you will provide. LIFT does not add liquidity.', 400);
    const input = parsed.data;
    const [built, status] = await Promise.all([
      Promise.resolve(buildEvmLiquidity(input)),
      inspectEvmLiquidity(input),
    ]);
    return Response.json(
      status.approvalRequired === false ? { ...built, approve: undefined } : built,
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}

const statusSchema = z.object({
  chain: z.enum(chainKeys),
  token: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  account: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  tokenAmount: z.string().regex(/^\d{1,30}(\.\d{1,18})?$/).optional(),
  quoteAmount: z.string().regex(/^\d{1,18}(\.\d{1,18})?$/).optional(),
  quoteToken: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const params = Object.fromEntries(new URL(request.url).searchParams);
    if (params.chain === 'near') {
      if (!params.token) throw new ProviderError('Invalid liquidity status request.', 400);
      return Response.json(await inspectNearLiquidity({ token: params.token, account: params.account, pool: params.pool }), {
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    const parsed = statusSchema.safeParse(params);
    if (!parsed.success) throw new ProviderError('Invalid liquidity status request.', 400);
    return Response.json(await inspectEvmLiquidity(parsed.data), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
