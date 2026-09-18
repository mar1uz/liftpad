'use client';
import { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import type { Token } from '@/lib/types';
import { TokenCard } from './explore';

/**
 * Homepage "Top movers today" strip: the 3 biggest gainers from the latest
 * daily market snapshot. Renders nothing until the snapshot job has data.
 */
export function TopMovers({ watch, onWatch }: { watch: string[]; onWatch: (id: string) => void }) {
  const [movers, setMovers] = useState<Token[]>([]);
  const [day, setDay] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const r = await fetch('/api/movers', { signal: controller.signal });
        if (!r.ok) return;
        const data = await r.json();
        if (controller.signal.aborted) return;
        setMovers(Array.isArray(data.movers) ? data.movers : []);
        setDay(typeof data.day === 'string' ? data.day : null);
      } catch {
        /* strip stays hidden */
      }
    })();
    return () => controller.abort();
  }, []);

  if (!movers.length) return null;

  return (
    <section className="movers" aria-labelledby="movers-title">
      <div className="section-heading">
        <h2 id="movers-title">
          Top movers today<span>.</span>
        </h2>
        <span className="muted">
          <TrendingUp size={13} /> Daily snapshot{day ? ` · ${day}` : ''}
        </span>
      </div>
      <div className="movers-grid">
        {movers.map((token, i) => (
          <TokenCard key={token.id} token={token} index={i} saved={watch.includes(token.id)} onWatch={() => onWatch(token.id)} />
        ))}
      </div>
    </section>
  );
}
