'use client';
import { useEffect, useId, useRef } from 'react';
import { X, ArrowUpRight } from 'lucide-react';
import { CHAINS } from '@/lib/chains';
import type { ChainKey, Token } from '@/lib/types';
import { demoSeries } from '@/lib/demo';

export function ChainIcon({ chain }: { chain: ChainKey }) {
  return (
    <span className={`chain-icon chain-${chain}`} style={{ '--chain-color': CHAINS[chain].color } as React.CSSProperties}>
      {chain === 'solana' ? '≋' : chain === 'base' ? '━' : chain === 'bsc' ? '◇' : chain === 'hyperevm' ? '≈' : chain === 'stable' ? 's' : '↗'}
    </span>
  );
}

export function TokenIcon({ token, large = false }: { token: Token; large?: boolean }) {
  return (
    <span className={`token-icon ${large ? 'large' : ''}`} style={{ background: token.color || '#c8f542' }}>
      {token.image ? (
        <img src={token.image} alt="" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
      ) : (
        <span>{token.mark || token.symbol.slice(0, 2)}</span>
      )}
    </span>
  );
}

export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="currentColor" />
      <path d="M8 23.5h16M16 21V9.5M11.2 14.2 16 9.4l4.8 4.8" fill="none" stroke="#12140a" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark({ small = false }: { small?: boolean }) {
  return (
    <span className={`wordmark${small ? ' small' : ''}`}>
      <Mark size={small ? 22 : 28} />
      LIFT
    </span>
  );
}

export function Sparkline({ seed = 1, negative = false, large = false }: { seed?: number; negative?: boolean; large?: boolean }) {
  const gradientId = useId().replace(/:/g, '');
  const series = demoSeries(seed);
  const values = series.map((point) => (negative ? -point.y : point.y));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const last = values.length - 1;
  const coords = values.map((y, i) => {
    const x = (i / last) * 600;
    const py = 188 - ((y - min) / span) * 156;
    return { x, y: py };
  });
  const line = coords.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `M 0 200 L ${coords.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ')} L 600 200 Z`;
  const stroke = negative ? '#ff7259' : '#c8f542';
  return (
    <svg className={large ? 'price-chart' : 'sparkline'} viewBox="0 0 600 200" preserveAspectRatio="none" role="img" aria-label="Illustrative price chart">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={large ? 0.28 : 0.2} />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {large && [50, 100, 150].map((y) => <line key={y} x1="0" y1={y} x2="600" y2={y} stroke="#2c2c32" strokeWidth="1" />)}
      <path d={area} fill={`url(#${gradientId})`} />
      <polyline fill="none" stroke={stroke} strokeWidth={large ? 3.2 : 2.4} strokeLinecap="round" strokeLinejoin="round" points={line} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);
  return (
    <dialog ref={ref} className="modal" onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-heading">
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={20} /></button>
      </div>
      {children}
    </dialog>
  );
}

export function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="external-link">{children}<ArrowUpRight size={14} /></a>;
}
