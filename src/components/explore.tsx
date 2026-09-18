'use client';
import Link from 'next/link';
import { useEffect,useMemo,useState } from 'react';
import { ArrowUpRight,ArrowRight,Star,Search,X,SlidersHorizontal,Info,LoaderCircle,ChevronLeft,ChevronRight } from 'lucide-react';
import { CHAINS } from '@/lib/chains';
import { chainKeys,type ChainKey,type Token } from '@/lib/types';
import { money,percent,priceUsd,usableTokenImage } from '@/lib/format';
import { isProtocolToken, isStockPair } from '@/lib/protocol';
import { ChainIcon,TokenIcon,HeroMotion } from './ui';
import { ProtocolHow } from './protocol';
import { TopMovers } from './top-movers';
export function Explore({watch,onWatch}:{watch:string[];onWatch:(id:string)=>void}){
 const [tokens,setTokens]=useState<Token[]>([]),[chain,setChain]=useState<ChainKey|'all'>('all'),[tab,setTab]=useState('Trending'),[query,setQuery]=useState(''),[busy,setBusy]=useState(true),[error,setError]=useState(''),[filters,setFilters]=useState(false),[minLiquidity,setMinLiquidity]=useState(''),[sort,setSort]=useState('volume'),[page,setPage]=useState(0);
 useEffect(()=>{const controller=new AbortController();const timer=setTimeout(async()=>{setBusy(true);setError('');try{const q=query.trim();const r=await fetch(q.length>=2?`/api/market?q=${encodeURIComponent(q)}`:'/api/market',{signal:controller.signal});const data=await r.json();if(!r.ok)throw new Error(data.error);const remote=(data.tokens||[]).filter((t:Token)=>t.source!=='demo');
      let localImages=new Map<string,string>();
      try{
        const drafts=JSON.parse(localStorage.getItem('still.launches.v1')||'[]') as {chain?:string;tokenAddress?:string;imageUrl?:string}[];
        if(Array.isArray(drafts)){
          for(const d of drafts){
            const img=usableTokenImage(d.imageUrl);
            if(d.chain&&d.tokenAddress&&img) localImages.set(`${d.chain}:${d.tokenAddress.toLowerCase()}`,img);
          }
        }
      }catch{/* ignore */}
      setTokens(remote.map((t:Token)=>{
        const local=localImages.get(`${t.chain}:${t.address.toLowerCase()}`);
        const image=usableTokenImage(t.image)||local||t.image;
        return image&&image!==t.image?{...t,image}: (image?{...t,image}:t);
      }));}catch(e){if(!controller.signal.aborted){setError(e instanceof Error?e.message:'Market data is unavailable.');setTokens([]);}}finally{if(!controller.signal.aborted)setBusy(false);}},350);return()=>{clearTimeout(timer);controller.abort();};},[query]);
 const filtered=useMemo(()=>{
  const list=tokens.filter(t=>(chain==='all'||t.chain===chain)&&(tab!=='Stock pairs'||isStockPair(t))&&(tab!=='Watchlist'||watch.includes(t.id))&&(!minLiquidity||(t.liquidityUsd??0)>=Number(minLiquidity)));
  const rank=(a:Token,b:Token)=>tab==='New launches'?(Date.parse(b.createdAt||'')||0)-(Date.parse(a.createdAt||'')||0):sort==='marketcap'?(b.marketCap||0)-(a.marketCap||0):(b.volume24h||0)-(a.volume24h||0);
  return list.filter(t=>!isProtocolToken(t)).sort(rank);
 },[tokens,chain,query,tab,watch,minLiquidity,sort]);
 useEffect(()=>{setPage(0);},[chain,tab,query,minLiquidity,sort]);
 const PAGE_SIZE=12;
 const listed=filtered;
 const pageCount=Math.max(1,Math.ceil(listed.length/PAGE_SIZE));
 const currentPage=Math.min(page,pageCount-1);
 const visible=listed.slice(currentPage*PAGE_SIZE,currentPage*PAGE_SIZE+PAGE_SIZE);
 return <><section className="hero"><div className="eyebrow"><span className="live-dot"/> SEVEN NETWORKS. ONE OPEN MARKET.</div><h1>Small beginnings.<br/><span>Limitless possibilities.</span></h1><p>A home for your next idea. Discover community tokens,<br className="desktop"/> or launch one paired with stocks — or anything you believe in. Launchers get the airdrop.</p><Link className="primary-button" href="/create">Launch a token <ArrowUpRight size={17}/></Link><HeroMotion/></section>
 <section className="arc-banner" aria-labelledby="arc-banner-title">
  <div className="arc-banner-mark" aria-hidden="true">A</div>
  <div className="arc-banner-copy"><div className="stock-feature-kicker"><span className="new-tag">NEW</span><span className="live-dot"/> Network #7</div><h2 id="arc-banner-title">Launch on Arc.</h2><p>Create your token, add USDC liquidity, and start trading with predictable stablecoin gas.</p></div>
  <div className="arc-banner-actions"><Link className="primary-button" href="/create?chain=arc">Launch on Arc <ArrowUpRight size={16}/></Link><button className="secondary-button" type="button" onClick={()=>{setChain('arc');document.querySelector('.market')?.scrollIntoView({behavior:'smooth',block:'start'});}}>Explore Arc <ArrowRight size={15}/></button></div>
 </section>
 <ProtocolHow/>
 <TopMovers watch={watch} onWatch={onWatch}/>
 <section className="stock-feature" aria-labelledby="stock-feature-title">
  <div className="stock-feature-copy">
   <div className="stock-feature-kicker"><span className="new-tag">NEW</span><span className="live-dot"/> Stock pairs are live</div>
   <h2 id="stock-feature-title">Launch a community token<br/><span>paired with stocks.</span></h2>
   <p>Put your idea next to something people already know — NVDA, AAPL, and other stock tokens on Robinhood Chain, plus xStocks on Solana. Same open market. A cleaner story.</p>
   <div className="stock-feature-actions">
    <Link className="primary-button" href="/create?chain=robinhood">Launch with stocks <ArrowUpRight size={17}/></Link>
    <button type="button" className="secondary-button" onClick={()=>{setTab('Stock pairs');setChain('all');document.querySelector('.market')?.scrollIntoView({behavior:'smooth',block:'start'});}}>Browse stock pairs <ArrowRight size={15}/></button>
   </div>
  </div>
  <div className="stock-feature-panel" aria-hidden="true">
   <div className="stock-feature-card">
    <span className="stock-feature-pill">YOUR TOKEN</span>
    <strong>$YOURS</strong>
    <small>Community launch</small>
   </div>
   <div className="stock-feature-x">×</div>
   <div className="stock-feature-card is-stock">
    <span className="stock-feature-pill">STOCK</span>
    <strong>NVDA</strong>
    <small>Tokenized equity</small>
   </div>
   <p className="stock-feature-note">Seven networks. One open market. Pair with what you believe in.</p>
  </div>
 </section>
 <section className="market"><div className="section-heading"><h2>Find your next discovery<span>.</span></h2></div>
 <div className="market-toolbar"><div className="market-tabs" role="tablist" aria-label="Markets">{['Trending','New launches','Stock pairs','Watchlist'].map(t=><button key={t} role="tab" aria-selected={tab===t} className={tab===t?'active':''} onClick={()=>setTab(t)}>{t==='Watchlist'&&<Star size={13}/>} {t}</button>)}</div><label className="search-box"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search tokens…" aria-label="Search tokens"/>{query&&<button onClick={()=>setQuery('')} aria-label="Clear search"><X size={13}/></button>}</label></div>
 <div className="network-toolbar"><div className="network-filters"><button className={chain==='all'?'selected':''} onClick={()=>setChain('all')}>All networks</button>{chainKeys.map(k=><button key={k} className={chain===k?'selected':''} onClick={()=>setChain(k)}><ChainIcon chain={k}/>{k==='robinhood'?'Robinhood':CHAINS[k].name}</button>)}</div><button className={`filter-button ${filters?'active':''}`} onClick={()=>setFilters(!filters)} aria-expanded={filters}><SlidersHorizontal size={14}/><span>Filters</span></button></div>
 {filters&&<div className="filter-panel"><label>Minimum liquidity ($)<input type="number" min="0" placeholder="Any" value={minLiquidity} onChange={e=>setMinLiquidity(e.target.value)}/></label><label>Sort by<select value={sort} onChange={e=>setSort(e.target.value)}><option value="volume">24h volume</option><option value="marketcap">Market cap</option></select></label><button className="text-button" onClick={()=>{setMinLiquidity('');setSort('volume');}}>Reset filters</button></div>}
 <div className="market-caption"><span>{query.trim().length>=2?'DEX Screener · Search':tab==='Trending'?'Trending · Live markets':tab==='Stock pairs'?'Stock pairs · Tokenized stocks':'New launches · Live markets'}</span><span>{listed.length} pairs</span></div>
 {busy?<div className="empty-state"><LoaderCircle className="spin" size={24}/><p>Finding markets…</p></div>:error?<div className="empty-state"><Info size={24}/><h3>Markets are taking a moment</h3><p>{error}</p></div>:listed.length?<div className="token-grid">{visible.map((token,i)=><TokenCard key={token.id} token={token} index={currentPage*PAGE_SIZE+i} saved={watch.includes(token.id)} onWatch={()=>onWatch(token.id)}/>)}</div>:<div className="empty-state"><Search size={25}/><h3>{tab==='Watchlist'?'Keep a few favorites close.':'No matching pairs'}</h3><p>{tab==='Watchlist'?'Star a token in Explore to keep it close.':'Try another network or tab.'}</p><button className="secondary-button" onClick={()=>{setChain('all');setTab('Trending');setQuery('');setMinLiquidity('');}}>Reset view</button></div>}
 {listed.length>PAGE_SIZE&&<nav className="pager" aria-label="Market pages"><button type="button" disabled={currentPage===0} onClick={()=>{setPage(currentPage-1);document.querySelector('.token-grid')?.scrollIntoView({behavior:'smooth',block:'start'});}} aria-label="Previous page"><ChevronLeft size={16}/></button>{Array.from({length:pageCount},(_,i)=><button key={i} type="button" className={i===currentPage?'selected':''} onClick={()=>{setPage(i);document.querySelector('.token-grid')?.scrollIntoView({behavior:'smooth',block:'start'});}} aria-current={i===currentPage?'page':undefined}>{i+1}</button>)}<button type="button" disabled={currentPage>=pageCount-1} onClick={()=>{setPage(currentPage+1);document.querySelector('.token-grid')?.scrollIntoView({behavior:'smooth',block:'start'});}} aria-label="Next page"><ChevronRight size={16}/></button></nav>}
 <div className="market-bottom"><span>Good things start small.</span><Link href="/create">Create something of your own <ArrowRight size={14}/></Link></div></section></>;
}
export function tokenHref(token:Token){return `/token/${token.chain}/${token.poolAddress}`;}
export function TokenRow(props:{token:Token;index:number;saved:boolean;onWatch:()=>void}){return <TokenCard {...props}/>}
export function TokenCard({token,index,saved,onWatch}:{token:Token;index:number;saved:boolean;onWatch:()=>void}){const down=(token.change24h??0)<0;const href=tokenHref(token);return <article className={`token-card ${isProtocolToken(token)?'protocol':''}`} data-index={String(index+1).padStart(2,'0')}><button type="button" className={`icon-button star-button ${saved?'saved':''}`} aria-label={`${saved?'Remove':'Save'} ${token.name} ${saved?'from':'to'} watchlist`} aria-pressed={saved} onClick={e=>{e.preventDefault();e.stopPropagation();onWatch();}}><Star size={16} fill={saved?'currentColor':'none'}/></button><Link href={href} className="card-hit"><div className="card-top"><span className="token-name"><TokenIcon token={token}/><span className="card-id"><strong>{token.name}</strong><small>{token.symbol}{isProtocolToken(token)&&<span className="stock-tag">PROTOCOL</span>}</small></span></span></div>
<div className="card-price"><strong>{priceUsd(token.priceUsd)}</strong><span className={down?'negative':'positive'}>{percent(token.change24h)}</span></div>
<div className="card-stats"><div><span>Market cap</span><strong>{money(token.marketCap)}</strong></div><div><span>24h volume</span><strong>{money(token.volume24h)}</strong></div><div><span>Liquidity</span><strong>{money(token.liquidityUsd)}</strong></div></div>
<div className="card-footer"><span className="pair-cell"><span>{token.quoteSymbol.replace(' Stock Token','')}{isStockPair(token)&&<span className="stock-tag">STOCK</span>}</span><small><ChainIcon chain={token.chain}/>{CHAINS[token.chain].name}</small></span><span className="card-cta">Trade <ArrowUpRight size={13}/></span></div></Link></article>;}
