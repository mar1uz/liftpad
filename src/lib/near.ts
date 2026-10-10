/**
 * NEAR network constants shared by client + server.
 *
 * Launch model (no LIFT contracts):
 *   - Token: public NEP-141 token factory (`tkn.near` on mainnet, `tokenfactory.testnet` on testnet).
 *     `create_token` deploys `<symbol>.<factory>` with the whole supply minted to the creator.
 *   - Pool: Ref Finance simple pool `<token>/wNEAR`, created and funded from the creator's wallet,
 *     so the LP shares (the pool position) belong to the creator.
 * Every id is overridable with NEXT_PUBLIC_NEAR_* env so a different / own factory can be plugged in.
 */
export type NearNetworkId = 'mainnet' | 'testnet';

export function nearNetworkId(): NearNetworkId {
  return process.env.NEXT_PUBLIC_NEAR_NETWORK === 'testnet' ? 'testnet' : 'mainnet';
}

const DEFAULTS: Record<NearNetworkId, { rpc: string; factory: string; ref: string; wrap: string; explorer: string; refApp: string }> = {
  mainnet: {
    // rpc.mainnet.near.org is heavily rate-limited (429); FastNEAR is what wallet-selector uses too.
    rpc: 'https://free.rpc.fastnear.com',
    factory: 'tkn.near',
    ref: 'v2.ref-finance.near',
    wrap: 'wrap.near',
    explorer: 'https://nearblocks.io',
    refApp: 'https://app.ref.finance',
  },
  testnet: {
    rpc: 'https://test.rpc.fastnear.com',
    factory: 'tokenfactory.testnet',
    ref: 'ref-finance-101.testnet',
    wrap: 'wrap.testnet',
    explorer: 'https://testnet.nearblocks.io',
    refApp: 'https://testnet.ref-finance.com',
  },
};

export function nearConfig() {
  const id = nearNetworkId();
  const d = DEFAULTS[id];
  return {
    networkId: id,
    rpc: d.rpc,
    factory: process.env.NEXT_PUBLIC_NEAR_TOKEN_FACTORY || d.factory,
    ref: process.env.NEXT_PUBLIC_NEAR_REF_EXCHANGE || d.ref,
    wrap: process.env.NEXT_PUBLIC_NEAR_WRAP || d.wrap,
    explorer: d.explorer,
    refApp: d.refApp,
    /**
     * LIFT NEAR treasury, per network (a .near account cannot receive testnet funds).
     * Mainnet defaults to mar1uz.near (verified on-chain 2026-10-11). Testnet has no default:
     * set NEXT_PUBLIC_NEAR_TREASURY_TESTNET once the account exists; the server also checks it on-chain.
     */
    treasury: id === 'testnet'
      ? (process.env.NEXT_PUBLIC_NEAR_TREASURY_TESTNET || '').trim().toLowerCase()
      : (process.env.NEXT_PUBLIC_NEAR_TREASURY || 'mar1uz.near').trim().toLowerCase(),
    /** Launch fee in NEAR (pending product approval; HANDOFF journal). */
    launchFee: process.env.NEXT_PUBLIC_NEAR_LAUNCH_FEE || '0.1',
  };
}

/** Tokens created by the factory use 18 decimals; wNEAR uses 24. */
export const NEAR_TOKEN_DECIMALS = 18;
export const NEAR_DECIMALS = 24;
/** Ref simple-pool fee in bps (0.30%). */
export const NEAR_POOL_FEE = 30;

const ACCOUNT_RE = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
export function isNearAccountId(value: string | undefined | null): value is string {
  return typeof value === 'string' && value.length >= 2 && value.length <= 64 && ACCOUNT_RE.test(value);
}

/** Factory token id = lowercase symbol; must be [a-z0-9] and form a valid sub-account. */
export function nearTokenAccountId(symbol: string, factory = nearConfig().factory) {
  const id = symbol.trim().toLowerCase();
  if (!/^[a-z0-9]{1,32}$/.test(id)) throw new Error('NEAR token symbols may only use letters and digits.');
  const account = `${id}.${factory}`;
  if (!isNearAccountId(account)) throw new Error('This symbol does not form a valid NEAR account.');
  return account;
}

/** Pool ids follow the DEX Screener NEAR pair format (`refv1-<id>`). */
export function nearPoolAddress(poolId: number | string) {
  return `refv1-${poolId}`;
}
export function nearPoolId(address: string): number | undefined {
  const m = /^refv1-(\d{1,10})$/.exec(address.trim());
  return m ? Number(m[1]) : undefined;
}

/** Decimal string → integer base-unit string, without float rounding. */
export function toBaseUnits(amount: string, decimals: number): string {
  const value = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error('Invalid amount.');
  const [whole, frac = ''] = value.split('.');
  if (frac.length > decimals) throw new Error(`At most ${decimals} decimals.`);
  const raw = BigInt(whole + frac.padEnd(decimals, '0'));
  return raw.toString();
}
export function fromBaseUnits(raw: string | bigint, decimals: number, precision = 6): string {
  const v = BigInt(raw);
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = (v % base).toString().padStart(decimals, '0').slice(0, precision).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}
export const yoctoNear = (near: string) => toBaseUnits(near, NEAR_DECIMALS);

/** One NEAR transaction as the wallet signs it (wallet-selector shape, JSON-safe). */
export type NearAction =
  | { type: 'Transfer'; deposit: string }
  | { type: 'FunctionCall'; methodName: string; args: Record<string, unknown>; gas: string; deposit: string };
export type NearTransaction = { receiverId: string; actions: NearAction[] };

export const TGAS = (n: number) => (BigInt(n) * 10n ** 12n).toString();
export const ONE_YOCTO = '1';
