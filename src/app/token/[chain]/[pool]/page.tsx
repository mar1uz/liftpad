import { notFound } from 'next/navigation';
import { Launchpad } from '@/components/launchpad';
import { DEMO_TOKENS } from '@/lib/demo';
import { CHAINS } from '@/lib/chains';
import { chainKeys, type ChainKey } from '@/lib/types';
import { getPair } from '@/lib/server/market';
export default async function Page({params}:{params:Promise<{chain:string;pool:string}>}){
 const {chain,pool}=await params;
 if(chain==='demo'){const token=DEMO_TOKENS.find(t=>t.id===pool);if(!token)notFound();return <Launchpad screen="token" initialToken={token}/>;}
 if(!chainKeys.includes(chain as ChainKey)||!/^[a-zA-Z0-9]{20,90}$/.test(pool))notFound();
 const token=await getPair(CHAINS[chain as ChainKey].dexId,pool);
 if(!token)notFound();return <Launchpad screen="token" initialToken={token}/>;
}
