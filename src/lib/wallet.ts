'use client';
import { useEffect, useState } from 'react';
import type { ChainKey, PreparedTransaction } from './types';
type Provider = {request:(args:{method:string;params?:unknown[]})=>Promise<unknown>;on?:(name:string,handler:(...args:unknown[])=>void)=>void;removeListener?:(name:string,handler:(...args:unknown[])=>void)=>void};
declare global { interface Window {ethereum?:Provider;phantom?:{solana?:{connect:()=>Promise<{publicKey:{toString:()=>string}}>;disconnect:()=>Promise<void>;publicKey?:{toString:()=>string}}} } }
export function useWallet(){
 const [address,setAddress]=useState(''),[kind,setKind]=useState<'evm'|'solana'>('evm'),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{const p=window.ethereum;const change=(...args:unknown[])=>{const accounts=args[0] as string[];setAddress(accounts?.[0]||'');};p?.on?.('accountsChanged',change);return()=>p?.removeListener?.('accountsChanged',change);},[]);
 async function connect(type:'evm'|'solana'){
   setBusy(true);setError('');try{
    if(type==='solana'){if(!window.phantom?.solana)throw new Error('Open this page in Phantom, or install the Phantom browser extension.');const result=await window.phantom.solana.connect();setAddress(result.publicKey.toString());}
    else{if(!window.ethereum)throw new Error('Open this page in your wallet browser, or install an Ethereum wallet extension.');const accounts=await window.ethereum.request({method:'eth_requestAccounts'}) as string[];if(!accounts[0])throw new Error('No wallet account was selected.');setAddress(accounts[0]);}
    setKind(type);return true;
   }catch(e){setError(e instanceof Error?e.message:'Wallet connection was declined.');return false;}finally{setBusy(false);}
 }
 async function send(tx:PreparedTransaction){
   if(kind!=='evm'||!window.ethereum||!address)throw new Error('Connect an EVM wallet first.');
   if(tx.expiresAt<Date.now())throw new Error('This quote has expired. Request a new quote.');
   const requested=`0x${tx.chainId.toString(16)}`;
   if(await window.ethereum.request({method:'eth_chainId'})!==requested)await window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:requested}]});
   if(await window.ethereum.request({method:'eth_chainId'})!==requested)throw new Error('The wallet is on the wrong network.');
   const accounts=await window.ethereum.request({method:'eth_accounts'}) as string[];
   if(accounts[0]?.toLowerCase()!==address.toLowerCase())throw new Error('Wallet account changed. Reconnect before continuing.');
   return await window.ethereum.request({method:'eth_sendTransaction',params:[{from:address,...(tx.to?{to:tx.to}:{}),data:tx.data,value:`0x${BigInt(tx.value).toString(16)}`} ]}) as string;
 }
 return {address,kind,error,busy,connect,send,disconnect:()=>{setAddress('');setError('');},matches:(chain:ChainKey)=>chain==='solana'?kind==='solana':kind==='evm'};
}
