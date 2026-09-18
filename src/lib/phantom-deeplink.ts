/**
 * Phantom native deeplinks (NOT ul/browse).
 * Connect / signTransaction with HTTPS redirect_link so mobile Safari/Chrome
 * open Phantom briefly for approval, then return to this dapp origin.
 */
'use client';

import nacl from 'tweetnacl';
import bs58 from 'bs58';

const DAPP_KEY = 'still.phantom.dappKey.v1';
const SESSION_KEY = 'still.phantom.session.v1';
const PENDING_SIGN_KEY = 'still.phantom.pendingSign.v1';
const SIGN_RESULT_KEY = 'still.phantom.signResult.v1';
const CLUSTER = 'mainnet-beta';
const LAUNCHES_KEY = 'still.launches.v1';
const ACTIVE_CREATE_KEY = 'still.create.active.v1';

export const PHANTOM_REDIRECT_ERROR = 'PHANTOM_REDIRECT';

export type PhantomDeeplinkSession = {
  publicKey: string;
  session: string;
  sharedSecret: number[];
  dappPublicKey: string;
};

export type PendingSign = {
  encoded: string;
  description?: string;
  at: number;
};

type SignResult = {
  encoded: string;
  signedEncoded: string;
  signature?: string;
  at: number;
};

function bytesToArr(u: Uint8Array) {
  return Array.from(u);
}

function arrToBytes(a: number[]) {
  return Uint8Array.from(a);
}

function getBs58() {
  const mod = bs58 as unknown as {
    encode?: (b: Uint8Array) => string;
    decode?: (s: string) => Uint8Array;
    default?: { encode: (b: Uint8Array) => string; decode: (s: string) => Uint8Array };
  };
  if (typeof mod.encode === 'function' && typeof mod.decode === 'function') {
    return { encode: mod.encode, decode: mod.decode };
  }
  return mod.default!;
}

function loadOrCreateDappKey(): nacl.BoxKeyPair {
  try {
    const raw = localStorage.getItem(DAPP_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { publicKey: number[]; secretKey: number[] };
      if (parsed?.publicKey?.length === 32 && parsed?.secretKey?.length === 64) {
        return { publicKey: arrToBytes(parsed.publicKey), secretKey: arrToBytes(parsed.secretKey) };
      }
    }
  } catch {
    /* recreate */
  }
  const kp = nacl.box.keyPair();
  localStorage.setItem(
    DAPP_KEY,
    JSON.stringify({ publicKey: bytesToArr(kp.publicKey), secretKey: bytesToArr(kp.secretKey) }),
  );
  return kp;
}

export function loadPhantomSession(): PhantomDeeplinkSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as PhantomDeeplinkSession;
    if (!s?.publicKey || !s?.session || !s?.sharedSecret?.length) return null;
    return s;
  } catch {
    return null;
  }
}

export function clearPhantomSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(PENDING_SIGN_KEY);
    localStorage.removeItem(SIGN_RESULT_KEY);
    localStorage.removeItem('still.wallet.ui.v1');
    sessionStorage.removeItem(PENDING_SIGN_KEY);
    try {
      window.dispatchEvent(new Event('liftpad-wallet'));
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore */
  }
}

function saveSession(s: PhantomDeeplinkSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  // Mirror into UI key so header/Portfolio can display even if React state lags.
  try {
    localStorage.setItem('still.wallet.ui.v1', JSON.stringify({ address: s.publicKey, kind: 'solana' }));
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new Event('liftpad-wallet'));
  } catch {
    /* ignore */
  }
}

function decryptPayload(data: string, nonce: string, sharedSecret: Uint8Array) {
  const b58 = getBs58();
  const opened = nacl.box.open.after(b58.decode(data), b58.decode(nonce), sharedSecret);
  if (!opened) throw new Error('Could not decrypt Phantom response.');
  return JSON.parse(new TextDecoder().decode(opened)) as Record<string, unknown>;
}

function encryptPayload(payload: unknown, sharedSecret: Uint8Array): [Uint8Array, Uint8Array] {
  const nonce = nacl.randomBytes(24);
  const encrypted = nacl.box.after(new TextEncoder().encode(JSON.stringify(payload)), nonce, sharedSecret);
  return [nonce, encrypted];
}

function isIpv4Host(host: string) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
}

export function phantomAppOrigin() {
  const { hostname, protocol } = window.location;
  if (isIpv4Host(hostname)) return `https://${hostname}.nip.io`;
  if (protocol === 'http:' && hostname.endsWith('.nip.io')) return `https://${hostname}`;
  return window.location.origin;
}

function phantomHref(href = window.location.href) {
  const from = window.location.origin;
  const to = phantomAppOrigin();
  return from === to ? href : href.replace(from, to);
}

function cleanRedirectBase() {
  const url = new URL(phantomHref());
  for (const key of [
    'phantom_encryption_public_key',
    'data',
    'nonce',
    'errorCode',
    'errorMessage',
    'phantom_return',
    'connect',
    'wallet',
  ]) {
    url.searchParams.delete(key);
  }
  url.searchParams.set('phantom_return', '1');
  return url.toString();
}

function buildUl(path: 'connect' | 'signTransaction', params: URLSearchParams) {
  return `https://phantom.app/ul/v1/${path}?${params.toString()}`;
}

export function hasPhantomReturnParams(search = typeof window !== 'undefined' ? window.location.search : '') {
  const p = new URLSearchParams(search);
  return Boolean(p.get('errorCode') || (p.get('data') && p.get('nonce')) || p.get('phantom_return'));
}

export function stripPhantomReturnFromUrl() {
  const url = new URL(window.location.href);
  let changed = false;
  for (const key of ['phantom_encryption_public_key', 'data', 'nonce', 'errorCode', 'errorMessage', 'phantom_return']) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (changed) {
    const next = `${url.pathname}${url.searchParams.toString() ? `?${url.searchParams}` : ''}${url.hash}`;
    window.history.replaceState({}, '', next);
  }
}

export function loadPendingSign(): PendingSign | null {
  try {
    const raw = sessionStorage.getItem(PENDING_SIGN_KEY) || localStorage.getItem(PENDING_SIGN_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingSign;
  } catch {
    return null;
  }
}

export function clearPendingSign() {
  try {
    localStorage.removeItem(PENDING_SIGN_KEY);
    sessionStorage.removeItem(PENDING_SIGN_KEY);
  } catch {
    /* ignore */
  }
}

/** Patch Create draft after a deeplink fee/mint signature lands. */
export function applySignatureToActiveDraft(signature: string, description?: string) {
  try {
    const active = JSON.parse(localStorage.getItem(ACTIVE_CREATE_KEY) || 'null') as { id?: string } | null;
    const raw = localStorage.getItem(LAUNCHES_KEY);
    if (!active?.id || !raw) return;
    const list = JSON.parse(raw) as Array<Record<string, unknown>>;
    if (!Array.isArray(list)) return;
    const idx = list.findIndex((d) => d.id === active.id);
    if (idx < 0) return;
    const draft = { ...list[idx] } as Record<string, unknown>;
    const txs = Array.isArray(draft.transactions) ? [...(draft.transactions as Array<Record<string, unknown>>)] : [];
    const isFee = /platform fee/i.test(description || '');
    const isMint = /LaunchLab mint|follow-up/i.test(description || '');
    if (isFee) {
      draft.stage = 'token';
      draft.feeTx = signature;
      draft.lastError = undefined;
      draft.transactions = [
        { stage: 'fee', hash: signature, status: 'confirmed' },
        ...txs.filter((t) => t.stage !== 'fee'),
      ];
    } else if (isMint) {
      draft.lastError = undefined;
      draft.transactions = [
        ...txs.filter((t) => !(t.stage === 'token' && t.hash === signature)),
        { stage: 'token', hash: signature, status: 'confirmed' },
      ];
      // First mint signature completes the launch when we already know the mint address.
      if (typeof draft.pendingMint === 'string' && draft.pendingMint) {
        draft.stage = 'complete';
        draft.tokenAddress = draft.pendingMint;
      } else {
        draft.stage = 'token';
      }
    }
    draft.updatedAt = new Date().toISOString();
    list[idx] = draft;
    localStorage.setItem(LAUNCHES_KEY, JSON.stringify(list));
    // Best-effort platform registry so /token/[chain]/[pool] resolves without DEX Screener.
    if (draft.stage === 'complete' && typeof draft.tokenAddress === 'string' && draft.tokenAddress) {
      const sessionPk =
        loadPhantomSession()?.publicKey ||
        (typeof draft.owner === 'string' ? draft.owner : '') ||
        '';
      if (sessionPk.length >= 32) {
        void fetch('/api/launch/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: String(draft.id),
            chain: draft.chain,
            name: String(draft.name || 'Launch').slice(0, 32),
            symbol: String(draft.symbol || 'TOKEN').slice(0, 10),
            description: typeof draft.description === 'string' ? draft.description.slice(0, 500) : undefined,
            imageUrl:
              typeof draft.imageUrl === 'string' &&
              (draft.imageUrl.startsWith('https://') || draft.imageUrl.startsWith('data:image/'))
                ? draft.imageUrl
                : undefined,
            tokenAddress: draft.tokenAddress,
            poolAddress: typeof draft.poolAddress === 'string' ? draft.poolAddress : undefined,
            creatorWallet: sessionPk,
            feeTx: typeof draft.feeTx === 'string' ? draft.feeTx : undefined,
            mintTx: signature,
            quoteSymbol: typeof draft.quoteSymbol === 'string' ? draft.quoteSymbol : undefined,
          }),
        }).catch(() => {});
      }
    }
  } catch {
    /* never block wallet return */
  }
}

export function handlePhantomRedirect(): {
  connected?: string;
  signedEncoded?: string;
  pending?: PendingSign;
  error?: string;
} {
  const params = new URLSearchParams(window.location.search);
  const hasData = Boolean(params.get('data') && params.get('nonce'));
  const hasError = Boolean(params.get('errorCode'));
  if (!hasData && !hasError) {
    if (params.get('phantom_return')) {
      stripPhantomReturnFromUrl();
      // Return landed in this tab without encrypted payload — typical when Phantom
      // finished inside its WebView / a different browser context.
      if (!loadPhantomSession()) {
        return {
          error:
            "Phantom didn't return the session to this browser — use WalletConnect connect.",
        };
      }
    }
    return {};
  }

  if (hasError) {
    const msg = params.get('errorMessage') || 'Request was declined in Phantom.';
    clearPendingSign();
    stripPhantomReturnFromUrl();
    return { error: /user reject|denied|cancel/i.test(msg) ? 'Cancelled in Phantom.' : msg };
  }

  const data = params.get('data')!;
  const nonce = params.get('nonce')!;
  const pending = loadPendingSign();
  const phantomPk = params.get('phantom_encryption_public_key');
  const dappKey = loadOrCreateDappKey();
  const b58 = getBs58();

  try {
    if (phantomPk) {
      const sharedSecret = nacl.box.before(b58.decode(phantomPk), dappKey.secretKey);
      const payload = decryptPayload(data, nonce, sharedSecret);
      const pk =
        (typeof payload.public_key === 'string' && payload.public_key) ||
        (typeof payload.publicKey === 'string' && payload.publicKey) ||
        '';
      if (pk && typeof payload.session === 'string') {
        saveSession({
          publicKey: pk,
          session: payload.session,
          sharedSecret: bytesToArr(sharedSecret),
          dappPublicKey: b58.encode(dappKey.publicKey),
        });
        try {
          sessionStorage.setItem('still.wallet.justConnected.v1', pk);
        } catch {
          /* ignore */
        }
        stripPhantomReturnFromUrl();
        return { connected: pk };
      }
    }

    const session = loadPhantomSession();
    if (!session) {
      stripPhantomReturnFromUrl();
      return { error: 'Phantom session missing after redirect. Connect again.' };
    }
    const sharedSecret = arrToBytes(session.sharedSecret);
    const payload = decryptPayload(data, nonce, sharedSecret);
    if (typeof payload.transaction === 'string') {
      const signedBytes = b58.decode(payload.transaction);
      let binary = '';
      for (let i = 0; i < signedBytes.length; i++) binary += String.fromCharCode(signedBytes[i]);
      const signedEncoded = btoa(binary);
      if (pending?.encoded) {
        localStorage.setItem(
          SIGN_RESULT_KEY,
          JSON.stringify({ encoded: pending.encoded, signedEncoded, at: Date.now() } satisfies SignResult),
        );
      }
      stripPhantomReturnFromUrl();
      return { signedEncoded, pending: pending || undefined };
    }

    stripPhantomReturnFromUrl();
    return { error: 'Unrecognized Phantom response.' };
  } catch (e) {
    stripPhantomReturnFromUrl();
    return { error: e instanceof Error ? e.message : 'Could not read Phantom response.' };
  }
}

export function takeSignResult(encoded: string): { signedEncoded: string; signature?: string } | null {
  try {
    const raw = localStorage.getItem(SIGN_RESULT_KEY);
    if (!raw) return null;
    const result = JSON.parse(raw) as SignResult;
    if (result.encoded !== encoded) return null;
    localStorage.removeItem(SIGN_RESULT_KEY);
    return { signedEncoded: result.signedEncoded, signature: result.signature };
  } catch {
    return null;
  }
}

export function storeSignSignature(encoded: string, signature: string) {
  try {
    const raw = localStorage.getItem(SIGN_RESULT_KEY);
    if (raw) {
      const result = JSON.parse(raw) as SignResult;
      if (result.encoded === encoded) {
        localStorage.setItem(SIGN_RESULT_KEY, JSON.stringify({ ...result, signature, at: Date.now() }));
        return;
      }
    }
    localStorage.setItem(
      SIGN_RESULT_KEY,
      JSON.stringify({ encoded, signedEncoded: '', signature, at: Date.now() } satisfies SignResult),
    );
  } catch {
    /* ignore */
  }
}

export function startPhantomConnect() {
  const dappKey = loadOrCreateDappKey();
  const b58 = getBs58();
  const params = new URLSearchParams({
    app_url: phantomAppOrigin(),
    dapp_encryption_public_key: b58.encode(dappKey.publicKey),
    redirect_link: cleanRedirectBase(),
    cluster: CLUSTER,
  });
  window.location.assign(buildUl('connect', params));
}

export function startPhantomSignTransaction(encoded: string, description?: string) {
  const session = loadPhantomSession();
  if (!session) throw new Error('Connect Phantom first.');
  const dappKey = loadOrCreateDappKey();
  const b58 = getBs58();
  const sharedSecret = arrToBytes(session.sharedSecret);

  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const [nonce, encrypted] = encryptPayload(
    { transaction: b58.encode(bytes), session: session.session },
    sharedSecret,
  );

  const pending: PendingSign = { encoded, description, at: Date.now() };
  try {
    sessionStorage.setItem(PENDING_SIGN_KEY, JSON.stringify(pending));
  } catch {
    /* private mode */
  }
  localStorage.setItem(PENDING_SIGN_KEY, JSON.stringify(pending));

  const params = new URLSearchParams({
    dapp_encryption_public_key: b58.encode(dappKey.publicKey),
    nonce: b58.encode(nonce),
    redirect_link: cleanRedirectBase(),
    payload: b58.encode(encrypted),
  });
  window.location.assign(buildUl('signTransaction', params));
}

export function isPhantomRedirectError(message: string) {
  return message.startsWith(PHANTOM_REDIRECT_ERROR) || /Approve in Phantom|return to this tab/i.test(message);
}
