'use client';
import { useEffect } from 'react';
import { X, ArrowUpRight } from 'lucide-react';
import { CHAINS } from '@/lib/chains';
import type { ChainKey, Token } from '@/lib/types';

export function ChainIcon({ chain }: { chain: ChainKey }) {
  return (
    <span className={`chain-icon chain-${chain}`} style={{ '--chain-color': CHAINS[chain].color } as React.CSSProperties}>
      {chain === 'solana' ? '≋' : chain === 'base' ? '━' : chain === 'bsc' ? '◇' : chain === 'hyperevm' ? '≈' : chain === 'arbitrum' ? 'A' : chain === 'arc' ? 'A' : chain === 'near' ? 'Ⓝ' : '↗'}
    </span>
  );
}

export function TokenIcon({ token, large = false }: { token: Token; large?: boolean }) {
  const fallback = token.mark || token.symbol.slice(0, 2);
  return (
    <span className={`token-icon ${large ? 'large' : ''}`} style={{ background: token.color || '#f04b2f' }}>
      {token.image ? (
        <img
          src={token.image}
          alt=""
          referrerPolicy="no-referrer"
          onError={(e) => {
            const img = e.currentTarget;
            img.style.display = 'none';
            const parent = img.parentElement;
            if (parent && !parent.querySelector('[data-token-fallback]')) {
              const span = document.createElement('span');
              span.dataset.tokenFallback = '1';
              span.textContent = fallback;
              parent.appendChild(span);
            }
          }}
        />
      ) : (
        <span>{fallback}</span>
      )}
    </span>
  );
}

export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="currentColor" />
      <path d="M8 23.5h16M16 21V9.5M11.2 14.2 16 9.4l4.8 4.8" fill="none" stroke="#1a0806" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark({ small = false }: { small?: boolean }) {
  return (
    <span className={`wordmark${small ? ' small' : ''}`}>
      <Mark size={small ? 22 : 28} />
      liftpad
    </span>
  );
}

export function HeroMotion() {
  return (
    <div className="hero-stage" aria-hidden="true">
      <div className="hero-mist hero-mist-a" />
      <div className="hero-mist hero-mist-b" />
      <div className="hero-product">
        <div className="hero-product-glow" />
        <div className="hero-pair-card">
          <div className="hero-pair-kicker">STOCK PAIR · LIVE</div>
          <div className="hero-pair-row">
            <div className="hero-token-chip">
              <span className="hero-token-mark yours">Y</span>
              <div>
                <strong>$YOURS</strong>
                <em>Community launch</em>
              </div>
            </div>
            <span className="hero-pair-x">×</span>
            <div className="hero-token-chip">
              <span className="hero-token-mark stock">N</span>
              <div>
                <strong>NVDA</strong>
                <em>Tokenized equity</em>
              </div>
            </div>
          </div>
          <div className="hero-pair-meta">
            <span>Robinhood Chain</span>
            <span className="hero-pair-dot" />
            <span>Open market</span>
          </div>
        </div>
        <div className="hero-market-card">
          <div className="hero-market-head">
            <span>Trending now</span>
            <span className="hero-market-live">LIVE</span>
          </div>
          <div className="hero-market-row"><span>$ORBIT</span><span className="up">+24.8%</span></div>
          <div className="hero-market-row"><span>$EMBER</span><span className="up">+12.1%</span></div>
          <div className="hero-market-row"><span>$ARC</span><span className="up">+8.4%</span></div>
        </div>
      </div>
    </div>
  );
}

export function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <div className="modal-shell" onClick={onClose} role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-heading">
          <h2>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="external-link">{children}<ArrowUpRight size={14} /></a>;
}
