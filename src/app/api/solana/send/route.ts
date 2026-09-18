import { Connection } from '@solana/web3.js';
import { z } from 'zod';
import { PUBLIC_RPC } from '@/lib/server/open-quote';
import { ProviderError, errorResponse } from '@/lib/server/errors';
import { readJson } from '@/lib/server/http';

const schema = z.object({
  encoded: z.string().min(64).max(8192),
});

function sendErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Could not broadcast the signed transaction.';
  const logs = (error as { logs?: string[] }).logs;
  const fromLogs = logs?.find((l) => /Error Code:|Error Message:|failed:/i.test(l));
  if (fromLogs) {
    const msg = fromLogs.match(/Error Message:\s*([^.]+)/)?.[1];
    if (msg) return `Transaction rejected on-chain: ${msg}.`;
    return `Transaction rejected on-chain: ${fromLogs.slice(0, 160)}`;
  }
  const m = error.message || '';
  if (/simulation failed|Simulation failed/i.test(m)) {
    return m.length > 280 ? `${m.slice(0, 280)}…` : m;
  }
  if (/blockhash|expired|Blockhash not found/i.test(m)) {
    return 'The transaction expired. Tap Launch again for a fresh blockhash.';
  }
  if (/insufficient|0x1\b/i.test(m)) {
    return 'Insufficient SOL for fees and rent. Add SOL and try again.';
  }
  return m.length > 200 ? `${m.slice(0, 200)}…` : m || 'Could not broadcast the signed transaction.';
}

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await readJson(request, 12_288));
    if (!parsed.success) throw new ProviderError('Signed transaction is required.', 400);
    const raw = Buffer.from(parsed.data.encoded, 'base64');
    if (!raw.length) throw new ProviderError('Signed transaction is invalid.', 400);
    const connection = new Connection(PUBLIC_RPC.solana!, 'confirmed');
    try {
      const signature = await connection.sendRawTransaction(raw, {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 3,
      });
      return Response.json({ signature }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      throw new ProviderError(sendErrorMessage(error), 400, 'SOLANA_SEND_FAILED');
    }
  } catch (e) {
    return errorResponse(e);
  }
}
