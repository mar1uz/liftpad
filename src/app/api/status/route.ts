import { chainKeys } from '@/lib/types';
import { rpcUrl, stocksEnabled } from '@/lib/server/config';
import { getLiftPlatformId } from '@/lib/server/lift-platform';
import { supportsEvmLaunch } from '@/lib/server/evm-launch';

export async function GET() {
  const platformId = getLiftPlatformId();
  const solanaLaunch = Boolean(platformId);

  const chains = chainKeys.map((chain) => {
    let rpc = false;
    try {
      rpcUrl(chain);
      rpc = true;
    } catch {}
    let launch = false;
    let reason = 'Token deployment artifact and liquidity workflow require validation.';
    if (chain === 'solana') {
      launch = solanaLaunch && rpc;
      reason = solanaLaunch
        ? `LaunchLab platform ready (${platformId!.slice(0, 8)}…).`
        : 'LaunchLab platform configuration and integration validation required.';
    } else if (supportsEvmLaunch(chain)) {
      launch = rpc;
      reason = chain === 'robinhood'
        ? 'ERC-20 deploy + native ETH Uniswap v2 LP available. Stock Token pairs use reviewed Uniswap v3 contracts.'
        : chain === 'arc'
          ? 'ERC-20 deploy + Arc-native USDC Uniswap v3 liquidity flow available. Gas and the quote asset use USDC.'
        : chain === 'hyperevm'
          ? 'ERC-20 deploy + HyperSwap v2 LP available. Creator funds LP.'
          : 'ERC-20 deploy + Uniswap v2 liquidity flow available. Creator funds LP.';
    }
    const trading = launch;
    return {
      chain,
      marketData: 'available' as const,
      rpc,
      trading,
      launch,
      reason: chain === 'solana' && solanaLaunch
        ? `${reason} Curve buy/sell via LaunchLab (Jupiter after index).`
        : reason,
    };
  });

  const publicLaunch = chains.some((chain) => chain.launch);

  return Response.json({
    chains,
    storage: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    stocks: stocksEnabled(),
    publicLaunch,
    platformId: platformId || null,
  });
}
