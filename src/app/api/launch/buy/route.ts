import { z } from 'zod';
import { chainKeys } from '@/lib/types';
import { buildEvmInitialBuy } from '@/lib/server/evm-launch';
import { ProviderError, errorResponse } from '@/lib/server/errors';
import { readJson } from '@/lib/server/http';

const schema = z.object({
  chain: z.enum(chainKeys),
  token: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  quoteAmount: z.string().regex(/^\d{1,18}(\.\d{1,18})?$/),
  account: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) throw new ProviderError('Enter a valid initial buy amount.', 400);
    return Response.json(await buildEvmInitialBuy(parsed.data), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return errorResponse(e);
  }
}
