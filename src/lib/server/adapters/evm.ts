import { createPublicClient, http, fallback, encodeFunctionData, erc20Abi, parseAbi, parseUnits, formatUnits, getAddress, type Address, type Hex, TransactionReceiptNotFoundError } from 'viem';
import { CHAINS } from '@/lib/chains';
import type { ChainKey, ChainAdapter, LaunchDraft, PreparedTransaction, QuoteRequest, TradeQuote } from '@/lib/types';
import { minimumOutput } from '@/lib/format';
import { dexConfig, quoteAssets, rpcUrl } from '../config';
import { ProviderError } from '../errors';
const poolAbi=parseAbi(['function token0() view returns (address)','function token1() view returns (address)','function fee() view returns (uint24)','function factory() view returns (address)']);
const factoryAbi=parseAbi(['function getPool(address,address,uint24) view returns (address)']);
const quoterAbi=parseAbi(['function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)']);
const router02Abi=parseAbi(['function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)']);
const routerV1Abi=parseAbi(['function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)']);
export class EvmAdapter implements ChainAdapter {
 constructor(public chain:Exclude<ChainKey,'solana'>){}
 client(){const backup=process.env[`RPC_${this.chain.toUpperCase()}_BACKUP`];return createPublicClient({transport:fallback([http(rpcUrl(this.chain),{timeout:8000,retryCount:1}),...(backup?[http(backup,{timeout:8000,retryCount:1})]:[])])});}
 async getPoolData(address:string){
  const cfg=dexConfig(this.chain),pool=getAddress(address);if(!cfg.approvedPools.some(a=>a.toLowerCase()===pool.toLowerCase()))throw new ProviderError('This pool has not been approved for trading.',403,'POOL_NOT_APPROVED');
  const client=this.client();if(await client.getChainId()!==CHAINS[this.chain].id)throw new ProviderError('The RPC returned an unexpected network.');
  const [token0,token1,fee,factory]=await Promise.all([client.readContract({address:pool,abi:poolAbi,functionName:'token0'}),client.readContract({address:pool,abi:poolAbi,functionName:'token1'}),client.readContract({address:pool,abi:poolAbi,functionName:'fee'}),client.readContract({address:pool,abi:poolAbi,functionName:'factory'})]);
  if(factory.toLowerCase()!==cfg.factory.toLowerCase())throw new ProviderError('The pool factory does not match the reviewed configuration.',403);
  const canonical=await client.readContract({address:getAddress(cfg.factory),abi:factoryAbi,functionName:'getPool',args:[token0,token1,fee]});
  if(canonical.toLowerCase()!==pool.toLowerCase())throw new ProviderError('This is not the canonical pool.',403);
  return {token0,token1,fee,source:'on-chain-v3',observedAt:new Date().toISOString()};
 }
 async quote(request:QuoteRequest):Promise<TradeQuote>{
  const cfg=dexConfig(this.chain),client=this.client(),pool=await this.getPoolData(request.pool),tokenIn=getAddress(request.tokenIn),account=getAddress(request.account);
  if(![pool.token0,pool.token1].some(t=>t.toLowerCase()===tokenIn.toLowerCase()))throw new ProviderError('The input token is not part of this pool.',400);
  const tokenOut=getAddress(tokenIn.toLowerCase()===pool.token0.toLowerCase()?pool.token1:pool.token0);
  const accepted=quoteAssets().find(a=>a.chain===this.chain&&a.enabled&&[pool.token0,pool.token1].some(t=>t.toLowerCase()===a.address.toLowerCase()));
  if(!accepted)throw new ProviderError('This pair has no verified quote asset.',403,'QUOTE_ASSET_NOT_APPROVED');
  // Stock eligibility must be checked by the authenticated route before reaching this adapter.
  const [decimalsIn,decimalsOut,balance,allowance]=await Promise.all([
   client.readContract({address:tokenIn,abi:erc20Abi,functionName:'decimals'}),client.readContract({address:tokenOut,abi:erc20Abi,functionName:'decimals'}),client.readContract({address:tokenIn,abi:erc20Abi,functionName:'balanceOf',args:[account]}),client.readContract({address:tokenIn,abi:erc20Abi,functionName:'allowance',args:[account,getAddress(cfg.router)]})]);
  if(decimalsIn>36||decimalsOut>36)throw new ProviderError('Unsupported token precision.',400);
  if((request.amountIn.split('.')[1]?.length||0)>decimalsIn)throw new ProviderError('Amount exceeds token precision.',400);
  const amountIn=parseUnits(request.amountIn,decimalsIn);if(amountIn<=0n)throw new ProviderError('Enter a positive amount.',400);if(balance<amountIn)throw new ProviderError('Insufficient input-token balance. Wrapped assets must already be in your wallet.',400,'INSUFFICIENT_BALANCE');
  const {result}=await client.simulateContract({address:getAddress(cfg.quoter),abi:quoterAbi,functionName:'quoteExactInputSingle',args:[{tokenIn,tokenOut,amountIn,fee:pool.fee,sqrtPriceLimitX96:0n}],account});
  if(result[0]<=0n)throw new ProviderError('Insufficient liquidity.',400);
  const min=minimumOutput(result[0],request.slippageBps);if(min===0n)throw new ProviderError('Trade amount is too small.',400);
  const expiresAt=Date.now()+30000;
  const params={tokenIn,tokenOut,fee:pool.fee,recipient:account,amountIn,amountOutMinimum:min,sqrtPriceLimitX96:0n};
  const data=cfg.routerStyle==='swap-router-02'?encodeFunctionData({abi:router02Abi,functionName:'exactInputSingle',args:[params]}):encodeFunctionData({abi:routerV1Abi,functionName:'exactInputSingle',args:[{...params,deadline:BigInt(Math.floor(expiresAt/1000))}]});
  const transaction:PreparedTransaction={chain:this.chain,chainId:CHAINS[this.chain].id!,to:getAddress(cfg.router),data,value:'0',description:'Swap through the reviewed V3 router',expiresAt};
  let approval:PreparedTransaction|undefined;
  if(allowance<amountIn)approval={chain:this.chain,chainId:CHAINS[this.chain].id!,to:tokenIn,data:encodeFunctionData({abi:erc20Abi,functionName:'approve',args:[getAddress(cfg.router),allowance>0n?0n:amountIn]}),value:'0',description:allowance>0n?'Reset token allowance before approval':'Approve the exact input amount',expiresAt};
  else await client.call({account,to:transaction.to,data:transaction.data,value:0n});
  return {chain:this.chain,source:'on-chain-v3',observedAt:pool.observedAt,expiresAt,amountIn:request.amountIn,amountOut:formatUnits(result[0],decimalsOut),minimumOut:formatUnits(min,decimalsOut),tokenIn,tokenOut,fee:pool.fee,approval,transaction};
 }
 async buildTransaction(quote:TradeQuote){if(quote.chain!==this.chain||quote.expiresAt<=Date.now())throw new ProviderError('Quote expired. Request another.',409,'QUOTE_EXPIRED');return quote.transaction;}
 async verifyTransaction(hash:string){try{const client=this.client();const receipt=await client.getTransactionReceipt({hash:hash as Hex});if(receipt.status==='reverted')return {status:'failed' as const,block:receipt.blockNumber.toString()};const finalized=await client.getBlock({blockTag:'finalized'});return {status:receipt.blockNumber<=finalized.number?'confirmed' as const:'pending' as const,block:receipt.blockNumber.toString(),contractAddress:receipt.contractAddress||undefined};}catch(e){if(e instanceof TransactionReceiptNotFoundError)return {status:'pending' as const};throw new ProviderError('Transaction confirmation is temporarily unavailable.');}}
 async launch(_draft:LaunchDraft):Promise<PreparedTransaction>{throw new ProviderError('Launch requires a reviewed token deployment artifact and liquidity workflow. Drafts can be saved now.',503,'LAUNCH_NOT_CONFIGURED');}
}
