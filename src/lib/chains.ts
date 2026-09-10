import type { ChainKey } from './types';
export const CHAINS: Record<ChainKey, { name: string; short: string; id?: number; symbol: string; color: string; explorer: string; dexId: string }> = {
  solana: { name:'Solana', short:'SOL', symbol:'SOL', color:'#14f195', explorer:'https://solscan.io', dexId:'solana' },
  base: { name:'Base', short:'BASE', id:8453, symbol:'ETH', color:'#3b82ff', explorer:'https://basescan.org', dexId:'base' },
  bsc: { name:'BNB Chain', short:'BNB', id:56, symbol:'BNB', color:'#f3ba2f', explorer:'https://bscscan.com', dexId:'bsc' },
  hyperevm: { name:'HyperEVM', short:'HYPE', id:999, symbol:'HYPE', color:'#39e58c', explorer:'https://hyperevmscan.io', dexId:'hyperevm' },
  stable: { name:'Stable', short:'STABLE', id:988, symbol:'USDT0', color:'#d8d4c4', explorer:'https://stablescan.xyz', dexId:'stable' },
  robinhood: { name:'Robinhood Chain', short:'RH', id:4663, symbol:'ETH', color:'#e08a4a', explorer:'https://robinhoodchain.blockscout.com', dexId:'robinhood' },
};
export const chainFromDex = (id: string): ChainKey | undefined => (Object.keys(CHAINS) as ChainKey[]).find(k => CHAINS[k].dexId === id);
export function explorerUrl(chain: ChainKey, kind: 'token'|'tx'|'address', address: string) {
  return `${CHAINS[chain].explorer}/${kind === 'token' && chain !== 'solana' ? 'token' : kind}/${encodeURIComponent(address)}`;
}
