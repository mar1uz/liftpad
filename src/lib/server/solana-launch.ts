import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { NATIVE_MINT } from '@solana/spl-token';
import BN from 'bn.js';
import { PROTOCOL } from '@/lib/protocol';
import { PUBLIC_RPC } from './open-quote';
import { ProviderError } from './errors';
import { getLiftPlatformId } from './lift-platform';
import {
  assertSufficientLaunchLabBalance,
  estimateBeforeSlippage,
  formatLaunchLabTokenAmount,
  parseLaunchLabTokenAmount,
} from './launchlab-amounts';

const FEE_LAMPORTS = BigInt(Math.round(PROTOCOL.launchFeeSol * LAMPORTS_PER_SOL));

/** LIFT platform was registered with a CPMM config — LaunchLab rejects migrateType amm (error 6007). */
const MIGRATE_TYPE = 'cpmm' as const;

/** How long a fee payment can be reused to resume mint without paying again. */
const FEE_RESUME_WINDOW_SEC = 48 * 60 * 60;

function encodeTx(tx: Transaction | VersionedTransaction): string {
  if (tx instanceof VersionedTransaction) {
    return Buffer.from(tx.serialize()).toString('base64');
  }
  return Buffer.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })).toString('base64');
}

function simFailureMessage(logs: string[] | null | undefined, err: unknown): string {
  const fromLogs = (logs || []).find((l) => /Error Code:|Error Message:|failed:/i.test(l));
  if (fromLogs) {
    const code = fromLogs.match(/Error Code:\s*(\w+)/)?.[1];
    const msg = fromLogs.match(/Error Message:\s*([^.]+)/)?.[1];
    if (code && msg) return `${msg} (${code})`;
    if (msg) return msg;
    return fromLogs.slice(0, 180);
  }
  if (err && typeof err === 'object') return JSON.stringify(err).slice(0, 180);
  return 'Transaction simulation failed.';
}

async function assertSimulates(
  connection: Connection,
  tx: Transaction | VersionedTransaction,
  label: string,
) {
  let err: unknown;
  let logs: string[] | null | undefined;
  if (tx instanceof VersionedTransaction) {
    const result = await connection.simulateTransaction(tx, {
      sigVerify: false,
      replaceRecentBlockhash: true,
    });
    err = result.value.err;
    logs = result.value.logs;
  } else {
    const wire = Buffer.from(
      tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
    ).toString('base64');
    const unsafeRes = (await (connection as unknown as {
      _rpcRequest: (method: string, args: unknown[]) => Promise<{ result?: { value: { err: unknown; logs?: string[] } }; error?: { message: string } }>;
    })._rpcRequest('simulateTransaction', [
      wire,
      { encoding: 'base64', sigVerify: false, replaceRecentBlockhash: true, commitment: 'confirmed' },
    ])) as { result?: { value: { err: unknown; logs?: string[] } }; error?: { message: string } };
    if (unsafeRes.error) {
      throw new ProviderError(`${label} simulation RPC error: ${unsafeRes.error.message}`, 503, 'SOLANA_SIM_RPC');
    }
    err = unsafeRes.result?.value.err;
    logs = unsafeRes.result?.value.logs;
  }
  if (err) {
    throw new ProviderError(
      `${label} would fail on-chain: ${simFailureMessage(logs, err)}`,
      400,
      'SOLANA_SIM_FAILED',
    );
  }
}

function isFeeTransferIx(ix: {
  program?: string;
  parsed?: { type?: string; info?: { source?: string; destination?: string; lamports?: number | string } };
}, account: string, treasury: string): boolean {
  if (ix.program !== 'system' || ix.parsed?.type !== 'transfer') return false;
  const info = ix.parsed.info || {};
  const lamports = BigInt(info.lamports ?? 0);
  return info.source === account && info.destination === treasury && lamports === FEE_LAMPORTS;
}

/** Confirm a signature is a successful 0.01 SOL platform fee from `account` to treasury. */
export async function verifySolanaLaunchFee(connection: Connection, account: string, feeTx: string): Promise<string> {
  let parsed;
  try {
    parsed = await connection.getParsedTransaction(feeTx, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    });
  } catch {
    throw new ProviderError('Could not look up the fee transaction. Check the signature and try again.', 400, 'FEE_TX_LOOKUP');
  }
  if (!parsed || parsed.meta?.err) {
    throw new ProviderError('That fee transaction failed or was not found on Solana.', 400, 'FEE_TX_INVALID');
  }
  const treasury = PROTOCOL.treasurySol;
  const ixs = [
    ...parsed.transaction.message.instructions,
    ...(parsed.meta?.innerInstructions || []).flatMap((inner) => inner.instructions),
  ];
  const ok = ixs.some((ix) => isFeeTransferIx(ix as Parameters<typeof isFeeTransferIx>[0], account, treasury));
  if (!ok) {
    throw new ProviderError(
      `Fee signature must be a confirmed ${PROTOCOL.launchFeeSol} SOL transfer from your wallet to the LIFT treasury.`,
      400,
      'FEE_TX_MISMATCH',
    );
  }
  const age = Date.now() / 1000 - (parsed.blockTime || 0);
  if (parsed.blockTime && age > FEE_RESUME_WINDOW_SEC) {
    throw new ProviderError('That fee payment is older than 48 hours. Start a new launch (new fee required).', 400, 'FEE_TX_EXPIRED');
  }
  return feeTx;
}

/** Scan recent account signatures for a matching platform fee (recovery when local state was lost). */
export async function findRecentSolanaLaunchFee(connection: Connection, account: string): Promise<string | null> {
  const owner = new PublicKey(account);
  const treasury = PROTOCOL.treasurySol;
  let sigs;
  try {
    sigs = await connection.getSignaturesForAddress(owner, { limit: 40 });
  } catch {
    return null;
  }
  const cutoff = Date.now() / 1000 - FEE_RESUME_WINDOW_SEC;
  for (const s of sigs) {
    if (s.err) continue;
    if (s.blockTime && s.blockTime < cutoff) break;
    try {
      const parsed = await connection.getParsedTransaction(s.signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed',
      });
      if (!parsed || parsed.meta?.err) continue;
      const ixs = [
        ...parsed.transaction.message.instructions,
        ...(parsed.meta?.innerInstructions || []).flatMap((inner) => inner.instructions),
      ];
      if (ixs.some((ix) => isFeeTransferIx(ix as Parameters<typeof isFeeTransferIx>[0], account, treasury))) {
        return s.signature;
      }
    } catch {
      /* keep scanning */
    }
  }
  return null;
}

export async function buildSolanaLaunch(input: {
  name: string;
  symbol: string;
  description?: string;
  uri?: string;
  account: string;
  /** SOL to spend as the creator's first buy on the curve. 0 = create only. */
  initialBuySol?: string;
  /**
   * When set, skip building/charging the platform fee and only return LaunchLab mint txs.
   * Fee signature is verified on-chain (or discovered from recent account history when `discoverFee` is true).
   */
  feeTx?: string;
  discoverFee?: boolean;
}) {
  const owner = new PublicKey(input.account);
  const treasury = new PublicKey(PROTOCOL.treasurySol);
  const connection = new Connection(PUBLIC_RPC.solana!, 'confirmed');

  const encoded: string[] = [];
  let mint = '';
  let feeTxUsed: string | null = null;
  let skipFee = false;

  if (input.feeTx) {
    feeTxUsed = await verifySolanaLaunchFee(connection, input.account, input.feeTx);
    skipFee = true;
  } else if (input.discoverFee) {
    feeTxUsed = await findRecentSolanaLaunchFee(connection, input.account);
    if (feeTxUsed) skipFee = true;
  }

  try {
    const { Raydium, TxVersion, LAUNCHPAD_PROGRAM, getPdaLaunchpadConfigId, LaunchpadConfig } = await import(
      '@raydium-io/raydium-sdk-v2'
    );
    const pair = Keypair.generate();
    mint = pair.publicKey.toBase58();
    const raydium = await Raydium.load({
      connection,
      owner,
      disableLoadToken: true,
      disableFeatureCheck: true,
    });
    const programId = LAUNCHPAD_PROGRAM;
    const configId = getPdaLaunchpadConfigId(programId, NATIVE_MINT, 0, 0).publicKey;
    const configData = await connection.getAccountInfo(configId);
    if (!configData) throw new Error('LaunchLab config missing on this RPC.');
    const configInfo = LaunchpadConfig.decode(configData.data);
    const uri = input.uri && input.uri.startsWith('https://') ? input.uri : `${PROTOCOL.siteUrl}/metadata.json`;
    const platformId = getLiftPlatformId();
    if (!platformId) throw new Error('LIFT LaunchLab platform id is not configured.');

    const buySol = Number(input.initialBuySol || '0');
    if (buySol > 100) throw new Error('Initial buy is capped at 100 SOL per launch.');
    const buyLamports = BigInt(Math.round(buySol * LAMPORTS_PER_SOL));
    const createOnly = buyLamports === 0n;

    const { transactions } = await raydium.launchpad.createLaunchpad({
      programId,
      mintA: pair.publicKey,
      decimals: 6,
      name: input.name.slice(0, 32),
      symbol: input.symbol.slice(0, 10),
      migrateType: MIGRATE_TYPE,
      uri,
      configId,
      configInfo,
      platformId: new PublicKey(platformId),
      buyAmount: new BN(buyLamports.toString()),
      createOnly,
      extraSigners: [pair],
      txVersion: TxVersion.V0,
      slippage: new BN(100),
      computeBudgetConfig: {
        units: createOnly ? 300_000 : 600_000,
        microLamports: 50_000,
      },
    });

    for (const tx of transactions) {
      const vtx = tx as VersionedTransaction;
      try {
        vtx.sign([pair]);
      } catch {
        /* already signed by Raydium builder */
      }
      await assertSimulates(connection, vtx, 'LaunchLab mint');
      encoded.push(encodeTx(vtx));
    }
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(
      error instanceof Error ? `LaunchLab build failed: ${error.message}` : 'LaunchLab build failed.',
      503,
      'LAUNCHLAB_BUILD_FAILED',
    );
  }

  if (!skipFee) {
    // Build fee tx last so its blockhash stays fresh after the slower LaunchLab build.
    const feeTx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: owner, toPubkey: treasury, lamports: Number(FEE_LAMPORTS) }),
    );
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    feeTx.recentBlockhash = blockhash;
    feeTx.feePayer = owner;
    await assertSimulates(connection, feeTx, 'Platform fee');
    encoded.unshift(encodeTx(feeTx));
  }

  return {
    mint,
    feeLamports: FEE_LAMPORTS.toString(),
    treasury: PROTOCOL.treasurySol,
    encoded,
    /** Index of first LaunchLab mint tx in `encoded` (0 when fee skipped). */
    mintStartIndex: skipFee ? 0 : 1,
    feeSkipped: skipFee,
    feeTx: feeTxUsed,
    initialBuySol: input.initialBuySol || '0',
    migrateType: MIGRATE_TYPE,
    // Phantom Blowfish warnings eat wall-clock; keep mint usable longer than 60s.
    expiresAt: Date.now() + 180_000,
  };
}

export function buildFeeOnlySolana(account: string) {
  return { treasury: PROTOCOL.treasurySol, lamports: FEE_LAMPORTS.toString(), account };
}

/** Build a LaunchLab curve buy/sell quote for a freshly launched mint (before Jupiter indexes). */
export async function buildLaunchLabTradeQuote(request: {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  slippageBps: number;
  account: string;
}) {
  const owner = new PublicKey(request.account);
  const connection = new Connection(PUBLIC_RPC.solana!, 'confirmed');
  const sol = NATIVE_MINT.toBase58();
  const isBuy = request.tokenIn === sol || request.tokenIn === PROTOCOL.solMint;
  const isSell = request.tokenOut === sol || request.tokenOut === PROTOCOL.solMint;
  if (!isBuy && !isSell) {
    throw new ProviderError('LaunchLab trades are SOL-quoted only.', 400, 'LAUNCHLAB_SOL_ONLY');
  }
  const mint = isBuy ? request.tokenOut : request.tokenIn;
  if (!mint || mint === sol) throw new ProviderError('Token mint is required.', 400);

  const amountNum = Number(request.amountIn);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    throw new ProviderError('Enter a positive amount.', 400);
  }

  try {
    const { Raydium, TxVersion, LAUNCHPAD_PROGRAM, getPdaLaunchpadPoolId } = await import('@raydium-io/raydium-sdk-v2');
    const mintPk = new PublicKey(mint);
    const poolId = getPdaLaunchpadPoolId(LAUNCHPAD_PROGRAM, mintPk, NATIVE_MINT).publicKey;
    const [poolAccount, supply] = await Promise.all([
      connection.getAccountInfo(poolId),
      connection.getTokenSupply(mintPk),
    ]);
    if (!poolAccount) {
      throw new ProviderError(
        'LaunchLab curve is not ready yet. Trading opens once the pool account is on-chain.',
        404,
        'CURVE_NOT_READY',
      );
    }
    const decimals = supply.value.decimals;

    const raydium = await Raydium.load({
      connection,
      owner,
      disableLoadToken: true,
      disableFeatureCheck: true,
    });
    const slip = new BN(Math.max(1, Math.min(500, request.slippageBps)));
    const budget = { units: 400_000, microLamports: 50_000 };

    if (isBuy) {
      const buyLamports = BigInt(Math.round(amountNum * LAMPORTS_PER_SOL));
      if (buyLamports <= 0n) throw new ProviderError('Enter a positive SOL amount.', 400);
      const built = await raydium.launchpad.buyToken({
        mintA: mintPk,
        buyAmount: new BN(buyLamports.toString()),
        slippage: slip,
        txVersion: TxVersion.V0,
        computeBudgetConfig: budget,
      });
      // Despite their names, Raydium's Decimal values are raw integer units.
      const outRaw = built.extInfo?.decimalOutAmount?.toFixed?.(0) ?? built.extInfo?.decimalOutAmount?.toString?.() ?? '0';
      const minRaw = built.extInfo?.minDecimalOutAmount?.toFixed?.(0) ?? built.extInfo?.minDecimalOutAmount?.toString?.() ?? outRaw;
      const out = formatLaunchLabTokenAmount(outRaw, decimals);
      const min = formatLaunchLabTokenAmount(minRaw, decimals);
      const expiresAt = Date.now() + 45_000;
      return {
        chain: 'solana' as const,
        source: 'launchlab',
        observedAt: new Date().toISOString(),
        expiresAt,
        amountIn: request.amountIn,
        amountOut: String(out),
        minimumOut: String(min),
        tokenIn: PROTOCOL.solMint,
        tokenOut: mint,
        fee: PROTOCOL.tradeFeeBps / 10_000,
        transaction: {
          chain: 'solana' as const,
          chainId: 0,
          data: '0x' as const,
          value: '0',
          description: 'Buy on LaunchLab curve',
          expiresAt,
          encoded: Buffer.from(built.transaction.serialize()).toString('base64'),
        },
      };
    }

    const sellRaw = parseLaunchLabTokenAmount(request.amountIn, decimals);
    const ownerAccounts = await connection.getParsedTokenAccountsByOwner(owner, { mint: mintPk }, 'confirmed');
    const availableRaw = ownerAccounts.value.reduce((total, item) => {
      const data = item.account.data;
      if (!('parsed' in data)) return total;
      const raw = data.parsed?.info?.tokenAmount?.amount;
      return typeof raw === 'string' ? total + BigInt(raw) : total;
    }, 0n);
    assertSufficientLaunchLabBalance(availableRaw, sellRaw);
    const built = await raydium.launchpad.sellToken({
      mintA: mintPk,
      sellAmount: new BN(sellRaw.toString()),
      slippage: slip,
      txVersion: TxVersion.V0,
      computeBudgetConfig: budget,
      associatedOnly: false,
    });
    // sellToken returns the minimum output after slippage, not the gross quote.
    const minLamports = BigInt(built.extInfo.outAmount.toString());
    const outLamports = estimateBeforeSlippage(minLamports, request.slippageBps);
    const out = formatLaunchLabTokenAmount(outLamports, 9);
    const min = formatLaunchLabTokenAmount(minLamports, 9);
    const expiresAt = Date.now() + 45_000;
    return {
      chain: 'solana' as const,
      source: 'launchlab',
      observedAt: new Date().toISOString(),
      expiresAt,
      amountIn: request.amountIn,
      amountOut: String(out),
      minimumOut: String(min),
      tokenIn: mint,
      tokenOut: PROTOCOL.solMint,
      fee: PROTOCOL.tradeFeeBps / 10_000,
      transaction: {
        chain: 'solana' as const,
        chainId: 0,
        data: '0x' as const,
        value: '0',
        description: 'Sell on LaunchLab curve',
        expiresAt,
        encoded: Buffer.from(built.transaction.serialize()).toString('base64'),
      },
    };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(
      error instanceof Error ? `LaunchLab trade failed: ${error.message}` : 'LaunchLab trade failed.',
      503,
      'LAUNCHLAB_TRADE_FAILED',
    );
  }
}
