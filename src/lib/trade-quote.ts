import { CHAINS } from './chains';
import { PROTOCOL } from './protocol';
import type { ChainKey, Token } from './types';

/** Kyber / Uniswap native-asset sentinel. Sell output to this address unwraps to BNB/ETH. */
export const NATIVE_EVM = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
export const ARC_USDC = '0x3600000000000000000000000000000000000000';

export function defaultQuoteAddress(chain: ChainKey): string {
  return chain === 'solana' ? PROTOCOL.solMint : chain === 'arc' ? ARC_USDC : NATIVE_EVM;
}

export function tradeQuoteSymbol(token: Token) {
  if (token.chain === 'solana' && (token.source === 'liftpad' || token.dexId === 'launchlab')) return 'SOL';
  const symbol = token.quoteSymbol?.replace(' Stock Token', '').trim();
  return symbol || CHAINS[token.chain].symbol;
}

export function tradeQuoteAddress(token: Token) {
  if (token.chain === 'solana') return token.quoteAddress || PROTOCOL.solMint;
  if (token.chain === 'arc') return token.quoteAddress || ARC_USDC;
  const quote = token.quoteAddress?.trim();
  if (!quote || quote.toLowerCase() === token.address.toLowerCase()) return NATIVE_EVM;
  return quote;
}
