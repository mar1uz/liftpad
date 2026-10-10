import type { PreparedTransaction, QuoteRequest, TradeQuote } from '../types';
import {
  NEAR_DECIMALS,
  NEAR_POOL_FEE,
  NEAR_TOKEN_DECIMALS,
  ONE_YOCTO,
  TGAS,
  fromBaseUnits,
  isNearAccountId,
  nearConfig,
  nearPoolAddress,
  nearPoolId,
  nearTokenAccountId,
  toBaseUnits,
  yoctoNear,
  type NearTransaction,
} from '../near';
import { rpcUrl } from './config';
import { ProviderError } from './errors';
import { findPlatformLaunch } from './platform-launches';

/** NEP-145 registration is refunded above the contract's minimum. */
const FT_STORAGE = yoctoNear('0.0125');
/** Ref account storage (refundable via storage_withdraw). */
const REF_STORAGE = yoctoNear('0.1');
/** Ref simple pool storage + LP share storage. */
const POOL_STORAGE = yoctoNear('0.01');
const LP_STORAGE = yoctoNear('0.005');
const QUOTE_TTL = 30_000;
const LAUNCH_TTL = 10 * 60_000;
const POOL_SCAN = 300;

// ---------- RPC ----------
async function rpc<T>(method: string, params: unknown): Promise<T> {
  const call = () => fetch(rpcUrl('near'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'lift', method, params }),
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  });
  let r = await call();
  if (r.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    r = await call();
  }
  if (r.status === 429) throw new ProviderError('NEAR RPC is rate-limited. Try again in a moment.');
  // NEAR RPC reports bad requests as HTTP 400 with a JSON-RPC error body; read it instead of failing blind.
  if (!r.ok && !(r.headers.get('content-type') || '').includes('json')) throw new ProviderError('NEAR RPC is unavailable.');
  const data = await r.json().catch(() => ({ error: { cause: { name: 'BAD_RESPONSE' } } })) as { result?: T & { error?: string }; error?: { cause?: { name?: string }; data?: unknown; message?: string } };
  if (data.error) {
    const name = data.error.cause?.name || '';
    const status = name === 'UNKNOWN_TRANSACTION' ? 404 : name === 'PARSE_ERROR' || name === 'REQUEST_VALIDATION_ERROR' ? 400 : 503;
    throw new ProviderError(`NEAR RPC rejected the request${name ? ` (${name})` : ''}.`, status, name || 'NEAR_RPC_ERROR');
  }
  return data.result as T;
}

export async function nearView<T>(contract: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
  const result = await rpc<{ result?: number[]; error?: string }>('query', {
    request_type: 'call_function',
    finality: 'final',
    account_id: contract,
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
  });
  if (result.error || !result.result) throw new ProviderError(`NEAR view ${contract}.${method} failed.`, 503, 'NEAR_VIEW_FAILED');
  return JSON.parse(Buffer.from(result.result).toString('utf8')) as T;
}

async function accountExists(accountId: string) {
  try {
    await rpc('query', { request_type: 'view_account', finality: 'final', account_id: accountId });
    return true;
  } catch (e) {
    if (e instanceof ProviderError && /UNKNOWN_ACCOUNT/.test(e.code)) return false;
    throw e;
  }
}

async function ftRegistered(token: string, account: string) {
  try {
    return Boolean(await nearView<unknown>(token, 'storage_balance_of', { account_id: account }));
  } catch {
    return false;
  }
}

type NearTxStatus = {
  status: 'pending' | 'confirmed' | 'failed';
  signerId?: string;
  receiverId?: string;
  transferDeposit?: bigint;
  successValue?: string;
  block?: string;
};

/** NEAR tx lookup needs the signer; returns pending while unknown. */
export async function nearTransactionStatus(hash: string, sender: string): Promise<NearTxStatus> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(hash) || !isNearAccountId(sender)) {
    throw new ProviderError('Invalid NEAR transaction identifier.', 400, 'INVALID_TX');
  }
  type Outcome = {
    status: { SuccessValue?: string; Failure?: unknown; SuccessReceiptId?: string } | string;
    transaction: { signer_id: string; receiver_id: string; actions: Array<string | Record<string, { deposit?: string }>> };
    transaction_outcome: { block_hash: string };
    receipts_outcome: Array<{ outcome: { status: { Failure?: unknown } | string } }>;
  };
  let tx: Outcome;
  try {
    tx = await rpc<Outcome>('tx', { tx_hash: hash, sender_account_id: sender, wait_until: 'EXECUTED_OPTIMISTIC' });
  } catch (e) {
    if (e instanceof ProviderError && (e.code === 'UNKNOWN_TRANSACTION' || e.code === 'TIMEOUT_ERROR')) return { status: 'pending' };
    throw e;
  }
  const st = typeof tx.status === 'object' ? tx.status : {};
  const receiptFailed = tx.receipts_outcome?.some((r) => typeof r.outcome.status === 'object' && 'Failure' in r.outcome.status);
  const failed = 'Failure' in st || receiptFailed;
  let transferDeposit = 0n;
  for (const action of tx.transaction.actions || []) {
    if (typeof action === 'object' && action.Transfer?.deposit) transferDeposit += BigInt(action.Transfer.deposit);
  }
  return {
    status: failed ? 'failed' : ('SuccessValue' in st || 'SuccessReceiptId' in st) ? 'confirmed' : 'pending',
    signerId: tx.transaction.signer_id,
    receiverId: tx.transaction.receiver_id,
    transferDeposit,
    successValue: st.SuccessValue,
    block: tx.transaction_outcome?.block_hash,
  };
}

// ---------- launch ----------
type FactoryTokenArgs = {
  owner_id: string;
  total_supply: string;
  metadata: { spec: string; name: string; symbol: string; icon?: string | null; reference?: string | null; reference_hash?: string | null; decimals: number };
};

/** Data-URL icons are stored on-chain (2× bytes of storage); keep them tiny. */
function chainIcon(uri?: string) {
  if (!uri) return null;
  if (uri.startsWith('data:image/') && uri.length <= 8_000) return uri;
  return null;
}

export function nearLaunchEnabled() {
  const cfg = nearConfig();
  return Boolean(cfg.treasury && isNearAccountId(cfg.treasury));
}

export function nearFeeYocto() {
  return yoctoNear(nearConfig().launchFee);
}

export function buildFactoryArgs(input: { name: string; symbol: string; supply: string; account: string; icon?: string }): FactoryTokenArgs {
  if (!/^\d{1,20}$/.test(input.supply) || BigInt(input.supply) <= 0n) throw new ProviderError('Enter a whole-number supply.', 400, 'INVALID_SUPPLY');
  return {
    owner_id: input.account,
    total_supply: toBaseUnits(input.supply, NEAR_TOKEN_DECIMALS),
    metadata: {
      spec: 'ft-1.0.0',
      name: input.name.trim(),
      symbol: input.symbol.trim().toUpperCase(),
      icon: chainIcon(input.icon),
      reference: null,
      reference_hash: null,
      decimals: NEAR_TOKEN_DECIMALS,
    },
  };
}

export function launchTransactions(input: { args: FactoryTokenArgs; deposit: string; feeYocto: string; treasury: string; factory: string; skipFee?: boolean }): NearTransaction[] {
  const txs: NearTransaction[] = [];
  if (!input.skipFee) txs.push({ receiverId: input.treasury, actions: [{ type: 'Transfer', deposit: input.feeYocto }] });
  txs.push({
    receiverId: input.factory,
    actions: [{ type: 'FunctionCall', methodName: 'create_token', args: { args: input.args }, gas: TGAS(300), deposit: input.deposit }],
  });
  return txs;
}

export async function buildNearLaunch(input: { name: string; symbol: string; supply: string; account: string; icon?: string; feeTx?: string }) {
  const cfg = nearConfig();
  if (!nearLaunchEnabled()) {
    throw new ProviderError(`NEAR ${cfg.networkId} launches need the LIFT treasury account (${cfg.networkId === 'testnet' ? 'NEXT_PUBLIC_NEAR_TREASURY_TESTNET' : 'NEXT_PUBLIC_NEAR_TREASURY'}).`, 503, 'NEAR_TREASURY_NOT_CONFIGURED');
  }
  // A transfer to a missing named account fails; refuse before the wallet prompt.
  if (!(await accountExists(cfg.treasury))) {
    throw new ProviderError(`The LIFT treasury ${cfg.treasury} does not exist on NEAR ${cfg.networkId} yet. Create it first.`, 503, 'NEAR_TREASURY_MISSING');
  }
  if (!isNearAccountId(input.account)) throw new ProviderError('Connect a NEAR account.', 400, 'INVALID_ACCOUNT');
  let tokenId: string;
  try {
    tokenId = nearTokenAccountId(input.symbol, cfg.factory);
  } catch (e) {
    throw new ProviderError(e instanceof Error ? e.message : 'Invalid symbol.', 400, 'INVALID_SYMBOL');
  }
  const taken = await nearView<FactoryTokenArgs | null>(cfg.factory, 'get_token', { token_id: input.symbol.trim().toLowerCase() });
  if (taken) {
    if (taken.owner_id === input.account) {
      return { kind: 'near' as const, tokenId, alreadyCreated: true, transactions: [] as PreparedTransaction[], expiresAt: Date.now() + LAUNCH_TTL };
    }
    throw new ProviderError(`$${input.symbol.toUpperCase()} is already taken on NEAR (${tokenId}). Pick another symbol.`, 409, 'SYMBOL_TAKEN');
  }
  const args = buildFactoryArgs(input);
  const required = await nearView<string>(cfg.factory, 'get_required_deposit', { args, account_id: input.account });
  // 2% headroom; unused storage stays credited to the creator in the factory.
  const deposit = ((BigInt(required) * 102n) / 100n).toString();
  let skipFee = false;
  if (input.feeTx) {
    const fee = await nearTransactionStatus(input.feeTx, input.account);
    skipFee = fee.status === 'confirmed' && fee.receiverId === cfg.treasury && (fee.transferDeposit ?? 0n) >= BigInt(nearFeeYocto());
  }
  const expiresAt = Date.now() + LAUNCH_TTL;
  const near = launchTransactions({ args, deposit, feeYocto: nearFeeYocto(), treasury: cfg.treasury, factory: cfg.factory, skipFee });
  const tx: PreparedTransaction = {
    chain: 'near', chainId: 0, data: '0x', value: '0', expiresAt, near,
    description: skipFee ? `Create ${tokenId}` : `LIFT fee ${cfg.launchFee} NEAR + create ${tokenId}`,
  };
  return {
    kind: 'near' as const,
    tokenId,
    alreadyCreated: false,
    feeSkipped: skipFee,
    storageDeposit: fromBaseUnits(deposit, NEAR_DECIMALS, 4),
    transactions: [tx],
    treasury: cfg.treasury,
    expiresAt,
  };
}

// ---------- pool ----------
type RefPool = { pool_kind: string; token_account_ids: string[]; amounts: string[]; total_fee: number; shares_total_supply: string };

function poolMatches(pool: RefPool | null | undefined, token: string, wrap: string) {
  return Boolean(pool && pool.pool_kind === 'SIMPLE_POOL' && pool.token_account_ids.length === 2 && pool.token_account_ids.includes(token) && pool.token_account_ids.includes(wrap));
}

export async function findNearPool(token: string, hint?: number): Promise<{ poolId: number; pool: RefPool } | undefined> {
  const { ref, wrap } = nearConfig();
  if (hint !== undefined) {
    try {
      const pool = await nearView<RefPool>(ref, 'get_pool', { pool_id: hint });
      if (poolMatches(pool, token, wrap)) return { poolId: hint, pool };
    } catch {
      /* fall through to scan */
    }
  }
  const count = await nearView<number>(ref, 'get_number_of_pools');
  const start = Math.max(0, count - POOL_SCAN);
  const pages: Promise<RefPool[]>[] = [];
  for (let from = start; from < count; from += 100) pages.push(nearView<RefPool[]>(ref, 'get_pools', { from_index: from, limit: Math.min(100, count - from) }));
  const all = (await Promise.all(pages)).flat();
  let best: { poolId: number; pool: RefPool } | undefined;
  all.forEach((pool, i) => {
    if (!poolMatches(pool, token, wrap)) return;
    const candidate = { poolId: start + i, pool };
    if (!best || BigInt(pool.shares_total_supply) > BigInt(best.pool.shares_total_supply)) best = candidate;
  });
  return best;
}

export type NearLiquidityStatus = {
  chain: 'near';
  token: string;
  tokenExists: boolean;
  live: boolean;
  poolId?: number;
  poolAddress?: string;
  refRegistered: boolean;
  depositedToken: string;
  depositedNear: string;
  observedAt: string;
};

export async function inspectNearLiquidity(input: { token: string; account?: string; pool?: string }): Promise<NearLiquidityStatus> {
  const { ref, wrap } = nearConfig();
  if (!isNearAccountId(input.token)) throw new ProviderError('Invalid NEAR token account.', 400);
  const tokenExists = await accountExists(input.token);
  const found = tokenExists ? await findNearPool(input.token, input.pool ? nearPoolId(input.pool) : undefined) : undefined;
  let refRegistered = false;
  let deposits: Record<string, string> = {};
  if (input.account && isNearAccountId(input.account)) {
    refRegistered = Boolean(await nearView<unknown>(ref, 'storage_balance_of', { account_id: input.account }).catch(() => null));
    if (refRegistered) deposits = await nearView<Record<string, string>>(ref, 'get_deposits', { account_id: input.account }).catch(() => ({}));
  }
  const live = Boolean(found && found.pool.amounts.every((a) => BigInt(a) > 0n));
  return {
    chain: 'near',
    token: input.token,
    tokenExists,
    live,
    poolId: found?.poolId,
    poolAddress: found ? nearPoolAddress(found.poolId) : undefined,
    refRegistered,
    depositedToken: deposits[input.token] || '0',
    depositedNear: deposits[wrap] || '0',
    observedAt: new Date().toISOString(),
  };
}

/**
 * Creator-funded Ref pool. One wallet approval signs, in order:
 *   1. Ref: storage (if new) + register tokens + add_simple_pool (only if no pool yet)
 *   2. Token: register Ref + ft_transfer_call tokens into Ref (skipped if already deposited)
 *   3. wNEAR: register creator + wrap NEAR + ft_transfer_call into Ref (skipped if already deposited)
 *   4. Ref: add_liquidity on the pool (id predicted from get_number_of_pools when new)
 * The creator receives the LP shares. If the predicted id was taken by someone else in between, step 4
 * fails harmlessly (deposits stay in the creator's Ref balance) and Resume sends only add_liquidity.
 */
export function liquidityTransactions(input: {
  ref: string; wrap: string; token: string; account: string;
  tokenRaw: string; nearRaw: string; poolId: number; createPool: boolean;
  refRegistered: boolean; refOnToken: boolean; accountOnWrap: boolean;
  depositToken: boolean; depositNear: boolean;
}): NearTransaction[] {
  const txs: NearTransaction[] = [];
  const refActions: NearTransaction['actions'] = [];
  if (!input.refRegistered) refActions.push({ type: 'FunctionCall', methodName: 'storage_deposit', args: { account_id: input.account, registration_only: false }, gas: TGAS(10), deposit: REF_STORAGE });
  // Ref only accepts deposits of globally whitelisted or user-registered tokens. Mainnet auto-whitelists
  // *.tkn.near, testnet does not whitelist *.tokenfactory.testnet — so always register (idempotent, 1 yocto).
  if (input.createPool || input.depositToken || input.depositNear) {
    refActions.push({ type: 'FunctionCall', methodName: 'register_tokens', args: { token_ids: [input.token, input.wrap] }, gas: TGAS(10), deposit: ONE_YOCTO });
  }
  if (input.createPool) {
    refActions.push({ type: 'FunctionCall', methodName: 'add_simple_pool', args: { tokens: [input.token, input.wrap], fee: NEAR_POOL_FEE }, gas: TGAS(30), deposit: POOL_STORAGE });
  }
  if (refActions.length) txs.push({ receiverId: input.ref, actions: refActions });
  if (input.depositToken) {
    const actions: NearTransaction['actions'] = [];
    if (!input.refOnToken) actions.push({ type: 'FunctionCall', methodName: 'storage_deposit', args: { account_id: input.ref, registration_only: true }, gas: TGAS(10), deposit: FT_STORAGE });
    actions.push({ type: 'FunctionCall', methodName: 'ft_transfer_call', args: { receiver_id: input.ref, amount: input.tokenRaw, msg: '' }, gas: TGAS(150), deposit: ONE_YOCTO });
    txs.push({ receiverId: input.token, actions });
  }
  if (input.depositNear) {
    const actions: NearTransaction['actions'] = [];
    if (!input.accountOnWrap) actions.push({ type: 'FunctionCall', methodName: 'storage_deposit', args: { account_id: input.account, registration_only: true }, gas: TGAS(10), deposit: FT_STORAGE });
    actions.push({ type: 'FunctionCall', methodName: 'near_deposit', args: {}, gas: TGAS(10), deposit: input.nearRaw });
    actions.push({ type: 'FunctionCall', methodName: 'ft_transfer_call', args: { receiver_id: input.ref, amount: input.nearRaw, msg: '' }, gas: TGAS(150), deposit: ONE_YOCTO });
    txs.push({ receiverId: input.wrap, actions });
  }
  txs.push({
    receiverId: input.ref,
    actions: [{ type: 'FunctionCall', methodName: 'add_liquidity', args: { pool_id: input.poolId, amounts: [input.tokenRaw, input.nearRaw] }, gas: TGAS(50), deposit: LP_STORAGE }],
  });
  return txs;
}

export async function buildNearLiquidity(input: { token: string; account: string; tokenAmount: string; quoteAmount: string; pool?: string }) {
  const { ref, wrap } = nearConfig();
  if (!isNearAccountId(input.account) || !isNearAccountId(input.token)) throw new ProviderError('Invalid NEAR account.', 400);
  const tokenRaw = toBaseUnits(input.tokenAmount, NEAR_TOKEN_DECIMALS);
  const nearRaw = toBaseUnits(input.quoteAmount, NEAR_DECIMALS);
  if (BigInt(tokenRaw) <= 0n || BigInt(nearRaw) <= 0n) throw new ProviderError('Enter the tokens and NEAR you will add to the pool.', 400);
  const status = await inspectNearLiquidity({ token: input.token, account: input.account, pool: input.pool });
  if (!status.tokenExists) throw new ProviderError('The NEAR token is not created yet.', 409, 'TOKEN_MISSING');
  const [balance, refOnToken, accountOnWrap, poolCount] = await Promise.all([
    nearView<string>(input.token, 'ft_balance_of', { account_id: input.account }),
    ftRegistered(input.token, ref),
    ftRegistered(wrap, input.account),
    status.poolId === undefined ? nearView<number>(ref, 'get_number_of_pools') : Promise.resolve(status.poolId),
  ]);
  const depositToken = BigInt(status.depositedToken) < BigInt(tokenRaw);
  const depositNear = BigInt(status.depositedNear) < BigInt(nearRaw);
  if (depositToken && BigInt(balance) < BigInt(tokenRaw)) throw new ProviderError('Your wallet holds fewer tokens than the pool amount.', 400, 'INSUFFICIENT_TOKEN');
  const createPool = status.poolId === undefined;
  const poolId = createPool ? poolCount : status.poolId!;
  const near = liquidityTransactions({
    ref, wrap, token: input.token, account: input.account, tokenRaw, nearRaw, poolId, createPool,
    refRegistered: status.refRegistered, refOnToken, accountOnWrap, depositToken, depositNear,
  });
  const expiresAt = Date.now() + LAUNCH_TTL;
  return {
    kind: 'near' as const,
    poolId,
    poolAddress: nearPoolAddress(poolId),
    createPool,
    status,
    transaction: {
      chain: 'near', chainId: 0, data: '0x', value: '0', expiresAt, near,
      description: createPool ? 'Create and fund your Ref Finance pool' : 'Add your liquidity to the Ref Finance pool',
    } satisfies PreparedTransaction,
    expiresAt,
  };
}

// ---------- completion check ----------
export async function verifyNearLaunch(input: { tokenAddress: string; poolAddress: string; creatorWallet: string; name: string; symbol: string; feeTx: string }) {
  const cfg = nearConfig();
  if (!isNearAccountId(input.creatorWallet)) throw new ProviderError('Invalid creator account.', 400);
  const tokenId = input.symbol.trim().toLowerCase();
  if (input.tokenAddress !== nearTokenAccountId(input.symbol, cfg.factory)) throw new ProviderError('The token account does not match this factory and symbol.', 409, 'DEPLOYMENT_MISMATCH');
  const [args, fee, pool] = await Promise.all([
    nearView<FactoryTokenArgs | null>(cfg.factory, 'get_token', { token_id: tokenId }),
    nearTransactionStatus(input.feeTx, input.creatorWallet),
    inspectNearLiquidity({ token: input.tokenAddress, pool: input.poolAddress }),
  ]);
  if (!args || args.owner_id !== input.creatorWallet || args.metadata.name !== input.name || args.metadata.symbol.toLowerCase() !== tokenId) {
    throw new ProviderError('The NEAR token does not match this creator and metadata.', 409, 'DEPLOYMENT_MISMATCH');
  }
  if (fee.status !== 'confirmed' || fee.signerId !== input.creatorWallet || fee.receiverId !== cfg.treasury || (fee.transferDeposit ?? 0n) < BigInt(nearFeeYocto())) {
    throw new ProviderError('The NEAR launch fee transaction could not be verified.', 409, 'FEE_MISMATCH');
  }
  if (!pool.live || pool.poolAddress !== input.poolAddress) throw new ProviderError('The submitted pool is not the live Ref Finance pool.', 409, 'POOL_MISMATCH');
  return pool;
}

// ---------- trading (Ref instant swap on LIFT pools) ----------
export async function buildNearTradeQuote(request: QuoteRequest): Promise<TradeQuote> {
  const { ref, wrap } = nearConfig();
  const launch = await findPlatformLaunch('near', request.pool);
  if (!launch?.poolAddress) throw new ProviderError('This NEAR token does not have a live LIFT pool yet.', 404, 'NOT_LIFT_POOL');
  const poolId = nearPoolId(launch.poolAddress);
  if (poolId === undefined) throw new ProviderError('The saved NEAR pool is invalid.', 409, 'POOL_MISMATCH');
  if (!isNearAccountId(request.account)) throw new ProviderError('Connect a NEAR account.', 400);
  const token = launch.tokenAddress;
  const isNear = (id?: string) => id === wrap || id === 'near';
  const buy = isNear(request.tokenIn) && request.tokenOut === token;
  const sell = request.tokenIn === token && isNear(request.tokenOut);
  if (!buy && !sell) throw new ProviderError('NEAR pools only support the token/NEAR pair.', 400, 'PAIR_MISMATCH');
  const tokenIn = buy ? wrap : token;
  const tokenOut = buy ? token : wrap;
  const inDecimals = buy ? NEAR_DECIMALS : NEAR_TOKEN_DECIMALS;
  const outDecimals = buy ? NEAR_TOKEN_DECIMALS : NEAR_DECIMALS;
  const amountIn = toBaseUnits(request.amountIn, inDecimals);
  const out = await nearView<string>(ref, 'get_return', { pool_id: poolId, token_in: tokenIn, amount_in: amountIn, token_out: tokenOut });
  if (BigInt(out) <= 0n) throw new ProviderError('The NEAR pool returned no output for this amount.', 400, 'NO_ROUTE');
  const minOut = (BigInt(out) * BigInt(10_000 - request.slippageBps)) / 10_000n;
  const msg = JSON.stringify({
    force: 0,
    actions: [{ pool_id: poolId, token_in: tokenIn, token_out: tokenOut, amount_in: amountIn, min_amount_out: minOut.toString() }],
    skip_unwrap_near: false,
  });
  const [userOnOut, userOnWrap] = await Promise.all([ftRegistered(tokenOut, request.account), ftRegistered(wrap, request.account)]);
  const near: NearTransaction[] = [];
  if (!userOnOut && tokenOut !== wrap) {
    near.push({ receiverId: tokenOut, actions: [{ type: 'FunctionCall', methodName: 'storage_deposit', args: { account_id: request.account, registration_only: true }, gas: TGAS(10), deposit: FT_STORAGE }] });
  }
  if (buy) {
    near.push({
      receiverId: wrap,
      actions: [
        ...(!userOnWrap ? [{ type: 'FunctionCall' as const, methodName: 'storage_deposit', args: { account_id: request.account, registration_only: true }, gas: TGAS(10), deposit: FT_STORAGE }] : []),
        { type: 'FunctionCall', methodName: 'near_deposit', args: {}, gas: TGAS(10), deposit: amountIn },
        { type: 'FunctionCall', methodName: 'ft_transfer_call', args: { receiver_id: ref, amount: amountIn, msg }, gas: TGAS(180), deposit: ONE_YOCTO },
      ],
    });
  } else {
    if (!userOnWrap) near.push({ receiverId: wrap, actions: [{ type: 'FunctionCall', methodName: 'storage_deposit', args: { account_id: request.account, registration_only: true }, gas: TGAS(10), deposit: FT_STORAGE }] });
    near.push({ receiverId: token, actions: [{ type: 'FunctionCall', methodName: 'ft_transfer_call', args: { receiver_id: ref, amount: amountIn, msg }, gas: TGAS(180), deposit: ONE_YOCTO }] });
  }
  const expiresAt = Date.now() + QUOTE_TTL;
  return {
    chain: 'near',
    source: 'lift-ref-near',
    observedAt: new Date().toISOString(),
    expiresAt,
    amountIn: request.amountIn,
    amountOut: fromBaseUnits(out, outDecimals),
    minimumOut: fromBaseUnits(minOut, outDecimals),
    tokenIn: request.tokenIn,
    tokenOut: request.tokenOut!,
    fee: NEAR_POOL_FEE,
    transaction: { chain: 'near', chainId: 0, data: '0x', value: '0', expiresAt, near, description: buy ? `Buy ${launch.symbol} with NEAR` : `Sell ${launch.symbol} for NEAR` },
  };
}
