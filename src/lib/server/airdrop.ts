/** Monthly airdrop helpers (1st of month). Persistence is Supabase — see migrations/002_fee_ledger_airdrop.sql. */

export const AIRDROP_SHARE = 0.25;

/** UTC period for the round paid on `payDay` (1st of month): prior calendar month. */
export function priorMonthPeriod(payDay = new Date()) {
  const y = payDay.getUTCFullYear();
  const m = payDay.getUTCMonth(); // 0-11; pay day is 1st of m
  const periodStart = new Date(Date.UTC(y, m - 1, 1));
  const periodEnd = new Date(Date.UTC(y, m, 0)); // last day of prior month
  return {
    periodStart: periodStart.toISOString().slice(0, 10),
    periodEnd: periodEnd.toISOString().slice(0, 10),
    payDay: `${y}-${String(m + 1).padStart(2, '0')}-01`,
  };
}

export function airdropPoolFromFees(feePoolNative: number) {
  return feePoolNative * AIRDROP_SHARE;
}

export function equalSplit(airdropPool: number, walletCount: number) {
  if (walletCount <= 0) return 0;
  return airdropPool / walletCount;
}
