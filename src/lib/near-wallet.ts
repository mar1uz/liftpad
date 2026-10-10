'use client';
/**
 * NEAR wallet connection (MyNearWallet, Meteor, HERE) via @near-wallet-selector.
 * Kept separate from the EVM / Solana providers: its own selector + modal, its own session.
 * Connect always signs out first and opens the chooser, so the user approves every time.
 */
import type { WalletSelector } from '@near-wallet-selector/core';
import type { WalletSelectorModal } from '@near-wallet-selector/modal-ui-js';
import { nearConfig, type NearTransaction } from './near';

let selectorPromise: Promise<{ selector: WalletSelector; modal: WalletSelectorModal }> | null = null;

async function load() {
  if (typeof window === 'undefined') throw new Error('NEAR wallet is only available in the browser.');
  if (!selectorPromise) {
    selectorPromise = (async () => {
      const cfg = nearConfig();
      const [{ setupWalletSelector }, { setupModal }, { setupMyNearWallet }, { setupMeteorWallet }, { setupHereWallet }] = await Promise.all([
        import('@near-wallet-selector/core'),
        import('@near-wallet-selector/modal-ui-js'),
        import('@near-wallet-selector/my-near-wallet'),
        import('@near-wallet-selector/meteor-wallet'),
        import('@near-wallet-selector/here-wallet'),
      ]);
      const selector = await setupWalletSelector({
        network: cfg.networkId,
        modules: [setupMyNearWallet(), setupMeteorWallet(), setupHereWallet()],
      });
      const modal = setupModal(selector, {
        contractId: cfg.factory,
        theme: 'dark',
        description: 'Connect a NEAR account to launch or trade on liftpad. Every transaction still needs your approval.',
      });
      return { selector, modal };
    })().catch((e) => {
      selectorPromise = null;
      throw e;
    });
  }
  return selectorPromise;
}

function activeAccount(selector: WalletSelector): string {
  const accounts = selector.store.getState().accounts;
  return (accounts.find((a) => a.active) || accounts[0])?.accountId || '';
}

async function signOutQuietly(selector: WalletSelector) {
  if (!selector.isSignedIn()) return;
  try {
    const wallet = await selector.wallet();
    await wallet.signOut();
  } catch {
    /* ignore: stale session */
  }
}

/** Fresh connect: drop any previous NEAR session, show the chooser, resolve on sign-in. */
export async function connectNear(): Promise<string> {
  const { selector, modal } = await load();
  await signOutQuietly(selector);
  return new Promise<string>((resolve, reject) => {
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      signedIn.remove();
      hidden.remove();
      fn();
    };
    const signedIn = selector.on('signedIn', (event) => {
      const id = event.accounts[0]?.accountId;
      if (id) finish(() => resolve(id));
    });
    const hidden = modal.on('onHide', ({ hideReason }) => {
      if (hideReason === 'wallet-navigation') return; // wallet opened; wait for signedIn
      // Give the store a moment: some wallets close the modal just before emitting signedIn.
      window.setTimeout(() => {
        const id = activeAccount(selector);
        finish(() => (id ? resolve(id) : reject(new Error('Connection was cancelled in the wallet.'))));
      }, 400);
    });
    modal.show();
  });
}

/** Restore only if the selector still has this exact account signed in. */
export async function restoreNearAccount(expected: string): Promise<string> {
  try {
    const { selector } = await load();
    const id = activeAccount(selector);
    return id && id === expected ? id : '';
  } catch {
    return '';
  }
}

export async function disconnectNear() {
  if (!selectorPromise) return;
  try {
    const { selector } = await selectorPromise;
    await signOutQuietly(selector);
  } catch {
    /* ignore */
  }
}

type Outcome = { transaction?: { hash?: string }; transaction_outcome?: { id?: string }; status?: unknown };

/** Sign + send in order. Returns one hash per transaction (best effort per wallet). */
export async function sendNearTransactions(account: string, txs: NearTransaction[]): Promise<{ hashes: string[]; outcomes: unknown[] }> {
  const { selector } = await load();
  const signedIn = activeAccount(selector);
  if (!signedIn) throw new Error('Connect your NEAR wallet first.');
  if (signedIn !== account) throw new Error('NEAR account changed. Reconnect before continuing.');
  const { actionCreators } = await import('@near-wallet-selector/core');
  const wallet = await selector.wallet();
  const transactions = txs.map((tx) => ({
    signerId: account,
    receiverId: tx.receiverId,
    actions: tx.actions.map((a) =>
      a.type === 'Transfer'
        ? actionCreators.transfer(BigInt(a.deposit))
        : actionCreators.functionCall(a.methodName, a.args, BigInt(a.gas), BigInt(a.deposit)),
    ),
  }));
  let outcomes: unknown[];
  try {
    outcomes = ((await wallet.signAndSendTransactions({ transactions })) || []) as unknown[];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err || '');
    if (/reject|cancel|denied|closed|User/i.test(msg)) throw new Error('Signing was cancelled in your NEAR wallet.');
    throw new Error(msg || 'The NEAR wallet could not send these transactions.');
  }
  const hashes = outcomes.map((o) => {
    const x = o as Outcome;
    return x?.transaction?.hash || x?.transaction_outcome?.id || '';
  });
  const failed = outcomes.find((o) => {
    const st = (o as Outcome)?.status;
    return Boolean(st && typeof st === 'object' && 'Failure' in (st as object));
  });
  if (failed) {
    const err = new Error('A NEAR transaction failed on-chain. Nothing was double-charged — tap Resume to continue.');
    (err as Error & { hashes?: string[] }).hashes = hashes;
    throw err;
  }
  return { hashes, outcomes };
}
