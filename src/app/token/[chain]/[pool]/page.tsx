import { notFound } from 'next/navigation';
import { Launchpad } from '@/components/launchpad';
import { CHAINS, explorerUrl } from '@/lib/chains';
import { defaultQuoteAddress } from '@/lib/trade-quote';
import { usableTokenImage } from '@/lib/format';
import { chainKeys, type ChainKey } from '@/lib/types';
import { getPair } from '@/lib/server/market';
import { findPlatformLaunch, platformLaunchToToken } from '@/lib/server/platform-launches';

export default async function Page({ params }: { params: Promise<{ chain: string; pool: string }> }) {
  const { chain, pool } = await params;
  if (!chainKeys.includes(chain as ChainKey) || !/^[a-zA-Z0-9]{20,90}$/.test(pool)) notFound();
  const chainKey = chain as ChainKey;
  let token = await getPair(CHAINS[chainKey].dexId, pool).catch(() => undefined);
  const row = await findPlatformLaunch(chainKey, pool);

  if (!token && row) {
    token = platformLaunchToToken(row);
  } else if (token && row) {
    const img = usableTokenImage(row.imageUrl) || token.image;
    token = {
      ...token,
      image: img,
      description: token.description || row.description,
      source: token.source === 'dexscreener' ? 'dexscreener' : 'liftpad',
      quoteAddress: token.quoteAddress || defaultQuoteAddress(chainKey),
    };
  }

  // Soft route: still render TokenDetail shell so Portfolio live rows never 404
  // when DEX Screener has not indexed the mint yet and complete API missed.
  if (!token) {
    token = {
      id: `${chainKey}:${pool}`,
      chain: chainKey,
      address: pool,
      poolAddress: pool,
      name: 'Launch',
      symbol: 'TOKEN',
      quoteSymbol: chainKey === 'solana' ? 'SOL' : CHAINS[chainKey].symbol,
      quoteAddress: defaultQuoteAddress(chainKey),
      priceUsd: null,
      change24h: null,
      volume24h: null,
      liquidityUsd: null,
      marketCap: null,
      source: 'liftpad',
      observedAt: new Date().toISOString(),
      description: 'Loaded from Portfolio. Market data will appear once the pair is indexed.',
      url: explorerUrl(chainKey, 'token', pool),
      dexId: chainKey === 'solana' ? 'launchlab' : undefined,
    };
  }
  return <Launchpad screen="token" initialToken={token} tokenRoute={{ chain: chainKey, pool }} />;
}
