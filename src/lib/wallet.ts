'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ChainKey, PreparedTransaction } from './types';
import {
  collectInjectedEvmProviders,
  describeEvmWalletError,
  eip6963InjectedProviders,
  findEvmProviderForAddress,
  listenForEip6963Providers,
  preferredInjectedEvmProvider,
  type EvmProvider,
} from './evm-provider';
import {
  applySignatureToActiveDraft,
  clearPendingSign,
  clearPhantomSession,
  handlePhantomRedirect,
  hasPhantomReturnParams,
  loadPhantomSession,
  PHANTOM_REDIRECT_ERROR,
  startPhantomConnect,
  startPhantomSignTransaction,
  storeSignSignature,
  takeSignResult,
} from './phantom-deeplink';
import {
  connectEvmWalletConnect,
  connectSolanaWalletConnect,
  disconnectWalletConnect,
  ensureSolanaAppKit,
  getOrLoadWalletConnectEvmProvider,
  getWalletConnectEvmProvider,
  getWalletConnectSolanaProvider,
  hasWalletConnectProjectId,
  restoreEvmWalletConnectAddress,
  restoreWalletConnectAddress,
  signWithWalletConnect,
} from './wc-solana';

type SolanaProvider = {
  isPhantom?: boolean;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString: () => string } }>;
  disconnect?: () => Promise<void>;
  publicKey?: { toString: () => string };
  signMessage?: (message: Uint8Array, display?: string) => Promise<unknown>;
  signTransaction?: (tx: unknown) => Promise<{ serialize: () => Uint8Array }>;
  signAndSendTransaction?: (tx: unknown) => Promise<{ signature: string } | string>;
};
declare global {
  interface Window {
    // Must match @reown/appkit Window.ethereum augmentation (Record). Narrow via asEvmProvider.
    ethereum?: Record<string, unknown>;
    solana?: SolanaProvider;
    phantom?: { solana?: SolanaProvider; ethereum?: EvmProvider };
  }
}

function isMobile() {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function solanaProvider(): SolanaProvider | undefined {
  if (typeof window === 'undefined') return undefined;
  const phantom = window.phantom?.solana;
  if (phantom && typeof phantom.connect === 'function') return phantom;
  const injected = window.solana;
  if (injected && typeof injected.connect === 'function') return injected;
  return undefined;
}

let activeEvmProvider: EvmProvider | null = null;

function injectedEvmProviders(): EvmProvider[] {
  if (typeof window === 'undefined') return [];
  listenForEip6963Providers();
  return collectInjectedEvmProviders(window.ethereum, window.phantom?.ethereum, eip6963InjectedProviders());
}

function evmProvider(): EvmProvider | undefined {
  if (activeEvmProvider) return activeEvmProvider;
  return preferredInjectedEvmProvider(injectedEvmProviders());
}

async function connectedEvmProvider(address: string): Promise<EvmProvider | undefined> {
  if (!address.startsWith('0x')) return undefined;
  const walletConnect =
    getWalletConnectEvmProvider() ||
    (hasWalletConnectProjectId() ? await getOrLoadWalletConnectEvmProvider() : null);
  const provider = await findEvmProviderForAddress(
    [activeEvmProvider, walletConnect, ...injectedEvmProviders()],
    address,
  );
  if (provider) activeEvmProvider = provider;
  return provider;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor<T>(read: () => T | undefined, ms = 1600): Promise<T | undefined> {
  const start = Date.now();
  let value = read();
  while (!value && Date.now() - start < ms) {
    await sleep(80);
    value = read();
  }
  return value;
}

function isIpv4Host(host: string) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
}

/** Phantom cannot load a raw IP (NXDOMAIN). Use nip.io + HTTPS. */
function dappOrigin() {
  const { hostname } = window.location;
  if (isIpv4Host(hostname)) return `https://${hostname}.nip.io`;
  if (window.location.protocol === 'http:' && hostname.endsWith('.nip.io')) return `https://${hostname}`;
  return window.location.origin;
}

function dappHref(href = window.location.href) {
  const from = window.location.origin;
  const to = dappOrigin();
  return from === to ? href : href.replace(from, to);
}

function metamaskDappUrl() {
  const url = new URL(dappHref());
  return `https://metamask.app.link/dapp/${url.host}${url.pathname}${url.search}`;
}

/** Optional sync flush (e.g. Create draft → localStorage) before leaving the page. */
let beforeExternalOpen: (() => void) | null = null;

export function onBeforeWalletExternal(fn: () => void) {
  beforeExternalOpen = fn;
  return () => {
    if (beforeExternalOpen === fn) beforeExternalOpen = null;
  };
}

function flushBeforeExternal() {
  try {
    beforeExternalOpen?.();
  } catch {
    /* draft flush must never block connect */
  }
}

function isPhantomInjected() {
  if (typeof window === 'undefined') return false;
  return Boolean(solanaProvider()?.isPhantom || window.phantom?.solana);
}

function needsSecureOrigin() {
  const { hostname, protocol } = window.location;
  return isIpv4Host(hostname) || (protocol === 'http:' && hostname.endsWith('.nip.io'));
}

function secureWalletUrl(kind?: 'evm' | 'solana') {
  const url = new URL(dappHref());
  url.searchParams.set('connect', '1');
  if (kind) url.searchParams.set('wallet', kind);
  return url.toString();
}

const MOBILE_EVM_HINT =
  'No Ethereum wallet is available in this mobile browser. Open Launchpad from inside your wallet app, or use desktop. Your Create draft is saved on this device.';

const PHANTOM_REDIRECT_HINT =
  'Opens Phantom to approve, then returns here. Approve in the Phantom app — you will come back to this tab.';

const WALLETCONNECT_HINT =
  'WalletConnect keeps the session in this Chrome tab. Approve in Phantom when it opens, then return here.';

const WALLETCONNECT_EVM_HINT =
  'WalletConnect keeps the session in this Chrome tab. Approve in your wallet when it opens, then return here.';

const WALLETCONNECT_MISSING_HINT =
  'WalletConnect project id is not configured yet. Falling back to Phantom deeplink (session may land in Phantom WebView).';

async function submitSignedSolana(signedEncoded: string) {
  const submitted = await fetch('/api/solana/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ encoded: signedEncoded }),
  });
  const data = (await submitted.json()) as { signature?: string; error?: string };
  if (!submitted.ok || !data.signature) throw new Error(data.error || 'Could not send the signed transaction.');
  return data.signature;
}

const UI_WALLET_KEY = 'still.wallet.ui.v1';
const USER_DISCONNECTED_KEY = 'still.wallet.userDisconnected.v1';
const JUST_CONNECTED_KEY = 'still.wallet.justConnected.v1';

function isUserDisconnected(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(USER_DISCONNECTED_KEY) === '1';
  } catch {
    return false;
  }
}

function setUserDisconnected() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(USER_DISCONNECTED_KEY, '1');
  } catch {
    /* ignore */
  }
}

function clearUserDisconnected() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(USER_DISCONNECTED_KEY);
  } catch {
    /* ignore */
  }
}


async function proveSolanaReconnect(address: string) {
  const message = `Liftpad reconnect\n${address}\n${Date.now()}`;
  const bytes = new TextEncoder().encode(message);
  const injected = solanaProvider();
  const wc = getWalletConnectSolanaProvider() as SolanaProvider | null;
  const provider =
    (injected?.signMessage ? injected : null) ||
    (wc?.signMessage ? wc : null) ||
    injected ||
    wc;
  if (!provider?.signMessage) {
    throw new Error('Approve the connection in your Solana wallet (sign unavailable).');
  }
  try {
    await provider.signMessage(bytes, 'utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err || '');
    if (/user rejected|denied|cancel/i.test(msg)) {
      throw new Error('Connection was cancelled in the wallet.');
    }
    throw new Error(msg || 'Approve the reconnect signature in your wallet.');
  }
}

async function proveEvmReconnect(address: string) {
  const message = `Liftpad reconnect\n${address}\n${Date.now()}`;
  const hex =
    '0x' +
    Array.from(new TextEncoder().encode(message))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  const provider = await connectedEvmProvider(address);
  if (!provider?.request) {
    throw new Error('Approve the connection in your Ethereum wallet.');
  }
  try {
    await provider.request({ method: 'personal_sign', params: [hex, address] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err || '');
    if (/user rejected|denied|cancel/i.test(msg)) {
      throw new Error('Connection was cancelled in the wallet.');
    }
    try {
      await provider.request({ method: 'personal_sign', params: [message, address] });
    } catch (err2) {
      const msg2 = err2 instanceof Error ? err2.message : String(err2 || '');
      if (/user rejected|denied|cancel/i.test(msg2)) {
        throw new Error('Connection was cancelled in the wallet.');
      }
      throw new Error(msg2 || msg || 'Approve the reconnect signature in your wallet.');
    }
  }
}

function readUiWallet(): { address: string; kind: 'evm' | 'solana' } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(UI_WALLET_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { address?: string; kind?: string };
    if (!parsed?.address || typeof parsed.address !== 'string') return null;
    const kind = parsed.kind === 'solana' ? 'solana' : 'evm';
    return { address: parsed.address, kind };
  } catch {
    return null;
  }
}

/** Public: UI mirror written on every successful connect. */
export function loadUiWalletMirror() {
  return readUiWallet();
}

/**
 * Address for header / Portfolio CTA. Prefers live React state, then Phantom
 * session, then UI mirror — so the button cannot say "Connect wallet" when a
 * session exists (even if setState lagged after deeplink return / remount).
 */
export function resolveWalletDisplayAddress(liveAddress?: string | null): string {
  if (liveAddress) return liveAddress;
  if (typeof window === 'undefined') return '';
  // Explicit disconnect must keep the header on "Connect wallet" until the user picks again.
  if (isUserDisconnected()) return '';
  // Prefer the last chooser result (kind-aware). Do not let a stale Phantom
  // Solana session override an EVM connection in the header.
  const ui = readUiWallet();
  if (ui?.address) return ui.address;
  return loadPhantomSession()?.publicKey || '';
}

function subscribeWalletStorage(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {};
  const tick = () => onStoreChange();
  window.addEventListener('storage', tick);
  window.addEventListener('liftpad-wallet', tick);
  window.addEventListener('focus', tick);
  document.addEventListener('visibilitychange', tick);
  const id = window.setInterval(tick, 500);
  return () => {
    window.removeEventListener('storage', tick);
    window.removeEventListener('liftpad-wallet', tick);
    window.removeEventListener('focus', tick);
    document.removeEventListener('visibilitychange', tick);
    window.clearInterval(id);
  };
}

function getWalletStorageSnapshot(): string {
  return resolveWalletDisplayAddress('');
}

function getWalletStorageServerSnapshot(): string {
  return '';
}

function mirrorUiWallet(address: string, kind: 'evm' | 'solana') {
  if (typeof window === 'undefined') return;
  try {
    if (!address) {
      localStorage.removeItem(UI_WALLET_KEY);
      return;
    }
    localStorage.setItem(UI_WALLET_KEY, JSON.stringify({ address, kind }));
  } catch {
    /* ignore */
  }
}

function emitWalletChange() {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event('liftpad-wallet'));
  } catch {
    /* ignore */
  }
}

function initialWalletFromStorage(): { address: string; kind: 'evm' | 'solana'; deeplink: boolean } {
  if (typeof window === 'undefined') return { address: '', kind: 'evm', deeplink: false };
  if (isUserDisconnected()) return { address: '', kind: 'evm', deeplink: false };
  const sessionPk = loadPhantomSession()?.publicKey || '';
  if (sessionPk) return { address: sessionPk, kind: 'solana', deeplink: true };
  const ui = readUiWallet();
  if (ui?.address) return { address: ui.address, kind: ui.kind, deeplink: ui.kind === 'solana' };
  return { address: '', kind: 'evm', deeplink: false };
}

function applyDeeplinkSession(
  setAddress: (v: string) => void,
  setKind: (v: 'evm' | 'solana') => void,
  setDeeplinkConnected: (v: boolean) => void,
  publicKey?: string | null,
  opts?: { force?: boolean },
) {
  // Skip stale session restore after explicit disconnect (unless force from live redirect/connect).
  if (!opts?.force && !publicKey && isUserDisconnected()) {
    setDeeplinkConnected(false);
    return false;
  }
  const pk = publicKey || loadPhantomSession()?.publicKey || '';
  if (!pk) {
    setDeeplinkConnected(false);
    return false;
  }
  setAddress(pk);
  setKind('solana');
  setDeeplinkConnected(true);
  mirrorUiWallet(pk, 'solana');
  // Do not emit here — saveSession / connect paths emit; emitting would re-enter listeners.
  return true;
}

export function useWallet() {
  const boot = initialWalletFromStorage();
  const [address, setAddress] = useState(() => boot.address);
  const [kind, setKind] = useState<'evm' | 'solana'>(() => boot.kind);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [injected, setInjected] = useState({ solana: false, evm: false });
  const [deeplinkConnected, setDeeplinkConnected] = useState(() => boot.deeplink);

  // Storage-backed address: survives Launchpad remounts and deeplink returns where
  // React state was empty but still.phantom.session.v1 / still.wallet.ui.v1 exist.
  const storedAddress = useSyncExternalStore(
    subscribeWalletStorage,
    getWalletStorageSnapshot,
    getWalletStorageServerSnapshot,
  );
  const displayAddress = address || storedAddress;

  // Keep React address in lockstep with storage whenever storage has a pubkey.
  useEffect(() => {
    listenForEip6963Providers();
    if (!storedAddress || address) return;
    if (isUserDisconnected()) return;
    const session = loadPhantomSession();
    const ui = readUiWallet();
    setAddress(storedAddress);
    if (session?.publicKey === storedAddress) {
      setKind('solana');
      setDeeplinkConnected(true);
      mirrorUiWallet(storedAddress, 'solana');
      return;
    }
    if (ui?.address === storedAddress) {
      setKind(ui.kind);
      setDeeplinkConnected(ui.kind === 'solana');
      if (ui.kind === 'solana') mirrorUiWallet(storedAddress, 'solana');
    }
  }, [storedAddress, address]);

  // Restore deeplink session + handle Phantom redirect return (connect or sign).
  // Redirect parse + address apply run synchronously BEFORE any await / cancelled
  // check so Strict Mode cleanup cannot strip URL params and then skip hydration.
  useEffect(() => {
    let cancelled = false;
    let hydratedFromDeeplink = false;
    let signedEncoded: string | undefined;
    let pendingSign: ReturnType<typeof handlePhantomRedirect>['pending'];

    if (hasPhantomReturnParams()) {
      const result = handlePhantomRedirect();
      if (result.error) {
        setError(result.error);
      } else if (result.connected) {
        // Apply address immediately — never gate on `cancelled` here.
        clearUserDisconnected();
        hydratedFromDeeplink = applyDeeplinkSession(setAddress, setKind, setDeeplinkConnected, result.connected, { force: true });
        setError('');
      } else if (result.signedEncoded) {
        signedEncoded = result.signedEncoded;
        pendingSign = result.pending;
        // Session already exists from prior connect; restore header now.
        clearUserDisconnected();
        hydratedFromDeeplink = applyDeeplinkSession(setAddress, setKind, setDeeplinkConnected, undefined, { force: true });
      }
    }

    // Live Phantom redirect counts as an explicit reconnect — clear the disconnect flag.
    if (hydratedFromDeeplink) {
      clearUserDisconnected();
    }

    const userDisconnected = isUserDisconnected();

    if (!hydratedFromDeeplink && !userDisconnected) {
      hydratedFromDeeplink = applyDeeplinkSession(setAddress, setKind, setDeeplinkConnected);
    }

    (async () => {
      // Restore WalletConnect session (persisted by AppKit in this browser).
      // Skip after explicit disconnect so Connect shows the chooser again.
      if (hasWalletConnectProjectId() && !hydratedFromDeeplink && !userDisconnected) {
        try {
          const ui = readUiWallet();
          // Prefer restoring the kind last shown in the UI mirror.
          if (ui?.kind === 'evm') {
            const wcEvm = await restoreEvmWalletConnectAddress();
            if (!cancelled && wcEvm) {
              await connectedEvmProvider(wcEvm);
              setAddress(wcEvm);
              setKind('evm');
              setDeeplinkConnected(false);
              mirrorUiWallet(wcEvm, 'evm');
              emitWalletChange();
            } else {
              const wcPk = await restoreWalletConnectAddress();
              if (!cancelled && wcPk) {
                setAddress(wcPk);
                setKind('solana');
                setDeeplinkConnected(false);
                mirrorUiWallet(wcPk, 'solana');
                emitWalletChange();
              }
            }
          } else {
            const wcPk = await restoreWalletConnectAddress();
            if (!cancelled && wcPk) {
              setAddress(wcPk);
              setKind('solana');
              setDeeplinkConnected(false);
              mirrorUiWallet(wcPk, 'solana');
              emitWalletChange();
            } else {
              const wcEvm = await restoreEvmWalletConnectAddress();
              if (!cancelled && wcEvm) {
                await connectedEvmProvider(wcEvm);
                setAddress(wcEvm);
                setKind('evm');
                setDeeplinkConnected(false);
                mirrorUiWallet(wcEvm, 'evm');
                emitWalletChange();
              }
            }
          }
        } catch {
          /* WC optional at boot */
        }
      }

      if (signedEncoded) {
        try {
          setBusy(true);
          const signature = await submitSignedSolana(signedEncoded);
          if (cancelled) return;
          if (pendingSign?.encoded) storeSignSignature(pendingSign.encoded, signature);
          applySignatureToActiveDraft(signature, pendingSign?.description);
          clearPendingSign();
          clearUserDisconnected();
          applyDeeplinkSession(setAddress, setKind, setDeeplinkConnected, undefined, { force: true });
          setError('');
        } catch (e) {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : 'Could not broadcast the signed transaction.');
          }
        } finally {
          if (!cancelled) setBusy(false);
        }
      }

      if (cancelled) return;
      if (userDisconnected) return;

      // If the UI was restored as EVM, bind that exact account to its provider
      // and do not let a trusted Phantom Solana extension overwrite it at boot.
      const restoredUi = readUiWallet();
      if (restoredUi?.kind === 'evm' && (await connectedEvmProvider(restoredUi.address))) {
        if (cancelled) return;
        return;
      }

      const sol = await waitFor(solanaProvider, 900);
      if (cancelled) return;
      if (sol) {
        try {
          const result = await sol.connect({ onlyIfTrusted: true });
          if (cancelled) return;
          if (result?.publicKey) {
            const pk = result.publicKey.toString();
            setAddress(pk);
            setKind('solana');
            mirrorUiWallet(pk, 'solana');
            emitWalletChange();
            return;
          }
        } catch {
          /* not yet approved */
        }
      }
      // Prefer an existing deeplink session over probing empty EVM accounts.
      if (loadPhantomSession()?.publicKey) {
        applyDeeplinkSession(setAddress, setKind, setDeeplinkConnected);
        return;
      }
      const evm = evmProvider();
      if (!evm) return;
      try {
        const accounts = (await evm.request({ method: 'eth_accounts' })) as string[];
        if (cancelled || !accounts[0]) return;
        activeEvmProvider = evm;
        setAddress(accounts[0]);
        setKind('evm');
        mirrorUiWallet(accounts[0], 'evm');
        emitWalletChange();
      } catch {
        /* ignore */
      }
    })();
    const subscribedEvmProvider = evmProvider();
    const change = (...args: unknown[]) => {
      // Ignore another extension's account events once a specific wallet was selected.
      if (activeEvmProvider && subscribedEvmProvider !== activeEvmProvider) return;
      const accounts = args[0] as string[];
      const next = accounts?.[0] || '';
      if (next) {
        if (isUserDisconnected()) return;
        if (subscribedEvmProvider) activeEvmProvider = subscribedEvmProvider;
        setAddress(next);
        setKind('evm');
        mirrorUiWallet(next, 'evm');
        emitWalletChange();
        return;
      }
      // Empty EVM accounts must not wipe a Solana deeplink session / header address.
      if (isUserDisconnected()) {
        setAddress('');
        mirrorUiWallet('', 'evm');
        emitWalletChange();
        return;
      }
      const session = loadPhantomSession();
      if (session?.publicKey) {
        applyDeeplinkSession(setAddress, setKind, setDeeplinkConnected, session.publicKey);
        return;
      }
      setAddress('');
      mirrorUiWallet('', 'evm');
      emitWalletChange();
    };
    const onLiftpadWallet = () => {
      if (isUserDisconnected()) {
        setAddress('');
        setDeeplinkConnected(false);
        return;
      }
      applyDeeplinkSession(setAddress, setKind, setDeeplinkConnected);
      const ui = readUiWallet();
      if (!loadPhantomSession()?.publicKey && ui?.address) {
        setAddress(ui.address);
        setKind(ui.kind);
        setDeeplinkConnected(ui.kind === 'solana');
      }
    };
    subscribedEvmProvider?.on?.('accountsChanged', change);
    window.addEventListener('liftpad-wallet', onLiftpadWallet);
    return () => {
      cancelled = true;
      subscribedEvmProvider?.removeListener?.('accountsChanged', change);
      window.removeEventListener('liftpad-wallet', onLiftpadWallet);
    };
  }, []);

  const addressRef = useRef(address);
  addressRef.current = address;

  useEffect(() => {
    const refresh = () => {
      setInjected({ solana: Boolean(solanaProvider()), evm: Boolean(evmProvider()) });
      if (isUserDisconnected()) {
        setDeeplinkConnected(false);
        return;
      }
      const sessionPk = loadPhantomSession()?.publicKey || '';
      const ui = readUiWallet();
      setDeeplinkConnected(Boolean(sessionPk) || Boolean(ui?.address && ui.kind === 'solana'));
      // Backfill header address when React state lost the deeplink pubkey but the
      // localStorage session / UI mirror is still live (redirect parse / remount races).
      // Never let a stale Solana deeplink session clobber an EVM UI mirror (or empty chooser).
      if (!addressRef.current && ui?.address) {
        setAddress(ui.address);
        setKind(ui.kind);
      } else if (sessionPk && !addressRef.current && (!ui || ui.kind === 'solana')) {
        setAddress(sessionPk);
        setKind('solana');
        mirrorUiWallet(sessionPk, 'solana');
      }
    };
    refresh();
    const id = window.setInterval(refresh, 600);
    window.addEventListener('phantom#initialized', refresh);
    window.addEventListener('liftpad-wallet', refresh);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('phantom#initialized', refresh);
      window.removeEventListener('liftpad-wallet', refresh);
    };
  }, []);

  async function connect(type: 'evm' | 'solana') {
    setBusy(true);
    setError('');
    // Keep disconnect intent until THIS connect succeeds — clearing early lets
    // storage/onlyIfTrusted races rehydrate the old wallet mid-prompt.
    const wasDisconnected = isUserDisconnected();
    try {
      if (needsSecureOrigin()) {
        // Same Launchpad site on HTTPS nip.io so an injected provider can attach — not Phantom browse.
        flushBeforeExternal();
        window.location.assign(secureWalletUrl(type));
        return false;
      }
      if (type === 'solana') {
        // Always drop EVM / other-chain leftovers before a Solana chooser connect.
        clearPhantomSession();
        try {
          const evm = evmProvider();
          if (evm) {
            try {
              await evm.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] });
            } catch {
              /* ignore */
            }
          }
        } catch {
          /* ignore */
        }
        try {
          await disconnectWalletConnect();
        } catch {
          /* ignore */
        }
        activeEvmProvider = null;
        mirrorUiWallet('', 'solana');
        setAddress('');
        setKind('solana');

        // After Disconnect (or when WC is available), prefer AppKit Connect UI so the
        // user must pick / approve — injected Phantom often reconnects silently.
        // Desktop only: on mobile, AppKit after hard disconnect often throws "address not found".
        const preferAppKit = wasDisconnected && hasWalletConnectProjectId() && !isMobile();
        if (preferAppKit || (isMobile() && hasWalletConnectProjectId() && !solanaProvider())) {
          if (wasDisconnected) {
            clearPhantomSession();
            try {
              await solanaProvider()?.disconnect?.();
            } catch {
              /* ignore */
            }
          } else if (isMobile()) {
            const existing = loadPhantomSession();
            if (existing?.publicKey) {
              clearUserDisconnected();
              setAddress(existing.publicKey);
              setKind('solana');
              setDeeplinkConnected(true);
              mirrorUiWallet(existing.publicKey, 'solana');
              emitWalletChange();
              return true;
            }
            const wcExisting = await restoreWalletConnectAddress();
            if (wcExisting) {
              clearUserDisconnected();
              setAddress(wcExisting);
              setKind('solana');
              setDeeplinkConnected(false);
              mirrorUiWallet(wcExisting, 'solana');
              emitWalletChange();
              return true;
            }
          }
          flushBeforeExternal();
          setError(WALLETCONNECT_HINT);
          const pk = await connectSolanaWalletConnect();
          if (!pk) throw new Error('WalletConnect did not return an account.');
          if (pk.startsWith('0x')) throw new Error('Solana WalletConnect returned an EVM address.');
          if (wasDisconnected) {
            setError('Approve the reconnect signature in your wallet…');
            await proveSolanaReconnect(pk);
          }
          clearUserDisconnected();
          setAddress(pk);
          setKind('solana');
          setDeeplinkConnected(false);
          mirrorUiWallet(pk, 'solana');
          emitWalletChange();
          setError('');
          return true;
        }

        // After Disconnect, never use injected Phantom — it silent-reconnects trusted sites.
        if (wasDisconnected && hasWalletConnectProjectId()) {
          flushBeforeExternal();
          setError(WALLETCONNECT_HINT);
          const pkForced = await connectSolanaWalletConnect();
          if (!pkForced) throw new Error('WalletConnect did not return an account.');
          if (pkForced.startsWith('0x')) throw new Error('Solana WalletConnect returned an EVM address.');
          if (wasDisconnected) {
            setError('Approve the reconnect signature in your wallet…');
            await proveSolanaReconnect(pkForced);
          }
          clearUserDisconnected();
          setAddress(pkForced);
          setKind('solana');
          setDeeplinkConnected(false);
          mirrorUiWallet(pkForced, 'solana');
          emitWalletChange();
          setError('');
          return true;
        }

        // Prefer in-page provider (extension or Phantom in-app browser).
        const provider = (await waitFor(solanaProvider, 2800)) || solanaProvider();
        if (provider) {
          try {
            await provider.disconnect?.();
          } catch {
            /* best-effort before reconnect */
          }
          if (wasDisconnected) {
            await new Promise((r) => window.setTimeout(r, 120));
            try {
              await provider.disconnect?.();
            } catch {
              /* ignore */
            }
          }
          const pk =
            (await provider.connect({ onlyIfTrusted: false }))?.publicKey?.toString() ||
            (await provider.connect())?.publicKey?.toString() ||
            '';
          if (!pk) throw new Error('Phantom did not return an account.');
          if (pk.startsWith('0x')) throw new Error('Solana wallet returned an EVM address. Pick Phantom (Solana).');
          if (wasDisconnected) {
            setError('Approve the reconnect signature in your wallet…');
            await proveSolanaReconnect(pk);
          }
          clearUserDisconnected();
          setAddress(pk);
          setKind('solana');
          setDeeplinkConnected(false);
          mirrorUiWallet(pk, 'solana');
          emitWalletChange();
          setInjected((s) => ({ ...s, solana: true }));
          return true;
        }
        if (isMobile()) {
          flushBeforeExternal();
          setError(WALLETCONNECT_MISSING_HINT);
          startPhantomConnect();
          return false;
        }
        throw new Error('Install the Phantom extension, or open this page from the Phantom app.');
      } else {
        // EVM path must never reuse a Solana/Phantom/WC session as the connected address.
        clearPhantomSession();
        setDeeplinkConnected(false);
        try {
          await solanaProvider()?.disconnect?.();
        } catch {
          /* ignore */
        }
        try {
          await disconnectWalletConnect();
        } catch {
          /* ignore */
        }
        activeEvmProvider = null;
        setAddress('');
        setKind('evm');
        mirrorUiWallet('', 'evm');

        const injectedPreferred = preferredInjectedEvmProvider(
          injectedEvmProviders().filter((item) => !item.isPhantom),
        );

        // After Disconnect on desktop, force AppKit only when MetaMask is not injected.
        // The WalletConnect chooser includes Phantom, which intercepts Base launches.
        if (wasDisconnected && hasWalletConnectProjectId() && !isMobile() && !injectedPreferred) {
          flushBeforeExternal();
          setError(WALLETCONNECT_EVM_HINT);
          const evmAddress = await connectEvmWalletConnect();
          if (!evmAddress?.startsWith('0x')) {
            throw new Error('WalletConnect did not return an EVM address.');
          }
          activeEvmProvider = getWalletConnectEvmProvider();
          if (wasDisconnected) {
            setError('Approve the reconnect signature in your wallet…');
            await proveEvmReconnect(evmAddress);
          }
          clearUserDisconnected();
          clearPhantomSession();
          setAddress(evmAddress);
          setKind('evm');
          setDeeplinkConnected(false);
          mirrorUiWallet(evmAddress, 'evm');
          emitWalletChange();
          setError('');
          return true;
        }

        // After Disconnect, force AppKit only if no non-Phantom injected wallet exists.
        if (wasDisconnected && hasWalletConnectProjectId() && !injectedPreferred) {
          flushBeforeExternal();
          setError(WALLETCONNECT_EVM_HINT);
          const evmForced = await connectEvmWalletConnect();
          if (!evmForced?.startsWith('0x')) {
            throw new Error('WalletConnect did not return an EVM address.');
          }
          activeEvmProvider = getWalletConnectEvmProvider();
          if (wasDisconnected) {
            setError('Approve the reconnect signature in your wallet…');
            await proveEvmReconnect(evmForced);
          }
          clearUserDisconnected();
          clearPhantomSession();
          setAddress(evmForced);
          setKind('evm');
          setDeeplinkConnected(false);
          mirrorUiWallet(evmForced, 'evm');
          emitWalletChange();
          setError('');
          return true;
        }

        const provider = (await waitFor(evmProvider, 2800)) || evmProvider();
        if (provider) {
          if (wasDisconnected) {
            try {
              await provider.request({
                method: 'wallet_revokePermissions',
                params: [{ eth_accounts: {} }],
              });
            } catch {
              /* not supported on every wallet */
            }
          }
          try {
            await provider.request({
              method: 'wallet_requestPermissions',
              params: [{ eth_accounts: {} }],
            });
          } catch (permErr) {
            const msg = permErr instanceof Error ? permErr.message : String(permErr);
            if (/user rejected|denied|cancel/i.test(msg)) throw permErr;
          }
          const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
          if (!accounts[0]) throw new Error('No wallet account was selected.');
          const evmAddress = accounts[0];
          if (!evmAddress.startsWith('0x')) {
            throw new Error('Ethereum wallet did not return an EVM address.');
          }
          activeEvmProvider = provider;
          if (wasDisconnected) {
            setError('Approve the reconnect signature in your wallet…');
            await proveEvmReconnect(evmAddress);
          }
          clearUserDisconnected();
          clearPhantomSession();
          setAddress(evmAddress);
          setKind('evm');
          setDeeplinkConnected(false);
          mirrorUiWallet(evmAddress, 'evm');
          emitWalletChange();
          setInjected((s) => ({ ...s, evm: true }));
          return true;
        }
        if (isMobile()) {
          if (!wasDisconnected) {
            const wcExisting = await restoreEvmWalletConnectAddress();
            if (wcExisting) {
              await connectedEvmProvider(wcExisting);
              clearUserDisconnected();
              setAddress(wcExisting);
              setKind('evm');
              setDeeplinkConnected(false);
              mirrorUiWallet(wcExisting, 'evm');
              emitWalletChange();
              return true;
            }
          }
          if (hasWalletConnectProjectId()) {
            flushBeforeExternal();
            setError(WALLETCONNECT_EVM_HINT);
            const evmAddress = await connectEvmWalletConnect();
            if (!evmAddress?.startsWith('0x')) {
              throw new Error('WalletConnect did not return an EVM address.');
            }
            activeEvmProvider = getWalletConnectEvmProvider();
            if (wasDisconnected) {
              setError('Approve the reconnect signature in your wallet…');
              await proveEvmReconnect(evmAddress);
            }
            clearUserDisconnected();
            setAddress(evmAddress);
            setKind('evm');
            setDeeplinkConnected(false);
            mirrorUiWallet(evmAddress, 'evm');
            emitWalletChange();
            setError('');
            return true;
          }
          throw new Error(MOBILE_EVM_HINT);
        }
        throw new Error('Install Phantom or MetaMask, or open this page from your wallet app.');
      }
    } catch (e) {
      // Failed chooser connect: stay disconnected so mount cannot silent-rehydrate.
      if (!addressRef.current) {
        setUserDisconnected();
        setAddress('');
        mirrorUiWallet('', 'evm');
      }
      const message = e instanceof Error ? e.message : 'Wallet connection was declined.';
      if (/user rejected|denied|cancel/i.test(message)) {
        setError('Connection was cancelled in the wallet.');
      } else if (/address not found/i.test(message)) {
        setError('Wallet session expired. Tap Connect again and approve in your wallet.');
      } else {
        setError(message);
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function send(tx: PreparedTransaction) {
    if (tx.expiresAt < Date.now()) throw new Error('This quote has expired. Request a new quote.');
    if (tx.encoded) {
      if (kind !== 'solana' || !address) throw new Error('Connect Phantom first.');

      // Deeplink sign return may have left a matching signed payload.
      const cached = takeSignResult(tx.encoded);
      if (cached?.signature) return cached.signature;
      if (cached?.signedEncoded) return submitSignedSolana(cached.signedEncoded);

      const provider = solanaProvider();
      if (provider && typeof provider.signTransaction === 'function') {
        const { VersionedTransaction, Transaction } = await import('@solana/web3.js');
        const bytes = Uint8Array.from(atob(tx.encoded), (c) => c.charCodeAt(0));
        let built: unknown;
        try {
          built = VersionedTransaction.deserialize(bytes);
        } catch {
          built = Transaction.from(bytes);
        }
        let signed: { serialize: () => Uint8Array };
        try {
          signed = await provider.signTransaction(built);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err || '');
          if (/reject|cancel|User rejected|closed/i.test(msg)) {
            throw new Error('Signing was cancelled in Phantom.');
          }
          if (/simulat|malicious|unsafe|blocked/i.test(msg)) {
            throw new Error(
              msg.length > 12
                ? msg
                : 'Phantom could not simulate this transaction. Close the wallet prompt and tap Launch again.',
            );
          }
          throw new Error(msg || 'Phantom could not sign this transaction.');
        }
        const raw = signed.serialize();
        const arr = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
        let binary = '';
        for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
        return submitSignedSolana(btoa(binary));
      }

      // WalletConnect provider (session lives in this tab).
      if (hasWalletConnectProjectId()) {
        try {
          await ensureSolanaAppKit();
          if (getWalletConnectSolanaProvider()?.signTransaction || (await restoreWalletConnectAddress())) {
            const { VersionedTransaction, Transaction } = await import('@solana/web3.js');
            const bytes = Uint8Array.from(atob(tx.encoded), (c) => c.charCodeAt(0));
            let built: unknown;
            try {
              built = VersionedTransaction.deserialize(bytes);
            } catch {
              built = Transaction.from(bytes);
            }
            const raw = await signWithWalletConnect(built);
            const arr = raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayLike<number>);
            let binary = '';
            for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
            return submitSignedSolana(btoa(binary));
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err || '');
          if (/reject|cancel|User rejected|closed/i.test(msg)) {
            throw new Error('Signing was cancelled in Phantom.');
          }
          // Fall through to deeplink only if WC clearly unavailable.
          if (!/not ready|not configured|timed out/i.test(msg)) {
            throw new Error(msg || 'WalletConnect could not sign this transaction.');
          }
        }
      }

      // Secondary: mobile deeplink session (no injected provider / no WC).
      if (loadPhantomSession() && isMobile()) {
        flushBeforeExternal();
        startPhantomSignTransaction(tx.encoded, tx.description);
        throw new Error(`${PHANTOM_REDIRECT_ERROR}: Approve in Phantom — you will return to this tab.`);
      }

      throw new Error('Connect Phantom first.');
    }
    if (kind !== 'evm' || !address) throw new Error('Connect an EVM wallet first.');
    try {
      const provider = await connectedEvmProvider(address);
      if (!provider) {
        throw new Error('The connected EVM wallet is unavailable. Reconnect MetaMask before continuing.');
      }
      if (provider.isPhantom) {
        const metamask = preferredInjectedEvmProvider(injectedEvmProviders().filter((item) => !item.isPhantom));
        if (metamask) {
          throw new Error('Phantom intercepted this EVM transaction. Disconnect, then connect MetaMask — not Phantom.');
        }
      }
      const requested = `0x${tx.chainId.toString(16)}`;
      if ((await provider.request({ method: 'eth_chainId' })) !== requested) {
        try {
          await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: requested }] });
        } catch (err) {
          const code = typeof err === 'object' && err && 'code' in err ? Number((err as { code: number }).code) : 0;
          const meta: Record<number, { chainName: string; rpcUrls: string[]; nativeCurrency: { name: string; symbol: string; decimals: number }; blockExplorerUrls: string[] }> = {
            8453: {
              chainName: 'Base',
              rpcUrls: ['https://mainnet.base.org'],
              nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
              blockExplorerUrls: ['https://basescan.org'],
            },
            4663: {
              chainName: 'Robinhood Chain',
              rpcUrls: ['https://rpc.mainnet.chain.robinhood.com'],
              nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
              blockExplorerUrls: ['https://robinhoodchain.blockscout.com'],
            },
            56: {
              chainName: 'BNB Smart Chain',
              rpcUrls: ['https://bsc-dataseed.binance.org'],
              nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
              blockExplorerUrls: ['https://bscscan.com'],
            },
            999: {
              chainName: 'HyperEVM',
              rpcUrls: ['https://rpc.hyperliquid.xyz/evm'],
              nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 },
              blockExplorerUrls: ['https://hyperevmscan.io'],
            },
            42161: {
              chainName: 'Arbitrum One',
              rpcUrls: ['https://arb1.arbitrum.io/rpc'],
              nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
              blockExplorerUrls: ['https://arbiscan.io'],
            },
            5042: {
              chainName: 'Arc',
              rpcUrls: ['https://rpc.mainnet.arc.io'],
              nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
              blockExplorerUrls: ['https://explorer.arc.io'],
            },
          };
          const add = meta[tx.chainId];
          if ((code === 4902 || code === -32603) && add) {
            await provider.request({
              method: 'wallet_addEthereumChain',
              params: [{ chainId: requested, ...add }],
            });
          } else {
            throw err;
          }
        }
      }
      if ((await provider.request({ method: 'eth_chainId' })) !== requested) throw new Error('The wallet is on the wrong network.');
      const accounts = (await provider.request({ method: 'eth_accounts' })) as string[];
      if (accounts[0]?.toLowerCase() !== address.toLowerCase()) throw new Error('Wallet account changed. Reconnect before continuing.');
      const request: Record<string, string> = {
        from: address,
        data: tx.data,
        value: `0x${BigInt(tx.value).toString(16)}`,
      };
      if (tx.to) request.to = tx.to;
      try {
        const estimated = await provider.request({ method: 'eth_estimateGas', params: [request] }) as string;
        request.gas = `0x${(BigInt(estimated) * 13n / 10n).toString(16)}`;
      } catch {
        /* MetaMask will estimate */
      }
      try {
        const gasPrice = BigInt(await provider.request({ method: 'eth_gasPrice' }) as string);
        if (gasPrice > 0n) {
          const maxFee = gasPrice * 4n;
          const tip = gasPrice > 1_000_000n ? gasPrice / 5n : 1_000_000n;
          request.maxFeePerGas = `0x${maxFee.toString(16)}`;
          request.maxPriorityFeePerGas = `0x${(tip < maxFee ? tip : maxFee / 4n).toString(16)}`;
        }
      } catch {
        /* legacy gasPrice path */
      }
      return (await provider.request({
        method: 'eth_sendTransaction',
        params: [request],
      })) as string;
    } catch (err) {
      throw new Error(describeEvmWalletError(err));
    }
  }

  const solanaReady = injected.solana || deeplinkConnected || Boolean(displayAddress) || (typeof window !== 'undefined' && isPhantomInjected());
  const displayKind: 'evm' | 'solana' = (() => {
    if (address) return kind;
    if (!displayAddress) return kind;
    if (typeof window === 'undefined') return kind;
    if (loadPhantomSession()?.publicKey === displayAddress) return 'solana';
    const ui = readUiWallet();
    if (ui?.address === displayAddress) return ui.kind;
    return kind;
  })();

  return {
    address: displayAddress,
    liveAddress: address,
    displayAddress,
    kind: displayKind,
    error,
    busy,
    injected,
    /** True when Phantom/Solana can connect without a dead-end (injected or mobile deeplink). */
    canConnectInPage: (type: 'evm' | 'solana') =>
      type === 'solana'
        ? solanaReady || isMobile()
        : injected.evm || (isMobile() && hasWalletConnectProjectId()),
    connect,
    send,
    openInMetaMask: () => {
      flushBeforeExternal();
      window.location.assign(metamaskDappUrl());
    },
    isMobile: typeof navigator !== 'undefined' && isMobile(),
    isPhantomBrowser: typeof window !== 'undefined' && isPhantomInjected(),
    usesDeeplink: deeplinkConnected && !injected.solana,
    disconnect: async () => {
      // Block mount / storage / onlyIfTrusted / WC restore until the user picks again.
      setUserDisconnected();
      setAddress('');
      setError('');
      setDeeplinkConnected(false);
      mirrorUiWallet('', 'evm');
      clearPhantomSession();
      try {
        sessionStorage.removeItem(JUST_CONNECTED_KEY);
      } catch {
        /* ignore */
      }
      emitWalletChange();
      try {
        await solanaProvider()?.disconnect?.();
      } catch {
        /* ignore */
      }
      try {
        const evm = addressRef.current.startsWith('0x')
          ? await connectedEvmProvider(addressRef.current)
          : activeEvmProvider;
        // Best-effort: some injected providers expose wallet_revokePermissions.
        if (evm) {
          try {
            await evm.request({
              method: 'wallet_revokePermissions',
              params: [{ eth_accounts: {} }],
            });
          } catch {
            /* not supported */
          }
        }
      } catch {
        /* ignore */
      }
      try {
        await disconnectWalletConnect();
      } catch {
        /* ignore */
      }
      activeEvmProvider = null;
      // Re-assert cleared UI in case AppKit wrote the mirror during disconnect.
      setAddress('');
      mirrorUiWallet('', 'evm');
      clearPhantomSession();
      emitWalletChange();
    },
    matches: (chain: ChainKey) => (chain === 'solana' ? kind === 'solana' : kind === 'evm'),
  };
}
