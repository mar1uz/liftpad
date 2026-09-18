export function money(n: number | null | undefined, compact = true) {
  if(n == null || !Number.isFinite(n)) return '—';
  if (Math.abs(n) > 999 && compact) return '$'+new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:2}).format(n);
  return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:n > 1 ? 2 : 8}).format(n);
}
export function priceUsd(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  const digits = a >= 100 ? 2 : a >= 1 ? 2 : a >= 0.01 ? 4 : 8;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: digits }).format(n);
}
export const shortAddress = (address: string): string => address.length > 14 ? `${address.slice(0,6)}…${address.slice(-4)}` : address;
export const percent = (n:number|null) => n == null ? '—' : `${n>=0?'+':''}${n.toFixed(1)}%`;
export const compactCount = (n: number) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
export function minimumOutput(amount: bigint, slippageBps: number) {
  if (!Number.isInteger(slippageBps) || slippageBps < 1 || slippageBps > 500) throw new Error('Slippage must be between 0.01% and 5%.');
  if(amount < 0n) throw new Error('Invalid output.');
  return amount * BigInt(10000-slippageBps) / 10000n;
}
export function usdValue(rawBalance: bigint, tokenDecimals: number, oraclePrice: bigint, oracleDecimals: number): string {
  if(rawBalance < 0n || oraclePrice <= 0n) throw new Error('Invalid valuation inputs.');
  const cents=rawBalance*oraclePrice*100n/(10n**BigInt(tokenDecimals+oracleDecimals));
  return `${cents/100n}.${(cents%100n).toString().padStart(2,'0')}`;
}

/** Prefer https or in-browser data-URL images from create drafts / platform registry. */
export function usableTokenImage(url?: string | null): string | undefined {
  if (!url || typeof url !== 'string') return undefined;
  const u = url.trim();
  if (u.startsWith('data:image/')) return u;
  if (!u.startsWith('https://')) return undefined;
  // DexScreener CMS: some width/height combos 422 — normalize to a reliable thumb.
  try {
    const parsed = new URL(u);
    if (parsed.hostname === 'cdn.dexscreener.com' && parsed.pathname.startsWith('/cms/images/')) {
      parsed.search = '';
      parsed.searchParams.set('width', '64');
      parsed.searchParams.set('height', '64');
      parsed.searchParams.set('quality', '95');
      parsed.searchParams.set('format', 'auto');
      return parsed.toString();
    }
  } catch {
    /* keep original https */
  }
  return u;
}
