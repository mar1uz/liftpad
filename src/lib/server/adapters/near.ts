import type { ChainAdapter, LaunchDraft, QuoteRequest, TradeQuote, PreparedTransaction } from '@/lib/types';
import { ProviderError } from '../errors';
import { buildNearTradeQuote, nearTransactionStatus, nearView } from '../near-launch';
import { nearConfig, nearPoolId } from '@/lib/near';

export class NearAdapter implements ChainAdapter {
  async launch(_draft: LaunchDraft): Promise<PreparedTransaction> {
    throw new ProviderError('Use POST /api/launch for NEAR launches.', 400, 'USE_LAUNCH_ROUTE');
  }
  quote(request: QuoteRequest): Promise<TradeQuote> {
    return buildNearTradeQuote(request);
  }
  async buildTransaction(quote: TradeQuote) {
    if (quote.chain !== 'near' || quote.expiresAt <= Date.now()) throw new ProviderError('Quote expired. Request another.', 409, 'QUOTE_EXPIRED');
    return quote.transaction;
  }
  /** NEAR tx status needs the signer account (`sender`). */
  async verifyTransaction(hash: string, sender?: string) {
    if (!sender) throw new ProviderError('NEAR transaction status needs the signer account.', 400, 'SENDER_REQUIRED');
    const s = await nearTransactionStatus(hash, sender);
    return { status: s.status, block: s.block };
  }
  async getPoolData(address: string) {
    const id = nearPoolId(address);
    if (id === undefined) throw new ProviderError('Invalid NEAR pool id.', 400);
    const { ref } = nearConfig();
    const pool = await nearView<{ token_account_ids: string[]; total_fee: number }>(ref, 'get_pool', { pool_id: id });
    return { token0: pool.token_account_ids[0], token1: pool.token_account_ids[1], fee: pool.total_fee, source: 'ref-finance', observedAt: new Date().toISOString() };
  }
}
