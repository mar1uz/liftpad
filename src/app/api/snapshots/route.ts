import { dailyCloses, latestSnapshotRows, networkRank, snapshotHistory } from '@/lib/server/snapshots';
import { ProviderError, errorResponse } from '@/lib/server/errors';
import { chainKeys, type ChainKey } from '@/lib/types';

const EMPTY = { closes: [], rank: null, day: null };

// Token page: daily-close series + network rank for one token (`chain` + `pool` = pool address).
// Empty (not an error) when storage is not configured or the job has not run yet.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const chain = params.get('chain') || '';
  const pool = (params.get('pool') || '').trim();
  if (!(chainKeys as readonly string[]).includes(chain) || !/^[a-zA-Z0-9]{20,90}$/.test(pool)) {
    return Response.json({ error: 'A valid chain and pool are required.' }, { status: 400 });
  }
  const chainKey = chain as ChainKey;
  const tokenId = `${chainKey}:${pool}`;
  try {
    const history = await snapshotHistory(tokenId);
    const closes = dailyCloses(history);
    let rank = null;
    if (history.length) {
      const latest = await latestSnapshotRows(chainKey);
      if (latest) rank = networkRank(latest.rows, latest.day, chainKey, tokenId);
    }
    return Response.json(
      { closes, rank, day: closes.length ? closes[closes.length - 1].day : null },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } },
    );
  } catch (e) {
    if (e instanceof ProviderError && e.code === 'STORAGE_NOT_CONFIGURED') {
      return Response.json(EMPTY);
    }
    return errorResponse(e);
  }
}
