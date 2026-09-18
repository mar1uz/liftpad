import { z } from 'zod';
import { PROTOCOL } from '@/lib/protocol';
import { platformStatus, buildCreatePlatform, saveLiftPlatform } from '@/lib/server/lift-platform';
import { ProviderError, errorResponse } from '@/lib/server/errors';
import { readJson } from '@/lib/server/http';

export async function GET() {
  return Response.json(platformStatus());
}

const schema = z.object({
  account: z.string().min(32).max(44),
  action: z.enum(['build', 'save']),
  platformId: z.string().min(32).max(44).optional(),
  signature: z.string().min(32).max(128).optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) throw new ProviderError('Check the treasury wallet.', 400);
    const { account, action, platformId, signature } = parsed.data;
    if (action === 'build') return Response.json(await buildCreatePlatform(account), { headers: { 'Cache-Control': 'no-store' } });
    if (account !== PROTOCOL.treasurySol) throw new ProviderError('Only the LIFT Solana treasury can register the LaunchLab platform.', 403, 'NOT_PLATFORM_ADMIN');
    if (!platformId || !signature) throw new ProviderError('Platform id and signature are required.', 400);
    return Response.json(saveLiftPlatform(platformId, signature));
  } catch (e) {
    return errorResponse(e);
  }
}
