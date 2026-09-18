import { formatUnits, parseUnits } from 'viem';
import { ProviderError } from './errors';

export function parseLaunchLabTokenAmount(amount: string, decimals: number): bigint {
  try {
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) throw new Error('invalid decimals');
    const [, fraction = ''] = amount.split('.');
    if (fraction.length > decimals) throw new Error('excess precision');
    const raw = parseUnits(amount, decimals);
    if (raw <= 0n) throw new Error('non-positive');
    return raw;
  } catch {
    throw new ProviderError(
      `Enter a positive token amount with at most ${decimals} decimal places.`,
      400,
      'INVALID_TOKEN_AMOUNT',
    );
  }
}

export function formatLaunchLabTokenAmount(raw: bigint | string, decimals: number): string {
  return formatUnits(BigInt(raw), decimals);
}

/**
 * Raydium's sellToken extInfo exposes the minimum output after slippage.
 * Recover the nearest pre-slippage quote for display; the transaction still
 * enforces the SDK-provided minimum amount.
 */
export function estimateBeforeSlippage(minimumRaw: bigint, slippageBps: number): bigint {
  if (!Number.isInteger(slippageBps) || slippageBps < 1 || slippageBps > 500) {
    throw new ProviderError('Slippage must be between 0.01% and 5%.', 400, 'INVALID_SLIPPAGE');
  }
  const denominator = BigInt(10_000 - slippageBps);
  return (minimumRaw * 10_000n + denominator / 2n) / denominator;
}

export function assertSufficientLaunchLabBalance(availableRaw: bigint, requestedRaw: bigint) {
  if (availableRaw < requestedRaw) {
    throw new ProviderError(
      'Not enough token balance to sell this amount.',
      400,
      'INSUFFICIENT_BALANCE',
    );
  }
}
