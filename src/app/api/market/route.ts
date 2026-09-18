import { searchMarket, newLaunches } from '@/lib/server/market';
import { listPlatformLaunches, platformLaunchToToken } from '@/lib/server/platform-launches';
import { errorResponse } from '@/lib/server/errors';
import type { Token } from '@/lib/types';

function mergeLiftpad(dex: Token[], lift: Token[]): Token[] {
  const byMint = new Map<string, Token>();
  for (const t of lift) {
    byMint.set(`${t.chain}:${t.address.toLowerCase()}`, t);
  }
  for (const t of dex) {
    const key = `${t.chain}:${t.address.toLowerCase()}`;
    const prev = byMint.get(key);
    // Prefer DEX market stats, but keep a Liftpad/creator photo when DEX has none.
    byMint.set(key, {
      ...(prev || t),
      ...t,
      image: t.image || prev?.image,
      description: t.description || prev?.description,
    });
  }
  return [...byMint.values()];
}

export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get('q') || '').trim();
  try {
    const platform = (await listPlatformLaunches()).map(platformLaunchToToken);
    if (!q) {
      const dex = await newLaunches();
      return Response.json(
        {
          tokens: mergeLiftpad(dex, platform),
          source: 'dexscreener+liftpad',
          observedAt: new Date().toISOString(),
        },
        { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } },
      );
    }
    if (q.length < 2 || q.length > 80) return Response.json({ error: 'Search must contain 2–80 characters.' }, { status: 400 });
    const needle = q.toLowerCase();
    const localHits = platform.filter(
      (t) =>
        t.name.toLowerCase().includes(needle) ||
        t.symbol.toLowerCase().includes(needle) ||
        t.address.toLowerCase().includes(needle),
    );
    const dex = await searchMarket(q);
    return Response.json(
      {
        tokens: mergeLiftpad(dex, localHits),
        source: 'dexscreener+liftpad',
        observedAt: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
