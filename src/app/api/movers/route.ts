import { latestSnapshotRows, snapshotToToken, topMovers } from '@/lib/server/snapshots';
import { ProviderError, errorResponse } from '@/lib/server/errors';

// Homepage "Top movers today": biggest gainers from the latest daily snapshot.
// Empty (not an error) when storage is not configured or the job has not run yet.
export async function GET() {
  try {
    const latest = await latestSnapshotRows();
    const movers = latest ? topMovers(latest.rows, latest.day, 3).map(snapshotToToken) : [];
    return Response.json(
      { movers, day: latest?.day ?? null, observedAt: new Date().toISOString() },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } },
    );
  } catch (e) {
    if (e instanceof ProviderError && e.code === 'STORAGE_NOT_CONFIGURED') {
      return Response.json({ movers: [], day: null, observedAt: new Date().toISOString() });
    }
    return errorResponse(e);
  }
}
