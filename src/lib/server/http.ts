import { ProviderError } from './errors';

const ALLOWED_ORIGINS = new Set([
  'https://liftpad.xyz',
  'http://liftpad.xyz',
  'https://www.liftpad.xyz',
  'http://www.liftpad.xyz',
  'http://207.127.89.107',
  'https://207.127.89.107',
  'https://207.127.89.107.nip.io',
  'http://207.127.89.107.nip.io',
  'http://127.0.0.1:3000',
  'http://localhost:3000',
]);

function requestOrigins(request: Request) {
  const origins = new Set<string>();
  try { origins.add(new URL(request.url).origin); } catch { /* ignore */ }
  const host = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').split(',')[0].trim();
  const proto = (request.headers.get('x-forwarded-proto') || 'http').split(',')[0].trim();
  if (host) origins.add(`${proto}://${host}`);
  return origins;
}

export async function readJson(request: Request, max = 16384) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new ProviderError('JSON content is required.', 415);
  const origin = request.headers.get('origin');
  if (origin && !ALLOWED_ORIGINS.has(origin) && !requestOrigins(request).has(origin)) {
    throw new ProviderError('Cross-origin writes are not allowed.', 403);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ProviderError('Request body is required.', 400);
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new ProviderError('Request is too large.', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ProviderError('Invalid JSON.', 400);
  }
}
