import type { ChainKey } from './types';
export const CHAINS: Record<ChainKey, { name: string; short: string; id?: number; symbol: string; color: string; explorer: string; dexId: string }> = {
  solana: { name:'Solana', short:'SOL', symbol:'SOL', color:'#14f195', explorer:'https://solscan.io', dexId:'solana' },
  base: { name:'Base', short:'BASE', id:8453, symbol:'ETH', color:'#3b82ff', explorer:'https://basescan.org', dexId:'base' },
  bsc: { name:'BNB Chain', short:'BNB', id:56, symbol:'BNB', color:'#f3ba2f', explorer:'https://bscscan.com', dexId:'bsc' },
  hyperevm: { name:'HyperEVM', short:'HYPE', id:999, symbol:'HYPE', color:'#39e58c', explorer:'https://hyperevmscan.io', dexId:'hyperevm' },
  arbitrum: { name:'Arbitrum', short:'ARB', id:42161, symbol:'ETH', color:'#28a0f0', explorer:'https://arbiscan.io', dexId:'arbitrum' },
  robinhood: { name:'Robinhood Chain', short:'RH', id:4663, symbol:'ETH', color:'#f04b2f', explorer:'https://robinhoodchain.blockscout.com', dexId:'robinhood' },
  arc: { name:'Arc', short:'USDC', id:5042, symbol:'USDC', color:'#5b8cff', explorer:'https://explorer.arc.io', dexId:'arc' },
};
export const chainFromDex = (id: string): ChainKey | undefined => (Object.keys(CHAINS) as ChainKey[]).find(k => CHAINS[k].dexId === id);
export function explorerUrl(chain: ChainKey, kind: 'token'|'tx'|'address', address: string) {
  return `${CHAINS[chain].explorer}/${kind === 'token' && chain !== 'solana' ? 'token' : kind}/${encodeURIComponent(address)}`;
}

export function explorerName(chain: ChainKey) {
  switch (chain) {
    case 'solana': return 'Solscan';
    case 'base': return 'Basescan';
    case 'bsc': return 'BscScan';
    case 'hyperevm': return 'HyperEVMScan';
    case 'arbitrum': return 'Arbiscan';
    case 'robinhood': return 'Blockscout';
    case 'arc': return 'Arc Explorer';
  }
}
