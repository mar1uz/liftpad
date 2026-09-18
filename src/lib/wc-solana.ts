/**
 * WalletConnect via Reown AppKit — Solana + EVM in one kit.
 * Keeps the WC session in the SAME browser tab (Chrome) so wallets can
 * approve over deeplink and return without landing the session in a WebView.
 */
'use client';

import type { AppKit } from '@reown/appkit';

type SolanaSignProvider = {
  signTransaction?: (tx: unknown) => Promise<{ serialize: () => Uint8Array } | Uint8Array | unknown>;
  publicKey?: { toString: () => string };
};

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (name: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (name: string, handler: (...args: unknown[]) => void) => void;
};

let kitPromise: Promise<AppKit | null> | null = null;
let solanaProvider: SolanaSignProvider | null = null;
let evmProvider: Eip1193Provider | null = null;

const USER_DISCONNECTED_KEY = 'still.wallet.userDisconnected.v1';
const UI_WALLET_KEY = 'still.wallet.ui.v1';

export function walletConnectProjectId() {
  return (process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '').trim();
}

export function hasWalletConnectProjectId() {
  return walletConnectProjectId().length > 0;
}

function userDisconnected(): boolean {
  try {
    return localStorage.getItem(USER_DISCONNECTED_KEY) === '1';
  } catch {
    return false;
  }
}


/** Wipe AppKit "recent / last connector" so Connect cannot silent-reattach. */
function wipeAppKitChooserState() {
  if (typeof window === 'undefined') return;
  const keys = [
    '@appkit/recent_wallets',
    '@appkit/recent_wallet',
    '@appkit/connections',
    '@appkit/connection_status',
    '@appkit/connected_namespaces',
    '@appkit/wallet_id',
    '@appkit/wallet_name',
    '@appkit/solana_wallet',
    '@appkit/active_namespace',
    '@appkit/active_caip_network_id',
    'WALLETCONNECT_DEEPLINK_CHOICE',
    '@appkit/solana:connected_connector_id',
    '@appkit/eip155:connected_connector_id',
  ];
  for (const key of keys) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
  // Also drop any leftover wc@2 pairing hints that keep the same peer.
  try {
    const remove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (
        k.startsWith('wc@2:') &&
        (k.includes('session') || k.includes('pairing') || k.includes('subscription'))
      ) {
        remove.push(k);
      }
    }
    for (const k of remove) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

function safeGetAddress(kit: AppKit, namespace: 'solana' | 'eip155'): string {
  try {
    return kit.getAddress(namespace) || '';
  } catch {
    return '';
  }
}

async function softDisconnect(kit: AppKit, namespace: 'solana' | 'eip155') {
  const address = safeGetAddress(kit, namespace);
  if (!address) return;
  try {
    await kit.disconnect(namespace);
  } catch {
    /* ignore — including "address not found" */
  }
}

function friendlyWcError(err: unknown, fallback: string): Error {
  const msg = err instanceof Error ? err.message : String(err || '');
  if (/address not found/i.test(msg)) {
    return new Error(
      'Wallet session expired. Tap Connect again and approve in your wallet.',
    );
  }
  if (/user rejected|denied|cancel/i.test(msg)) {
    return new Error('Connection was cancelled in the wallet.');
  }
  return err instanceof Error ? err : new Error(fallback);
}

async function hardResetAppKitSession(kit: AppKit) {
  await softDisconnect(kit, 'solana');
  await softDisconnect(kit, 'eip155');
  try {
    const anyKit = kit as unknown as { disconnect?: (ns?: string) => Promise<void> };
    await anyKit.disconnect?.();
  } catch {
    /* ignore */
  }
  wipeAppKitChooserState();
  solanaProvider = null;
  evmProvider = null;
}

/**
 * Open wallet list. Keep userDisconnected until the user actually picks —
 * clearing it early lets AppKit / mount silent-reattach the previous wallet.
 */
async function openConnect(kit: AppKit, namespace: 'solana' | 'eip155', forceChooser: boolean) {
  try {
    await kit.close();
  } catch {
    /* ignore */
  }
  if (forceChooser) {
    await hardResetAppKitSession(kit);
  }
  try {
    // AllWallets after disconnect — Connect often auto-picks "recent".
    await kit.open({
      view: forceChooser ? 'AllWallets' : 'Connect',
      namespace,
    });
  } catch (err) {
    // Fallback if AllWallets is unavailable in this AppKit build.
    try {
      await kit.open({ view: 'Connect', namespace });
    } catch (err2) {
      throw friendlyWcError(err2, 'Could not open wallet chooser.');
    }
  }
}


function mirrorUi(address: string, kind: 'evm' | 'solana') {
  try {
    if (!address) {
      localStorage.removeItem(UI_WALLET_KEY);
      return;
    }
    localStorage.setItem(UI_WALLET_KEY, JSON.stringify({ address, kind }));
    window.dispatchEvent(new Event('liftpad-wallet'));
  } catch {
    /* ignore */
  }
}

function asEip1193(value: unknown): Eip1193Provider | null {
  if (!value || typeof value !== 'object') return null;
  if (typeof (value as Eip1193Provider).request === 'function') return value as Eip1193Provider;
  return null;
}

async function buildNetworks() {
  const { arbitrum, base, bsc, hyperEvm, solana, defineChain, mainnet } = await import('@reown/appkit/networks');

  const robinhood = defineChain({
    id: 4663,
    chainNamespace: 'eip155' as const,
    caipNetworkId: 'eip155:4663' as const,
    name: 'Robinhood Chain',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: ['https://rpc.mainnet.chain.robinhood.com'] } },
    blockExplorers: {
      default: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' },
    },
  });

  const arc = defineChain({
    id: 5042,
    chainNamespace: 'eip155' as const,
    caipNetworkId: 'eip155:5042' as const,
    name: 'Arc',
    nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
    rpcUrls: { default: { http: ['https://rpc.mainnet.arc.io'] } },
    blockExplorers: { default: { name: 'Arc Explorer', url: 'https://explorer.arc.io' } },
  });

  return [base, bsc, hyperEvm, arbitrum, robinhood, arc, mainnet, solana] as const;
}

/** Shared AppKit singleton (Solana + EVM adapters). */
export async function ensureSolanaAppKit(): Promise<AppKit | null> {
  if (typeof window === 'undefined') return null;
  const projectId = walletConnectProjectId();
  if (!projectId) return null;
  if (kitPromise) return kitPromise;

  kitPromise = (async () => {
    const [{ createAppKit }, { SolanaAdapter }, { EthersAdapter }, networks] = await Promise.all([
      import('@reown/appkit/react'),
      import('@reown/appkit-adapter-solana/react'),
      import('@reown/appkit-adapter-ethers'),
      buildNetworks(),
    ]);

    const kit = createAppKit({
      adapters: [new EthersAdapter(), new SolanaAdapter()],
      networks: [...networks],
      projectId,
      metadata: {
        name: 'liftpad',
        description: 'Discover and launch across seven validated networks',
        url: 'https://liftpad.xyz',
        icons: ['https://liftpad.xyz/favicon.ico'],
      },
      // Liftpad manages reconnect via still.wallet.userDisconnected.v1 —
      // AppKit auto-reconnect makes Disconnect → Connect feel "silent".
      enableReconnect: false,
      features: {
        analytics: false,
        email: false,
        socials: false,
        onramp: false,
        swaps: false,
        receive: false,
        send: false,
      },
      themeMode: 'dark',
    });

    kit.subscribeProviders((state) => {
      const map = state as Record<string, unknown>;
      const nextSol = map?.['solana'] as SolanaSignProvider | undefined;
      if (nextSol) solanaProvider = nextSol;
      const nextEvm =
        asEip1193(map?.['eip155']) ||
        asEip1193(kit.getProvider?.('eip155')) ||
        null;
      if (nextEvm) evmProvider = nextEvm;
    });

    if (!userDisconnected()) {
      try {
        const solAddr = safeGetAddress(kit, 'solana');
        if (solAddr) {
          mirrorUi(solAddr, 'solana');
        } else {
          const evmAddr = safeGetAddress(kit, 'eip155');
          if (evmAddr.startsWith('0x')) {
            mirrorUi(evmAddr, 'evm');
          }
        }
      } catch {
        /* ignore */
      }
    }

    return kit;
  })().catch((err) => {
    kitPromise = null;
    console.error('[liftpad] WalletConnect AppKit init failed', err);
    return null;
  });

  return kitPromise;
}

export const ensureAppKit = ensureSolanaAppKit;

/** Restore a persisted Solana WC session address if AppKit already has one. */
export async function restoreWalletConnectAddress(): Promise<string> {
  if (userDisconnected()) return '';
  const kit = await ensureSolanaAppKit();
  if (!kit) return '';
  return safeGetAddress(kit, 'solana');
}

/** Restore a persisted EVM WC session address if AppKit already has one. */
export async function restoreEvmWalletConnectAddress(): Promise<string> {
  if (userDisconnected()) return '';
  const kit = await ensureSolanaAppKit();
  if (!kit) return '';
  const address = safeGetAddress(kit, 'eip155');
  return address.startsWith('0x') ? address : '';
}

/**
 * Open AppKit Connect (Solana). Phantom approves via WC mobile deeplink;
 * the session stays in this Chrome tab.
 */
export async function connectSolanaWalletConnect(timeoutMs = 180_000): Promise<string> {
  const kit = await ensureSolanaAppKit();
  if (!kit) {
    throw new Error(
      'WalletConnect is not configured yet. Add NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID and redeploy.',
    );
  }

  const forceChooser = userDisconnected();
  // After an explicit app disconnect, never silently reuse a lingering WC session.
  if (forceChooser) {
    await hardResetAppKitSession(kit);
  } else {
    const already = safeGetAddress(kit, 'solana');
    if (already) return already;
  }

  await openConnect(kit, 'solana', forceChooser);

  return await new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsub();
      fn();
    };
    const timer = window.setTimeout(() => {
      finish(() =>
        reject(
          new Error(
            'WalletConnect timed out. Approve in Phantom, then return to this Chrome tab.',
          ),
        ),
      );
    }, timeoutMs);

    const unsub = kit.subscribeAccount((state) => {
      if (state.isConnected && state.address) {
        const address = state.address;
        finish(() => {
          void kit.close().catch(() => {});
          resolve(address);
        });
      }
    }, 'solana');
  });
}

/**
 * Open AppKit Connect (EVM / eip155). MetaMask, Rainbow, Phantom EVM, etc.
 * approve via WalletConnect; session stays in this Chrome tab.
 */
export async function connectEvmWalletConnect(timeoutMs = 180_000): Promise<string> {
  const kit = await ensureSolanaAppKit();
  if (!kit) {
    throw new Error(
      'WalletConnect is not configured yet. Add NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID and redeploy.',
    );
  }

  const forceChooser = userDisconnected();
  if (forceChooser) {
    await hardResetAppKitSession(kit);
  } else {
    const already = safeGetAddress(kit, 'eip155');
    if (already.startsWith('0x')) return already;
  }

  await openConnect(kit, 'eip155', forceChooser);

  return await new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsub();
      fn();
    };
    const timer = window.setTimeout(() => {
      finish(() =>
        reject(
          new Error(
            'WalletConnect timed out. Approve in your wallet app, then return to this Chrome tab.',
          ),
        ),
      );
    }, timeoutMs);

    const unsub = kit.subscribeAccount((state) => {
      if (state.isConnected && state.address?.startsWith('0x')) {
        const address = state.address;
        finish(() => {
          void kit.close().catch(() => {});
          // Capture provider as soon as the session is live.
          const fromKit = asEip1193(kit.getProvider?.('eip155'));
          if (fromKit) evmProvider = fromKit;
          resolve(address);
        });
      }
    }, 'eip155');
  });
}

export function getWalletConnectSolanaProvider(): SolanaSignProvider | null {
  if (solanaProvider?.signTransaction) return solanaProvider;
  return null;
}

export function getWalletConnectEvmProvider(): Eip1193Provider | null {
  if (evmProvider?.request) return evmProvider;
  return null;
}

export async function getOrLoadWalletConnectEvmProvider(): Promise<Eip1193Provider | null> {
  const existing = getWalletConnectEvmProvider();
  if (existing) return existing;
  const kit = await ensureSolanaAppKit();
  if (!kit) return null;
  const fromKit = asEip1193(kit.getProvider?.('eip155'));
  if (fromKit) {
    evmProvider = fromKit;
    return fromKit;
  }
  return null;
}

export async function signWithWalletConnect(tx: unknown): Promise<Uint8Array> {
  const kit = await ensureSolanaAppKit();
  const provider =
    getWalletConnectSolanaProvider() ||
    (kit?.getWalletProvider() as SolanaSignProvider | undefined) ||
    null;
  if (!provider?.signTransaction) {
    throw new Error('WalletConnect provider is not ready. Reconnect Phantom via WalletConnect.');
  }
  const signed = await provider.signTransaction(tx);
  if (signed instanceof Uint8Array) return signed;
  if (signed && typeof signed === 'object' && 'serialize' in signed && typeof (signed as { serialize: () => Uint8Array }).serialize === 'function') {
    const raw = (signed as { serialize: () => Uint8Array }).serialize();
    return raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayLike<number>);
  }
  throw new Error('WalletConnect did not return a signed transaction.');
}

export async function disconnectWalletConnect() {
  try {
    const kit = await ensureSolanaAppKit();
    if (kit) {
      await hardResetAppKitSession(kit);
    } else {
      wipeAppKitChooserState();
      solanaProvider = null;
      evmProvider = null;
    }
  } catch {
    wipeAppKitChooserState();
    solanaProvider = null;
    evmProvider = null;
  }
}
