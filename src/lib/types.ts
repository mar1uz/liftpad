export const chainKeys = ['solana', 'base', 'bsc', 'hyperevm', 'stable', 'robinhood'] as const;
export type ChainKey = typeof chainKeys[number];
export type Token = {
  id: string; chain: ChainKey; address: string; poolAddress?: string;
  name: string; symbol: string; quoteSymbol: string; quoteAddress?: string;
  priceUsd: number | null; change24h: number | null; volume24h: number | null;
  liquidityUsd: number | null; marketCap: number | null; createdAt?: string;
  image?: string; mark?: string; color?: string; description?: string;
  source: 'demo' | 'dexscreener'; observedAt: string; url?: string;
};
export type QuoteAsset = { chain: ChainKey; address: string; symbol: string; name: string; decimals: number; kind: 'crypto' | 'stock'; issuer?: string; oracle?: string; enabled: boolean };
export type LaunchDraft = {
  id: string; chain: ChainKey; name: string; symbol: string; description: string;
  imageUrl: string; quoteAddress: string; quoteSymbol: string; supply: string;
  tokenLiquidity: string; quoteLiquidity: string; owner?: string;
  stage: 'draft' | 'token' | 'approval' | 'pool' | 'liquidity' | 'complete';
  tokenAddress?: string; poolAddress?: string; updatedAt: string;
  transactions: { stage: string; hash: string; status: 'pending' | 'confirmed' | 'failed' }[];
};
export type PreparedTransaction = { chain: ChainKey; chainId: number; to?: `0x${string}`; data: `0x${string}`; value: string; description: string; expiresAt: number; };
export type QuoteRequest = { pool: string; tokenIn: string; amountIn: string; slippageBps: number; account: string };
export type TradeQuote = { chain: ChainKey; source: string; observedAt: string; expiresAt: number; amountIn: string; amountOut: string; minimumOut: string; tokenIn: string; tokenOut: string; fee: number; approval?:PreparedTransaction; transaction: PreparedTransaction };
export interface ChainAdapter {
  launch(draft: LaunchDraft): Promise<PreparedTransaction>;
  quote(request: QuoteRequest): Promise<TradeQuote>;
  buildTransaction(quote: TradeQuote): Promise<PreparedTransaction>;
  verifyTransaction(hash: string): Promise<{ status: 'pending' | 'confirmed' | 'failed'; block?: string; contractAddress?: string }>;
  getPoolData(address: string): Promise<{ token0: string; token1: string; fee: number; source: string; observedAt: string }>;
}
