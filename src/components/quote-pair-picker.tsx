'use client';
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Check, ChevronsUpDown, Search, X } from 'lucide-react';
import type { QuoteAsset } from '@/lib/types';

export type QuotePairPickerProps = {
  assets: QuoteAsset[];
  valueSymbol: string;
  onChange: (symbol: string, asset: QuoteAsset) => void;
  label?: string;
  nativeHint?: string;
  disabled?: boolean;
  /** Stock-tab label — e.g. "xStocks" on Solana, "Stocks" on Robinhood */
  sectionLabel?: string;
};

type KindFilter = 'all' | 'crypto' | 'stock';

function monogram(symbol: string): string {
  const clean = symbol.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (!clean) return '?';
  if (clean.length <= 3) return clean;
  // Prefer dropping a trailing xStock suffix letter when present
  if (clean.endsWith('X') && clean.length > 4) return clean.slice(0, 3);
  return clean.slice(0, 3);
}

function hashHue(symbol: string): number {
  let h = 0;
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) >>> 0;
  return h % 360;
}

function monogramStyle(symbol: string, selected: boolean): CSSProperties {
  if (selected) {
    return { background: 'var(--accent)', color: 'var(--accent-ink)' };
  }
  const hue = hashHue(symbol);
  return {
    background: `hsl(${hue} 28% 18%)`,
    color: `hsl(${hue} 55% 72%)`,
    borderColor: `hsl(${hue} 22% 28%)`,
  };
}

function displayName(asset: QuoteAsset): string {
  const cleaned = asset.name
    .replace(/\s*[·•]\s*Robinhood Token$/i, '')
    .replace(/\s*[·•]\s*Backed xStock$/i, '')
    .replace(/\s*[·•]\s*xStock$/i, '')
    .replace(/\s*[·•]\s*/g, ' · ')
    .trim();
  // Avoid "TICKER · TICKER" noise when name was just symbol + kind
  if (!cleaned || cleaned.toUpperCase() === asset.symbol.toUpperCase()) return asset.name.split(/[·•]/)[0].trim() || asset.symbol;
  if (cleaned.toUpperCase().startsWith(asset.symbol.toUpperCase() + ' ·')) {
    return cleaned.slice(asset.symbol.length).replace(/^\s*·\s*/, '') || cleaned;
  }
  return cleaned;
}

function kindPill(asset: QuoteAsset, stockSectionLabel: string): string {
  if (asset.kind === 'crypto') return 'Crypto';
  const label = stockSectionLabel.toLowerCase();
  if (label.includes('xstock')) return 'xStock';
  return 'Stock';
}

function defaultStockSectionLabel(assets: QuoteAsset[]): string {
  const stocks = assets.filter((a) => a.kind === 'stock');
  if (stocks.length && stocks.every((a) => a.chain === 'solana')) return 'xStocks';
  return 'Stocks';
}

export function QuotePairPicker({
  assets,
  valueSymbol,
  onChange,
  label = 'Pair with',
  nativeHint,
  disabled = false,
  sectionLabel,
}: QuotePairPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<KindFilter>('all');
  const searchRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const stockLabel = sectionLabel || defaultStockSectionLabel(assets);

  const hasCrypto = assets.some((a) => a.kind === 'crypto');
  const hasStock = assets.some((a) => a.kind === 'stock');
  const showTabs = hasCrypto && hasStock;

  const selected = useMemo(
    () => assets.find((a) => a.symbol === valueSymbol) || assets[0],
    [assets, valueSymbol],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((a) => {
      if (filter === 'crypto' && a.kind !== 'crypto') return false;
      if (filter === 'stock' && a.kind !== 'stock') return false;
      if (!q) return true;
      const hay = `${a.symbol} ${a.name}`.toLowerCase();
      return hay.includes(q);
    });
  }, [assets, filter, query]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => searchRef.current?.focus(), 40);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
    };
  }, [open]);

  function openSheet() {
    if (disabled) return;
    setQuery('');
    setFilter('all');
    setOpen(true);
  }

  function pick(asset: QuoteAsset) {
    onChange(asset.symbol, asset);
    setOpen(false);
  }

  return (
    <div className={`quote-pair-picker${disabled ? ' is-disabled' : ''}`}>
      {label && <span className="quote-pair-label">{label}</span>}
      {nativeHint && <span className="quote-pair-hint">{nativeHint}</span>}
      <button
        type="button"
        className="quote-pair-trigger"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openSheet}
      >
        {selected ? (
          <>
            <span
              className={`quote-pair-mono${selected.symbol === valueSymbol ? ' is-selected' : ''}`}
              style={monogramStyle(selected.symbol, true)}
              aria-hidden="true"
            >
              {monogram(selected.symbol)}
            </span>
            <span className="quote-pair-trigger-copy">
              <strong>{selected.symbol}</strong>
              <small>{displayName(selected)}</small>
            </span>
          </>
        ) : (
          <span className="quote-pair-trigger-copy">
            <strong>Select asset</strong>
            <small>Choose a quote pair</small>
          </span>
        )}
        <ChevronsUpDown size={16} className="quote-pair-chevron" aria-hidden="true" />
      </button>

      {open && (
        <div className="quote-pair-sheet" onClick={() => setOpen(false)} role="presentation">
          <div
            className="quote-pair-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="quote-pair-panel-head">
              <div>
                <h2 id={titleId}>{label}</h2>
                <p>Search and pick a quote asset</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="quote-pair-search">
              <Search size={15} aria-hidden="true" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search ticker or name"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="search"
              />
              {query && (
                <button type="button" className="icon-button" onClick={() => setQuery('')} aria-label="Clear search">
                  <X size={14} />
                </button>
              )}
            </div>

            {showTabs && (
              <div className="quote-pair-tabs" role="tablist" aria-label="Asset kind">
                {(
                  [
                    ['all', 'All'],
                    ['crypto', 'Crypto'],
                    ['stock', stockLabel],
                  ] as const
                ).map(([key, text]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={filter === key}
                    className={filter === key ? 'active' : undefined}
                    onClick={() => setFilter(key)}
                  >
                    {text}
                  </button>
                ))}
              </div>
            )}

            <div className="quote-pair-list" role="listbox" aria-label={label}>
              {filtered.length === 0 ? (
                <p className="quote-pair-empty">No assets match “{query.trim() || filter}”.</p>
              ) : (
                filtered.map((asset) => {
                  const isSelected = asset.symbol === (selected?.symbol || valueSymbol);
                  return (
                    <button
                      key={`${asset.chain}:${asset.address}:${asset.symbol}`}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={`quote-pair-row${isSelected ? ' is-selected' : ''}`}
                      onClick={() => pick(asset)}
                    >
                      <span
                        className={`quote-pair-mono${isSelected ? ' is-selected' : ''}`}
                        style={monogramStyle(asset.symbol, isSelected)}
                        aria-hidden="true"
                      >
                        {monogram(asset.symbol)}
                      </span>
                      <span className="quote-pair-row-copy">
                        <strong>{asset.symbol}</strong>
                        <small>{displayName(asset)}</small>
                      </span>
                      <span className="quote-pair-kind">{kindPill(asset, stockLabel)}</span>
                      {isSelected && <Check size={16} className="quote-pair-check" aria-hidden="true" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
