import { get24hCloses } from '@/lib/server/charts';
import { chainKeys, type ChainKey } from '@/lib/types';

export const maxDuration = 10;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const charts: Record<string, number[]> = {};
  const jobs: Promise<void>[] = [];
  for (let i = 0; i < 12; i++) {
    const chain = params.get(`c${i}`);
    const pool = params.get(`p${i}`);
    if (!chain || !pool || !(chainKeys as readonly string[]).includes(chain)) continue;
    jobs.push(
      get24hCloses(chain as ChainKey, pool).then((closes) => {
        charts[`${chain}:${pool}`] = closes ?? [];
      }),
    );
  }
  await Promise.race([
    Promise.all(jobs),
    new Promise<void>((resolve) => setTimeout(resolve, 6000)),
  ]);
  return Response.json(
    { charts },
    { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } },
  );
}
