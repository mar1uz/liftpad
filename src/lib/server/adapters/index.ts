import type { ChainKey,ChainAdapter } from '@/lib/types';
import { EvmAdapter } from './evm';
import { SolanaAdapter } from './solana';
export function adapter(chain:ChainKey):ChainAdapter{return chain==='solana'?new SolanaAdapter():new EvmAdapter(chain);}
