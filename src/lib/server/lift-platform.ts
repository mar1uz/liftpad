import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import BN from 'bn.js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { PROTOCOL } from '@/lib/protocol';
import { PUBLIC_RPC } from './open-quote';
import { ProviderError } from './errors';

const FILE = join(process.cwd(), 'data/lift-platform.json');
const CPMM_CONFIG = 'D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2';
const FEE_RATE = new BN(2500); // 0.25% with 1e6 = 100%

type Stored = { platformId: string | null; signature: string | null; createdAt: string | null };

function readStored(): Stored {
  if (process.env.LAUNCHLAB_PLATFORM_ID) {
    return { platformId: process.env.LAUNCHLAB_PLATFORM_ID, signature: null, createdAt: null };
  }
  try {
    return JSON.parse(readFileSync(FILE, 'utf8')) as Stored;
  } catch {
    return { platformId: null, signature: null, createdAt: null };
  }
}

export function getLiftPlatformId(): string | undefined {
  return readStored().platformId || undefined;
}

export function platformStatus() {
  const stored = readStored();
  return {
    registered: Boolean(stored.platformId),
    platformId: stored.platformId,
    admin: PROTOCOL.treasurySol,
    feeBps: PROTOCOL.tradeFeeBps,
  };
}

export function saveLiftPlatform(platformId: string, signature: string) {
  mkdirSync(join(process.cwd(), 'data'), { recursive: true });
  const stored: Stored = { platformId, signature, createdAt: new Date().toISOString() };
  writeFileSync(FILE, JSON.stringify(stored, null, 2));
  return stored;
}

async function encodeTx(
  connection: Connection,
  feePayer: PublicKey,
  tx: { serialize: (opts?: { requireAllSignatures?: boolean; verifySignatures?: boolean }) => Uint8Array },
): Promise<string> {
  if (tx instanceof Transaction) {
    if (!tx.recentBlockhash) {
      const { blockhash } = await connection.getLatestBlockhash('finalized');
      tx.recentBlockhash = blockhash;
    }
    tx.feePayer = feePayer;
  }
  try {
    return Buffer.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })).toString('base64');
  } catch {
    return Buffer.from(tx.serialize()).toString('base64');
  }
}

export async function buildCreatePlatform(account: string) {
  if (account !== PROTOCOL.treasurySol) {
    throw new ProviderError('Only the LIFT Solana treasury can register the LaunchLab platform.', 403, 'NOT_PLATFORM_ADMIN');
  }
  if (getLiftPlatformId()) {
    throw new ProviderError('The LIFT LaunchLab platform is already registered.', 409, 'PLATFORM_EXISTS');
  }
  const owner = new PublicKey(account);
  const connection = new Connection(PUBLIC_RPC.solana!, 'confirmed');
  const { Raydium, TxVersion, LAUNCHPAD_PROGRAM } = await import('@raydium-io/raydium-sdk-v2');
  const raydium = await Raydium.load({ connection, owner, disableLoadToken: true, disableFeatureCheck: true });
  const { transaction, extInfo } = await raydium.launchpad.createPlatformConfig({
    programId: LAUNCHPAD_PROGRAM,
    platformAdmin: owner,
    platformClaimFeeWallet: owner,
    platformLockNftWallet: owner,
    platformVestingWallet: PublicKey.default,
    cpConfigId: new PublicKey(CPMM_CONFIG),
    transferFeeExtensionAuth: owner,
    creatorFeeRate: new BN(0),
    feeRate: FEE_RATE,
    migrateCpLockNftScale: {
      platformScale: new BN(1_000_000),
      creatorScale: new BN(0),
      burnScale: new BN(0),
    },
    name: 'LIFT',
    web: 'https://liftpad.xyz',
    img: 'https://liftpad.xyz/mark.png',
    txVersion: TxVersion.LEGACY,
  });
  const platformId = (extInfo as { platformId?: PublicKey }).platformId?.toBase58();
  if (!platformId) throw new ProviderError('LaunchLab did not return a platform id.', 503);
  return {
    platformId,
    encoded: await encodeTx(connection, owner, transaction as { serialize: () => Uint8Array }),
    expiresAt: Date.now() + 5 * 60_000,
  };
}
