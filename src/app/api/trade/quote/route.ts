import { z } from 'zod';
import { chainKeys } from '@/lib/types';
import { openQuote } from '@/lib/server/open-quote';
import { ProviderError, errorResponse } from '@/lib/server/errors';
import { readJson } from '@/lib/server/http';

const schema = z.object({
  chain: z.enum(chainKeys),
  // NEAR: refv1-<id> pools and named accounts are short; other chains keep the ≥20/32 checks below.
  pool: z.string().min(6).max(90),
  tokenIn: z.string().min(2).max(90),
  tokenOut: z.string().min(2).max(90),
  amountIn: z.string().regex(/^\d{1,30}(\.\d{1,24})?$/),
  slippageBps: z.number().int().min(1).max(500),
  account: z.string().min(2).max(90),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) throw new ProviderError('Check the amount, account, network and tokens.', 400, 'INVALID_TRADE');
    const { chain, ...input } = parsed.data;
    if (chain !== 'near' && (input.pool.length < 20 || input.tokenIn.length < 32 || input.tokenOut.length < 32 || input.account.length < 32 || /\.\d{19,}$/.test(input.amountIn))) {
      throw new ProviderError('Check the amount, account, network and tokens.', 400, 'INVALID_TRADE');
    }
    return Response.json(await openQuote(chain, input), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return errorResponse(e);
  }
}
