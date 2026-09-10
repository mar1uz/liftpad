'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Wallet, Check, X, Copy } from 'lucide-react';
import type { LaunchDraft, Token } from '@/lib/types';
import { shortAddress } from '@/lib/format';
import { useWallet } from '@/lib/wallet';
import { Modal, ExternalLink, Wordmark } from './ui';
import { Explore } from './explore';
import { Create } from './create';
import { Portfolio, ProviderStatus } from './portfolio';
import { TokenDetail } from './token-detail';
export type WalletState=ReturnType<typeof useWallet>;
export function Launchpad({screen='explore',initialToken}:{screen?:'explore'|'create'|'portfolio'|'token'|'admin';initialToken?:Token}){
 const wallet=useWallet();const [walletOpen,setWalletOpen]=useState(false),[toast,setToast]=useState(''),[info,setInfo]=useState(false);
 const [watch,setWatch]=useState<string[]>([]),[drafts,setDrafts]=useState<LaunchDraft[]>([]);
 useEffect(()=>{try{setWatch(JSON.parse(localStorage.getItem('still.watchlist.v1')||'[]'));setDrafts(JSON.parse(localStorage.getItem('still.launches.v1')||'[]'));}catch{setToast('Local saved data could not be read.');}},[]);
 useEffect(()=>{if(!toast)return;const id=setTimeout(()=>setToast(''),4500);return()=>clearTimeout(id);},[toast]);
 function toggleWatch(id:string){const next=watch.includes(id)?watch.filter(x=>x!==id):[...watch,id];setWatch(next);try{localStorage.setItem('still.watchlist.v1',JSON.stringify(next));setToast(next.includes(id)?'Added to your watchlist':'Removed from your watchlist');}catch{setToast('Your browser could not save the watchlist.');}}
 function saveDraft(draft:LaunchDraft){const next=[{...draft,updatedAt:new Date().toISOString()},...drafts.filter(d=>d.id!==draft.id)];try{localStorage.setItem('still.launches.v1',JSON.stringify(next));setDrafts(next);setToast('Draft saved on this device');return true;}catch{setToast('Draft could not be saved. Try a smaller image.');return false;}}
 return <div className="app"><header className="header"><Link className="wordmark-link" href="/" aria-label="LIFT home"><Wordmark/></Link><nav aria-label="Main navigation"><Link className={screen==='explore'||screen==='token'?'active':''} href="/">Explore</Link><Link className={screen==='create'?'active':''} href="/create">Create</Link><Link className={screen==='portfolio'?'active':''} href="/portfolio">Portfolio</Link></nav><button className="wallet-button" onClick={()=>setWalletOpen(true)}>{wallet.address&&<span className="live-dot"/>}<Wallet size={15}/>{wallet.address?shortAddress(wallet.address):'Connect wallet'}</button></header><main>
 {screen==='explore'&&<Explore watch={watch} onWatch={toggleWatch}/>}
 {screen==='create'&&<Create drafts={drafts} saveDraft={saveDraft}/>}
 {screen==='portfolio'&&<Portfolio watch={watch} onWatch={toggleWatch} drafts={drafts} wallet={wallet} openWallet={()=>setWalletOpen(true)}/>}
 {screen==='token'&&initialToken&&<TokenDetail token={initialToken} saved={watch.includes(initialToken.id)} onWatch={()=>toggleWatch(initialToken.id)} wallet={wallet} openWallet={()=>setWalletOpen(true)} notify={setToast}/>}
 {screen==='admin'&&<ProviderStatus/>}
 </main><footer><Link href="/" className="wordmark-link"><Wordmark small/></Link><span>Launch on six networks.</span><div className="footer-links"><button onClick={()=>setInfo(true)}>About & risks <ArrowUpRight size={12}/></button><Link href="/status">Network status <span className="live-dot"/></Link></div></footer>
 {walletOpen&&<Modal title={wallet.address?'Your wallet':'Make yourself at home.'} onClose={()=>setWalletOpen(false)}>{wallet.address?<><div className="wallet-address"><Wallet size={24}/><p>{shortAddress(wallet.address)}</p><span>{wallet.kind==='solana'?'Solana wallet':'EVM wallet'}</span></div><button className="secondary-button full" onClick={()=>navigator.clipboard.writeText(wallet.address).then(()=>setToast('Address copied')).catch(()=>setToast('Could not access clipboard.'))}>Copy address <Copy size={15}/></button><button className="text-button full" onClick={()=>{wallet.disconnect();setWalletOpen(false);}}>Disconnect from this app</button></>:<><p className="modal-copy">Connect your wallet to launch a token or trade. Your assets stay in your wallet.</p><button className="wallet-option" disabled={wallet.busy} onClick={async()=>{if(await wallet.connect('evm'))setWalletOpen(false);}}><span className="wallet-glyph">◇</span><span><strong>Ethereum wallet</strong><small>Base, BNB, HyperEVM, Stable, Robinhood</small></span><ArrowUpRight size={18}/></button><button className="wallet-option" disabled={wallet.busy} onClick={async()=>{if(await wallet.connect('solana'))setWalletOpen(false);}}><span className="wallet-glyph phantom">◕</span><span><strong>Phantom</strong><small>Solana</small></span><ArrowUpRight size={18}/></button>{wallet.error&&<p className="notice error">{wallet.error}</p>}<p className="fine-print">Connecting does not authorize transactions. Every transaction requires your signature.</p></>}</Modal>}
 {info&&<Modal title="About LIFT" onClose={()=>setInfo(false)}><p className="modal-copy">LIFT is an independent interface for discovering and launching community tokens across six networks.</p><p className="modal-copy">Preview markets are fictional examples. Live market data comes from DEX Screener. A listing is not an endorsement.</p><p className="modal-copy">Community tokens can lose all their value. Stock Tokens provide economic exposure to underlying securities, not ownership of those securities. Pairing does not guarantee a token’s value.</p><p className="modal-copy">Public Stock Token trading is unavailable until issuer eligibility, regional access and contract configurations are verified.</p><ExternalLink href="https://docs.robinhood.com/chain/stock-tokens/">Read about Stock Tokens</ExternalLink></Modal>}
 {toast&&<div role="status" className="toast"><Check size={15}/>{toast}<button aria-label="Dismiss notification" onClick={()=>setToast('')}><X size={14}/></button></div>}
 </div>;
}
