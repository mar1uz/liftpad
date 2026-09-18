import { z } from 'zod';
import { chainKeys } from '@/lib/types';
import { openQuote } from '@/lib/server/open-quote';
import { ProviderError, errorResponse } from '@/lib/server/errors';
import { readJson } from '@/lib/server/http';

const schema = z.object({
  chain: z.enum(chainKeys),
  pool: z.string().min(20).max(90),
  tokenIn: z.string().min(32).max(90),
  tokenOut: z.string().min(32).max(90),
  amountIn: z.string().regex(/^\d{1,30}(\.\d{1,18})?$/),
  slippageBps: z.number().int().min(1).max(500),
  account: z.string().min(32).max(90),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) throw new ProviderError('Check the amount, account, network and tokens.', 400, 'INVALID_TRADE');
    const { chain, ...input } = parsed.data;
    return Response.json(await openQuote(chain, input), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return errorResponse(e);
  }
}
