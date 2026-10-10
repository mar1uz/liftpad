import type { ChainKey,ChainAdapter } from '@/lib/types';
import { EvmAdapter } from './evm';
import { NearAdapter } from './near';
import { SolanaAdapter } from './solana';
export function adapter(chain:ChainKey):ChainAdapter{return chain==='solana'?new SolanaAdapter():chain==='near'?new NearAdapter():new EvmAdapter(chain);}
