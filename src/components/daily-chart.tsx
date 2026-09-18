'use client';
import { useEffect, useState } from 'react';
import { Layers, LoaderCircle } from 'lucide-react';
import { CHAINS } from '@/lib/chains';
import type { ChainKey } from '@/lib/types';
import { ExternalLink } from './ui';

export type SnapshotInsights = {
  closes: { day: string; closeUsd: number }[];
  rank: { rank: number; total: number; day: string } | null;
};

const W = 600;
const H = 248;
const PAD = 8;

function pointAt(i: number, count: number, value: number, min: number, span: number) {
  const x = count <= 1 ? W / 2 : PAD + (i * (W - 2 * PAD)) / (count - 1);
  const y = span <= 0 ? H / 2 : H - PAD - ((value - min) * (H - 2 * PAD)) / span;
  return [x, y] as const;
}

/** Pure SVG daily-close chart so it can be rendered and tested without fetch. */
export function DailyCloseChart({ closes }: { closes: { day: string; closeUsd: number }[] }) {
  const values = closes.map((c) => c.closeUsd);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const points = closes.map((c, i) => pointAt(i, closes.length, c.closeUsd, min, span));
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const rising = values[values.length - 1] >= values[0];
  const color = rising ? 'var(--up)' : 'var(--down)';
  const [lastX, lastY] = points[points.length - 1];
  const area = `${PAD},${H - PAD} ${line} ${(W - PAD).toFixed(1)},${H - PAD}`;
  return (
    <>
      <svg className="price-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
        aria-label={`Daily close price from ${closes[0].day} to ${closes[closes.length - 1].day}`}>
        <polygon points={area} fill={color} opacity={0.08} />
        <polyline points={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={lastX} cy={lastY} r={4} fill={color} />
      </svg>
      <div className="chart-times">
        <span>{closes[0].day}</span>
        <span>Daily close · {closes.length} day{closes.length === 1 ? '' : 's'}</span>
        <span>{closes[closes.length - 1].day}</span>
      </div>
    </>
  );
}

/**
 * Token page market insights: daily-close chart + network-rank badge, fed by the
 * daily market snapshot job. Shows the previous placeholder until history exists.
 */
export function DailyChart({
  chain,
  pool,
  explorerHref,
  onInsights,
}: {
  chain: ChainKey;
  pool: string;
  explorerHref?: string;
  onInsights?: (insights: SnapshotInsights) => void;
}) {
  const [data, setData] = useState<SnapshotInsights | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setReady(false);
    setData(null);
    (async () => {
      try {
        const r = await fetch(`/api/snapshots?chain=${chain}&pool=${encodeURIComponent(pool)}`, {
          signal: controller.signal,
        });
        if (!r.ok) return;
        const payload = (await r.json()) as SnapshotInsights;
        if (controller.signal.aborted) return;
        const insights = { closes: Array.isArray(payload.closes) ? payload.closes : [], rank: payload.rank ?? null };
        setData(insights);
        onInsights?.(insights);
      } catch {
        /* placeholder stays */
      } finally {
        if (!controller.signal.aborted) setReady(true);
      }
    })();
    return () => controller.abort();
  }, [chain, pool]);

  if (!ready) {
    return (
      <div className="chart-unavailable" aria-busy="true">
        <LoaderCircle className="spin" size={24} />
        <p>Checking daily history…</p>
      </div>
    );
  }

  if (data && data.closes.length >= 2) {
    return <DailyCloseChart closes={data.closes} />;
  }

  return (
    <div className="chart-unavailable">
      <Layers size={25} />
      <p>Daily price history is being collected — the chart appears after the first snapshots.</p>
      {explorerHref && <ExternalLink href={explorerHref}>Open on explorer / DEX Screener</ExternalLink>}
    </div>
  );
}

/** "#N of M on <chain>" badge for the latest snapshot day. Renders nothing without data. */
export function NetworkRankBadge({ insights, chain }: { insights: SnapshotInsights | null; chain: ChainKey }) {
  if (!insights?.rank) return null;
  const { rank, total } = insights.rank;
  return (
    <span className="badge rank-badge" title={`24h volume rank among tracked ${CHAINS[chain].name} tokens on ${insights.rank.day}`}>
      #{rank} of {total} on {CHAINS[chain].name}
    </span>
  );
}
