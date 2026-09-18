'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Plus, Upload, Check, Info, Layers, LoaderCircle, Trash2 } from 'lucide-react';
import { CHAINS, explorerName, explorerUrl } from '@/lib/chains';
import { isEvmLiquidityPending, isResumableLaunchDraft, nextEvmLiquidityAction } from '@/lib/create-session';
import { describeEvmWalletError } from '@/lib/evm-provider';
import { type ChainKey, type LaunchDraft, type PreparedTransaction, type QuoteAsset } from '@/lib/types';
import { PROTOCOL, launchFeeLabel } from '@/lib/protocol';
import { onBeforeWalletExternal } from '@/lib/wallet';
import { isPhantomRedirectError } from '@/lib/phantom-deeplink';
import { ChainIcon, Modal } from './ui';
import { QuotePairPicker } from './quote-pair-picker';
import type { WalletState } from './launchpad';


const ACTIVE_CREATE_KEY = 'still.create.active.v1';

type ActiveCreateSession = { id: string; step: number };

/** Decode legacy #lift= URL-hash handoff if present (no longer written by connect). */
function decodeDraftHandoff(hash: string): { draft: LaunchDraft; step: number } | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw.includes('=') ? raw : '');
  const lift = params.get('lift') || (raw.startsWith('lift=') ? raw.slice(5) : '');
  if (!lift) return null;
  try {
    const bin = atob(lift);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as LaunchDraft & { _s?: number };
    if (!parsed?.id || !parsed?.chain) return null;
    const step = Number.isFinite(parsed._s) ? Math.max(0, Math.min(2, Number(parsed._s))) : 0;
    const { _s: _drop, ...draft } = parsed;
    return { draft: draft as LaunchDraft, step };
  } catch {
    return null;
  }
}

function writeCreateUrl(draftId: string, handoffHash?: string) {
  const params = new URLSearchParams(location.search);
  params.set('draft', draftId);
  const hash = handoffHash ? (handoffHash.startsWith('#') ? handoffHash : `#${handoffHash}`) : '';
  const next = `/create?${params.toString()}${hash}`;
  window.history.replaceState({}, '', next);
}

function clearActiveCreateSession(draftId: string, dropHandoffHash = false) {
  try {
    const active = JSON.parse(localStorage.getItem(ACTIVE_CREATE_KEY) || 'null') as ActiveCreateSession | null;
    if (!active?.id || active.id === draftId) localStorage.removeItem(ACTIVE_CREATE_KEY);
  } catch {
    localStorage.removeItem(ACTIVE_CREATE_KEY);
  }

  const params = new URLSearchParams(location.search);
  if (params.get('draft') === draftId) {
    params.delete('draft');
    params.delete('resume');
  }
  const query = params.toString();
  const hash = dropHandoffHash ? '' : location.hash;
  window.history.replaceState({}, '', `/create${query ? `?${query}` : ''}${hash}`);
}

/** Networks available on Create — only launch-ready chains. */
const CREATE_CHAINS: ChainKey[] = ['solana', 'base', 'bsc', 'hyperevm', 'arbitrum', 'robinhood', 'arc'];

const blankDraft = (): LaunchDraft => ({
  id: (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `lift-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`),
  chain: 'solana',
  name: '',
  symbol: '',
  description: '',
  imageUrl: '',
  quoteAddress: PROTOCOL.solMint,
  quoteSymbol: 'SOL',
  supply: '1000000000',
  tokenLiquidity: '800000000',
  quoteLiquidity: '',
  initialBuy: '0',
  stage: 'draft',
  transactions: [],
  updatedAt: new Date().toISOString(),
});

export function Create({
  drafts,
  saveDraft,
  persistDraft,
  deleteDraft,
  wallet,
  openWallet,
  notify,
}: {
  drafts: LaunchDraft[];
  saveDraft: (d: LaunchDraft) => boolean;
  /** Silent localStorage write used for autosave / pre-redirect flush. */
  persistDraft: (d: LaunchDraft) => boolean;
  deleteDraft: (id: string) => boolean;
  wallet: WalletState;
  openWallet: () => void;
  notify: (m: string) => void;
}) {
  const [draft, setDraft] = useState<LaunchDraft | null>(null);
  const [step, setStep] = useState(0);
  const [assets, setAssets] = useState<QuoteAsset[]>([]);
  const [error, setError] = useState('');
  const [review, setReview] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyHint, setBusyHint] = useState('Waiting for wallet…');
  const [platform, setPlatform] = useState<{ registered: boolean; platformId: string | null; admin: string } | null>(null);
  const draftRef = useRef<LaunchDraft | null>(null);
  const stepRef = useRef(0);
  const hydrated = useRef(false);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  useEffect(() => {
    if (draft) return; // initialize once; autosave owns later edits
    const params = new URLSearchParams(location.search);
    const handoff = decodeDraftHandoff(location.hash || '');
    let session: ActiveCreateSession | null = null;
    try {
      session = JSON.parse(localStorage.getItem(ACTIVE_CREATE_KEY) || 'null') as ActiveCreateSession | null;
    } catch {
      session = null;
    }
    let list = drafts;
    try {
      const stored = JSON.parse(localStorage.getItem('still.launches.v1') || '[]') as LaunchDraft[];
      if (Array.isArray(stored) && stored.length) list = stored;
    } catch {
      /* ignore */
    }
    const wantedId = params.get('draft') || handoff?.draft.id || session?.id || null;
    const saved = wantedId ? list.find((d) => d.id === wantedId) : undefined;
    const handoffDraft = isResumableLaunchDraft(handoff?.draft)
      ? (isEvmLiquidityPending(handoff.draft) ? { ...handoff.draft, stage: 'liquidity' as const } : handoff.draft)
      : undefined;
    const liquidityDraft = isEvmLiquidityPending(saved) ? { ...saved, stage: 'liquidity' as const } : undefined;
    const savedDraft = liquidityDraft || (isResumableLaunchDraft(saved) ? saved : undefined);
    // Prefer a resumable URL hash handoff (legacy) over localStorage when present.
    const requestedChain = params.get('chain') as ChainKey | null;
    const requested = requestedChain && CREATE_CHAINS.includes(requestedChain) && !wantedId
      ? requestedChain
      : null;
    const next = handoffDraft || savedDraft || (requested === 'arc'
      ? { ...blankDraft(), chain: 'arc' as ChainKey, quoteAddress: '0x3600000000000000000000000000000000000000', quoteSymbol: 'USDC' }
      : blankDraft());
    if (wantedId && !handoffDraft && !savedDraft) {
      clearActiveCreateSession(wantedId, Boolean(handoff));
      session = null;
    }
    const normalized = {
      ...next,
      initialBuy: next.initialBuy ?? '0',
      supply: next.supply || '1000000000',
      tokenLiquidity: next.tokenLiquidity || '800000000',
      quoteLiquidity: next.quoteLiquidity || '',
    };
    const ready = !CREATE_CHAINS.includes(normalized.chain)
      ? {
          ...normalized,
          chain: 'solana' as ChainKey,
          quoteAddress: PROTOCOL.solMint,
          quoteSymbol: 'SOL',
        }
      : normalized;
    setDraft(ready);
    if (ready.lastError) setError(ready.lastError);
    if (liquidityDraft && liquidityDraft.id === ready.id) {
      const amountsReady = Number(liquidityDraft.tokenLiquidity) > 0 && Number(liquidityDraft.quoteLiquidity) > 0;
      setStep(amountsReady ? 2 : 1);
    } else if (handoffDraft && handoffDraft.id === ready.id) {
      setStep(handoff?.step ?? 0);
    } else if (session && ready.id === session.id && Number.isFinite(session.step)) {
      setStep(Math.max(0, Math.min(2, Number(session.step) || 0)));
    }
    // Persist handoff into this browser's localStorage (e.g. Phantom WebView) and drop the hash.
    if (handoffDraft) {
      try {
        persistDraft(ready);
        localStorage.setItem(ACTIVE_CREATE_KEY, JSON.stringify({ id: ready.id, step: handoff?.step ?? 0 } satisfies ActiveCreateSession));
      } catch {
        /* quota */
      }
      writeCreateUrl(ready.id);
    }
    hydrated.current = true;
  }, [draft, drafts, persistDraft]);

  // Autosave draft + wizard step so tab kill / leaving Create does not wipe progress.
  useEffect(() => {
    if (!draft || !hydrated.current || (draft.stage === 'complete' && !isEvmLiquidityPending(draft))) return;
    const id = window.setTimeout(() => {
      persistDraft(draft);
      try {
        localStorage.setItem(ACTIVE_CREATE_KEY, JSON.stringify({ id: draft.id, step } satisfies ActiveCreateSession));
      } catch {
        /* quota */
      }
      if (new URLSearchParams(location.search).get('draft') !== draft.id) {
        writeCreateUrl(draft.id);
      }
    }, 350);
    return () => window.clearTimeout(id);
  }, [draft, step, persistDraft]);

  // Flush draft before any rare same-site redirect (e.g. HTTP IP → HTTPS nip.io).
  useEffect(() => {
    return onBeforeWalletExternal(() => {
      const current = draftRef.current;
      if (!current || (current.stage === 'complete' && !isEvmLiquidityPending(current))) return;
      persistDraft(current);
      try {
        localStorage.setItem(ACTIVE_CREATE_KEY, JSON.stringify({ id: current.id, step: stepRef.current } satisfies ActiveCreateSession));
      } catch {
        /* quota */
      }
      writeCreateUrl(current.id);
    });
  }, [persistDraft]);

  useEffect(() => {
    fetch('/api/registry').then((r) => r.json()).then((d) => setAssets(d.assets || [])).catch(() => {});
    fetch('/api/launch/platform').then((r) => r.json()).then(setPlatform).catch(() => {});
  }, []);

  if (!draft) return <div className="empty-state"><LoaderCircle className="spin" size={22} /></div>;

  const patch = (values: Partial<LaunchDraft>) => setDraft({ ...draft, ...values });
  const eligible = assets.filter((a) => a.chain === draft.chain);
  const exampleAsset = draft.chain === 'robinhood' ? 'NVDA Stock Token' : CHAINS[draft.chain].symbol;
  const solana = draft.chain === 'solana';
  const evmLaunch = draft.chain !== 'solana' && CREATE_CHAINS.includes(draft.chain);
  const canLaunch = solana || evmLaunch;
  const chainAssets = eligible.filter((a) => a.enabled);
  const cryptoQuotes = chainAssets.filter((a) => a.kind === 'crypto');
  const stockQuotes = chainAssets.filter((a) => a.kind === 'stock');
  const selectedQuote = chainAssets.find((a) => a.address === draft.quoteAddress || a.symbol === draft.quoteSymbol);
  const stockPair = selectedQuote?.kind === 'stock';
  const quoteLabel = selectedQuote?.symbol || (solana ? 'SOL' : CHAINS[draft.chain].symbol);
  const pairAssets: QuoteAsset[] = (() => {
    const stocks = solana || draft.chain === 'robinhood' ? stockQuotes : [];
    if (cryptoQuotes.length) return [...cryptoQuotes, ...stocks];
    if (solana) {
      return [{ symbol: 'SOL', address: PROTOCOL.solMint, name: 'Solana', decimals: 9, kind: 'crypto', chain: 'solana', enabled: true } as QuoteAsset, ...stocks];
    }
    return [{
      symbol: CHAINS[draft.chain].symbol,
      address: draft.chain === 'arc' ? '0x3600000000000000000000000000000000000000' : '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      name: draft.chain === 'arc' ? 'USD Coin' : CHAINS[draft.chain].symbol,
      decimals: draft.chain === 'arc' ? 6 : 18,
      kind: 'crypto',
      chain: draft.chain,
      enabled: true,
    } as QuoteAsset, ...stocks];
  })();

  function next() {
    if (!draft) return;
    setError('');
    if (step === 0 && (!draft.name.trim() || !draft.symbol.trim())) {
      setError('Give your token a name and symbol.');
      return;
    }
    if (step === 1 && solana) {
      const buy = Number(draft.initialBuy || '0');
      if (!Number.isFinite(buy) || buy < 0) {
        setError('Initial buy must be zero or a positive SOL amount.');
        return;
      }
      if (buy > 100) {
        setError('Initial buy is capped at 100 SOL.');
        return;
      }
    }
    if (step === 1 && evmLaunch) {
      const tAmt = Number(draft.tokenLiquidity);
      const q = Number(draft.quoteLiquidity);
      const buy = Number(draft.initialBuy || '0');
      const supply = Number(draft.supply);
      if (!Number.isFinite(supply) || supply <= 0) {
        setError('Enter a positive total token supply.');
        return;
      }
      if (!Number.isFinite(tAmt) || tAmt <= 0 || tAmt > supply || !Number.isFinite(q) || q <= 0) {
        setError(`Enter the tokens and ${CHAINS[draft.chain].symbol} you will add to the pool. LIFT never provides liquidity.`);
        return;
      }
      if (!Number.isFinite(buy) || buy < 0) {
        setError(`Initial buy must be zero or a positive ${CHAINS[draft.chain].symbol} amount.`);
        return;
      }
    }
    if (step === 1 && !solana && !evmLaunch) {
      const t = Number(draft.tokenLiquidity);
      const q = Number(draft.quoteLiquidity);
      if (!draft.quoteSymbol || !Number.isFinite(t) || t <= 0 || t > Number(draft.supply) || !Number.isFinite(q) || q <= 0) {
        setError('Choose a pair and enter valid liquidity amounts.');
        return;
      }
    }
    setStep(Math.min(2, step + 1));
  }

  const feePaid = Boolean(draft.feeTx) || draft.stage === 'token' || draft.resumeFee === true;
  const liquidityPending = isEvmLiquidityPending(draft);
  const launchComplete = draft.stage === 'complete' && !liquidityPending;

  function finishLaunch(next: LaunchDraft) {
    saveDraft(next);
    clearActiveCreateSession(next.id);
    setDraft(next);
  }

  function closeReview() {
    setReview(false);
    if (!draft || draft.stage !== 'complete') return;
    setDraft(blankDraft());
    setStep(0);
    setError('');
  }

  async function persistCompletedLaunch(next: LaunchDraft, mintTx?: string) {
    if (!next.tokenAddress || !wallet.address) return;
    if (next.chain !== 'solana' && !next.poolAddress) return;
    try {
      await fetch('/api/launch/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: next.id,
          chain: next.chain,
          name: next.name.trim(),
          symbol: next.symbol.trim(),
          description: next.description,
          imageUrl:
            next.imageUrl?.startsWith('https://') || next.imageUrl?.startsWith('data:image/')
              ? next.imageUrl
              : undefined,
          tokenAddress: next.tokenAddress,
          poolAddress: next.poolAddress,
          creatorWallet: wallet.address,
          feeTx: next.feeTx,
          mintTx,
          quoteSymbol: next.quoteSymbol || (next.chain === 'solana' ? 'SOL' : undefined),
          quoteAddress: next.quoteAddress || undefined,
          quoteDecimals: assets.find(
            (asset) => asset.address === next.quoteAddress || asset.symbol === next.quoteSymbol,
          )?.decimals,
        }),
      });
    } catch {
      /* local portfolio already updated */
    }
  }

  async function waitForEvmConfirmation(chain: ChainKey, hash: string, label: string) {
    for (let attempt = 0; attempt < 45; attempt++) {
      if (attempt > 0) await new Promise((resolve) => window.setTimeout(resolve, 1_500));
      const response = await fetch(`/api/transactions/${chain}/${hash}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `${label} confirmation could not be checked.`);
      if (body.status === 'failed') throw new Error(`${label} reverted on-chain.`);
      if (body.status === 'confirmed') return;
    }
    throw new Error(`${label} is still pending. Reopen this launch from Portfolio to continue safely.`);
  }

  async function readEvmLiquidityStatus(current: LaunchDraft, tokenAddress: string) {
    const params = new URLSearchParams({
      chain: current.chain,
      token: tokenAddress,
      account: wallet.address || '',
      tokenAmount: current.tokenLiquidity,
      quoteAmount: current.quoteLiquidity,
    });
    if (current.quoteAddress) params.set('quoteToken', current.quoteAddress);
    const response = await fetch(`/api/launch/liquidity?${params.toString()}`, { cache: 'no-store' });
    const body = await response.json() as { error?: string; live?: boolean; poolAddress?: string; approvalRequired?: boolean };
    if (!response.ok) throw new Error(body.error || 'Pool status could not be checked.');
    return body;
  }

  async function finishEvmLiquidity(current: LaunchDraft, tokenAddress: string, deployHash?: string) {
    if (!wallet.address) throw new Error('Reconnect your EVM wallet before adding liquidity.');
    let working: LaunchDraft = {
      ...current,
      stage: 'liquidity',
      tokenAddress,
      poolAddress: undefined,
      owner: wallet.address,
      lastError: undefined,
      updatedAt: new Date().toISOString(),
    };
    persistDraft(working);
    setDraft(working);

    const completeWithPool = async (poolAddress: string, firstBuyWarning = '') => {
      const completed: LaunchDraft = {
        ...working,
        stage: 'complete',
        poolAddress,
        lastError: firstBuyWarning || undefined,
        updatedAt: new Date().toISOString(),
      };
      finishLaunch(completed);
      const confirmedDeploy = deployHash || working.transactions.find(
        (item) => item.stage === 'token' && item.status === 'confirmed',
      )?.hash;
      await persistCompletedLaunch(completed, confirmedDeploy);
      notify(
        firstBuyWarning
          ? `Pool created for ${current.symbol}. ${firstBuyWarning}`
          : `Launched ${current.symbol}. Pool verified on ${CHAINS[current.chain].name}.`,
      );
      setReview(true);
    };

    const markTx = (hash: string, status: 'pending' | 'confirmed' | 'failed', stage?: string) => {
      working = {
        ...working,
        transactions: [
          ...working.transactions.filter((item) => item.hash !== hash),
          { stage: stage || working.transactions.find((item) => item.hash === hash)?.stage || 'liquidity', hash, status },
        ],
        updatedAt: new Date().toISOString(),
      };
      persistDraft(working);
      setDraft(working);
    };

    setBusyHint('Checking the pool…');
    notify('Checking whether the pool already exists…');
    let status = await readEvmLiquidityStatus(working, tokenAddress);
    const latestLiquidity = [...working.transactions].reverse().find((item) => item.stage === 'liquidity');
    let action = nextEvmLiquidityAction({ live: Boolean(status.live && status.poolAddress), liquidityTxStatus: latestLiquidity?.status });

    if (action === 'complete' && status.poolAddress) {
      await completeWithPool(status.poolAddress);
      return;
    }

    if (action === 'wait-pending' && latestLiquidity) {
      setBusyHint('Waiting for the previous pool transaction…');
      notify('A pool transaction is already in flight. Waiting for it before asking the wallet again.');
      try {
        await waitForEvmConfirmation(current.chain, latestLiquidity.hash, 'Add liquidity');
        markTx(latestLiquidity.hash, 'confirmed', 'liquidity');
      } catch {
        markTx(latestLiquidity.hash, 'failed', 'liquidity');
      }
      status = await readEvmLiquidityStatus(working, tokenAddress);
      action = nextEvmLiquidityAction({
        live: Boolean(status.live && status.poolAddress),
        liquidityTxStatus: [...working.transactions].reverse().find((item) => item.stage === 'liquidity')?.status,
      });
      if (action === 'complete' && status.poolAddress) {
        await completeWithPool(status.poolAddress);
        return;
      }
    }

    const liquidityResponse = await fetch('/api/launch/liquidity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chain: current.chain,
        token: tokenAddress,
        tokenAmount: current.tokenLiquidity,
        quoteAmount: current.quoteLiquidity,
        account: wallet.address,
        quoteToken: current.quoteAddress || undefined,
        quoteDecimals: assets.find(
          (asset) => asset.address === current.quoteAddress || asset.symbol === current.quoteSymbol,
        )?.decimals,
      }),
    });
    const prepared = await liquidityResponse.json() as {
      error?: string;
      approve?: PreparedTransaction;
      approveQuote?: PreparedTransaction;
      add?: PreparedTransaction;
    };
    if (!liquidityResponse.ok) throw new Error(prepared.error || 'Liquidity transaction could not be built.');
    if (!prepared.add) throw new Error('The pool transaction was not returned.');

    const sendAndConfirm = async (tx: PreparedTransaction, stage: string, label: string) => {
      setBusyHint('Confirm in your wallet…');
      notify(`${label}: confirm in MetaMask on ${CHAINS[current.chain].name}.`);
      const hash = await wallet.send(tx);
      markTx(hash, 'pending', stage);
      setBusyHint('Waiting for confirmation…');
      await waitForEvmConfirmation(current.chain, hash, label);
      markTx(hash, 'confirmed', stage);
      return hash;
    };

    if (prepared.approve) await sendAndConfirm(prepared.approve, 'approval', 'Token approval');
    if (prepared.approveQuote) await sendAndConfirm(prepared.approveQuote, 'approval', 'Quote-token approval');
    await sendAndConfirm(prepared.add, 'liquidity', 'Add liquidity');

    setBusyHint('Verifying the pool…');
    let verified: Awaited<ReturnType<typeof readEvmLiquidityStatus>> | undefined;
    for (let attempt = 0; attempt < 20; attempt++) {
      verified = await readEvmLiquidityStatus(working, tokenAddress);
      if (verified.live && verified.poolAddress) break;
      await new Promise((resolve) => window.setTimeout(resolve, 1_500));
    }
    if (!verified?.live || !verified.poolAddress) {
      const sent = [...working.transactions].reverse().find((item) => item.stage === 'liquidity');
      if (sent) markTx(sent.hash, 'failed', 'liquidity');
      throw new Error('The pool transaction was sent, but PancakeSwap has no pair yet. Tap Resume liquidity and confirm add liquidity again.');
    }

    let firstBuyWarning = '';
    const buyAmount = Number(current.initialBuy || '0');
    if (Number.isFinite(buyAmount) && buyAmount > 0 && current.chain !== 'robinhood') {
      try {
        const buyResponse = await fetch('/api/launch/buy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chain: current.chain,
            token: tokenAddress,
            quoteAmount: current.initialBuy,
            account: wallet.address,
          }),
        });
        const buy = await buyResponse.json() as { error?: string; buy?: PreparedTransaction; approval?: PreparedTransaction };
        if (!buyResponse.ok || !buy.buy) throw new Error(buy.error || 'Initial buy could not be built.');
        if (buy.approval) await sendAndConfirm(buy.approval, 'approval', 'USDC approval');
        await sendAndConfirm(buy.buy, 'buy', 'Initial buy');
      } catch (buyError) {
        firstBuyWarning = `Pool is live, but the optional first buy did not finish: ${buyError instanceof Error ? buyError.message : 'unknown error'}`;
      }
    }

    await completeWithPool(verified.poolAddress, firstBuyWarning);
  }

  async function launch() {
    const current = draft;
    if (!current) return;
    if (!solana && !evmLaunch) {
      setError('Mainnet launch on this network is not enabled yet.');
      return;
    }
    if (launchComplete) {
      setReview(true);
      return;
    }
    if (!wallet.address || !wallet.matches(current.chain)) {
      persistDraft(current);
      try {
        localStorage.setItem(ACTIVE_CREATE_KEY, JSON.stringify({ id: current.id, step: stepRef.current } satisfies ActiveCreateSession));
      } catch {
        /* quota */
      }
      openWallet();
      return;
    }
    setBusy(true);
    setBusyHint('Waiting for wallet…');
    setError('');
    try {
      if (evmLaunch && current.tokenAddress) {
        if (isEvmLiquidityPending(current)) {
          const tokenAmount = Number(current.tokenLiquidity);
          const quoteAmount = Number(current.quoteLiquidity);
          if (!Number.isFinite(tokenAmount) || tokenAmount <= 0 || !Number.isFinite(quoteAmount) || quoteAmount <= 0) {
            setError(`Enter the tokens and ${CHAINS[current.chain].symbol} you will add to the pool. LIFT never provides liquidity.`);
            setStep(1);
            return;
          }
          await finishEvmLiquidity(current, current.tokenAddress);
          return;
        }
        setReview(true);
        return;
      }

      const uri = current.imageUrl.startsWith('https://') ? current.imageUrl : undefined;

      if (solana) {
        // Explicit 2-step: fee → LaunchLab mint. Durable feeTx lets users resume after Phantom blocks.
        const knownFee = current.feeTx || undefined;
        // Only scan chain for a prior fee when resuming mint (never on a fresh Launch).
        const resuming = Boolean(knownFee) || current.stage === 'token' || current.resumeFee === true;
        const r = await fetch('/api/launch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chain: current.chain,
            name: current.name.trim(),
            symbol: current.symbol.trim(),
            description: current.description,
            uri,
            supply: current.supply,
            initialBuy: current.initialBuy || '0',
            account: wallet.address,
            feeTx: knownFee,
            discoverFee: resuming && !knownFee,
          }),
        });
        const data = await r.json() as {
          error?: string;
          encoded?: string[];
          mint?: string;
          mintStartIndex?: number;
          feeSkipped?: boolean;
          feeTx?: string | null;
          expiresAt: number;
        };
        if (!r.ok) throw new Error(data.error || 'Launch could not be built.');
        if (!Array.isArray(data.encoded) || !data.encoded.length) throw new Error('Launch transactions were empty.');

        const mintStart = typeof data.mintStartIndex === 'number' ? data.mintStartIndex : (data.feeSkipped ? 0 : 1);
        let feeSig = knownFee || data.feeTx || undefined;
        const txs: { stage: string; hash: string; status: 'pending' | 'confirmed' | 'failed' }[] = [
          ...current.transactions.filter((t) => t.stage === 'fee' && t.status === 'confirmed'),
        ];

        // Step A — platform fee (skipped when already confirmed on-chain / in draft)
        if (mintStart > 0) {
          try {
            notify('Confirm platform fee in Phantom (1/2). Then you will mint.');
            feeSig = await wallet.send({
              chain: 'solana', chainId: 0, data: '0x', value: '0',
              description: 'LIFT platform fee', expiresAt: data.expiresAt, encoded: data.encoded[0],
            });
            const afterFee: LaunchDraft = {
              ...current,
              stage: 'token',
              feeTx: feeSig,
              pendingMint: data.mint,
              owner: wallet.address,
              lastError: undefined,
              transactions: [
                { stage: 'fee', hash: feeSig, status: 'confirmed' },
                ...txs.filter((t) => t.stage !== 'fee'),
              ],
              updatedAt: new Date().toISOString(),
            };
            persistDraft(afterFee);
            setDraft(afterFee);
            notify('Fee paid. Confirm LaunchLab mint in Phantom (2/2).');
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'Fee step failed.';
            if (isPhantomRedirectError(msg)) {
              persistDraft({
                ...current,
                pendingMint: data.mint,
                owner: wallet.address,
                updatedAt: new Date().toISOString(),
              });
              notify('Approve the fee in Phantom — you will return here.');
              return;
            }
            const failed: LaunchDraft = {
              ...current,
              lastError: `Fee failed: ${msg}`,
              updatedAt: new Date().toISOString(),
            };
            persistDraft(failed);
            setDraft(failed);
            throw new Error(`Fee step failed: ${msg}`);
          }
        } else if (feeSig && !current.feeTx) {
          const recovered: LaunchDraft = {
            ...current,
            stage: 'token',
            feeTx: feeSig,
            pendingMint: data.mint,
            owner: wallet.address,
            lastError: undefined,
            transactions: [
              { stage: 'fee', hash: feeSig, status: 'confirmed' },
              ...txs.filter((t) => t.stage !== 'fee'),
            ],
            updatedAt: new Date().toISOString(),
          };
          persistDraft(recovered);
          setDraft(recovered);
          notify('Found your paid fee on-chain. Confirm LaunchLab mint in Phantom.');
        }

        // Step B — LaunchLab mint (and optional first buy if bundled)
        const mintEncoded = data.encoded.slice(mintStart);
        const mintHashes: string[] = [];
        try {
          for (let i = 0; i < mintEncoded.length; i++) {
            mintHashes.push(await wallet.send({
              chain: 'solana', chainId: 0, data: '0x', value: '0',
              description: i === 0 ? 'LaunchLab mint' : 'LaunchLab follow-up',
              expiresAt: data.expiresAt,
              encoded: mintEncoded[i],
            }));
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Mint step failed.';
          if (isPhantomRedirectError(msg)) {
            const pausing: LaunchDraft = {
              ...current,
              stage: 'token',
              feeTx: feeSig || current.feeTx,
              pendingMint: data.mint,
              owner: wallet.address,
              lastError: undefined,
              updatedAt: new Date().toISOString(),
            };
            persistDraft(pausing);
            setDraft(pausing);
            notify('Approve the mint in Phantom — you will return here.');
            return;
          }
          const paused: LaunchDraft = {
            ...current,
            stage: 'token',
            feeTx: feeSig || current.feeTx,
            pendingMint: data.mint,
            owner: wallet.address,
            lastError: `Mint failed: ${msg}`,
            transactions: [
              ...(feeSig ? [{ stage: 'fee', hash: feeSig, status: 'confirmed' as const }] : []),
              ...mintHashes.map((hash) => ({ stage: 'token', hash, status: 'failed' as const })),
            ],
            updatedAt: new Date().toISOString(),
          };
          persistDraft(paused);
          setDraft(paused);
          throw new Error(
            `Fee paid — mint did not finish: ${msg}. Tap “Finish mint” to continue without paying the fee again.`,
          );
        }

        const mintTx = mintHashes[0];
        const completed: LaunchDraft = {
          ...current,
          stage: 'complete',
          tokenAddress: data.mint,
          pendingMint: data.mint,
          feeTx: feeSig || current.feeTx,
          owner: wallet.address,
          lastError: undefined,
          transactions: [
            ...(feeSig ? [{ stage: 'fee', hash: feeSig, status: 'confirmed' as const }] : []),
            ...mintHashes.map((hash) => ({ stage: 'token', hash, status: 'confirmed' as const })),
          ],
          updatedAt: new Date().toISOString(),
        };
        finishLaunch(completed);
        await persistCompletedLaunch(completed, mintTx);
        notify(`Launched ${current.symbol}. Mint ${data.mint?.slice(0, 4)}…${data.mint?.slice(-4)}`);
        setReview(true);
        return;
      }

      // EVM path: fee → deploy → confirmed approval → confirmed and verified pool.
      const r = await fetch('/api/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chain: current.chain,
          name: current.name.trim(),
          symbol: current.symbol.trim(),
          description: current.description,
          uri,
          supply: current.supply,
          initialBuy: current.initialBuy || '0',
          account: wallet.address,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Launch could not be built.');
      const hashes: string[] = [];
      for (const tx of data.transactions) hashes.push(await wallet.send(tx));
      const deployHash = hashes[1];
      if (!deployHash) throw new Error('The wallet did not return the token deployment hash.');
      let tokenAddress = '';
      for (let i = 0; i < 30 && !tokenAddress; i++) {
        await new Promise((resolve) => window.setTimeout(resolve, 2_000));
        const statusResponse = await fetch(`/api/transactions/${current.chain}/${deployHash}`);
        const status = await statusResponse.json();
        if (!statusResponse.ok) throw new Error(status.error || 'Token deployment could not be checked.');
        if (status.contractAddress) tokenAddress = status.contractAddress;
        if (status.status === 'failed') throw new Error('Token deploy reverted.');
      }
      if (!tokenAddress) {
        throw new Error('Token deployed, but its address is not visible yet. Reopen this draft from Portfolio to continue without redeploying.');
      }
      const deployed: LaunchDraft = {
        ...current,
        stage: 'liquidity',
        tokenAddress,
        feeTx: current.feeTx || hashes[0],
        owner: wallet.address,
        lastError: undefined,
        transactions: [
          { stage: 'fee', hash: hashes[0], status: 'confirmed' },
          { stage: 'token', hash: deployHash, status: 'confirmed' },
        ],
        updatedAt: new Date().toISOString(),
      };
      persistDraft(deployed);
      setDraft(deployed);
      await finishEvmLiquidity(deployed, tokenAddress, deployHash);
    } catch (e) {
      const msg = describeEvmWalletError(e);
      const latest = draftRef.current;
      if (latest?.tokenAddress) {
        persistDraft({ ...latest, lastError: msg, updatedAt: new Date().toISOString() });
      }
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  const isStoredDraft = Boolean(draft && drafts.some((d) => d.id === draft.id));
  function requestDeleteDraft() {
    if (!draft) return;
    setConfirmDelete(true);
  }

  function confirmDeleteDraft() {
    if (!draft) return;
    if (!deleteDraft(draft.id)) {
      setConfirmDelete(false);
      setError('Draft could not be deleted from this device.');
      return;
    }
    setConfirmDelete(false);
    // Leave Create so a blank draft cannot be auto-saved back into storage.
    location.assign('/portfolio');
  }

  return (
    <section className="create-page">
      <div className="create-top-bar">
        <Link href="/portfolio" className="back-link"><ArrowLeft size={14} /> Back to portfolio</Link>
      </div>
      <div className="page-heading">
        <span className="eyebrow">MAKE ROOM FOR YOUR IDEA</span>
        <h1>Every token starts<br />with a little belief<span>.</span></h1>
        <p>Bring the idea. Give it a home.</p>
      </div>
      <div className="create-layout">
        <div className="create-form">
          <div className="steps">
            {['The idea', 'The pairing', 'The launch'].map((s, i) => (
              <button key={s} onClick={() => (i < step ? setStep(i) : undefined)} className={step === i ? 'active' : step > i ? 'done' : ''} disabled={i > step}>
                <span>{step > i ? <Check size={12} /> : i + 1}</span>
                {s}
              </button>
            ))}
          </div>
          {step === 0 && (
            <div className="form-body">
              <h2>What are you creating?</h2>
              <label className="upload-area">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 500000 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
                      setError('Choose a PNG, JPEG or WebP under 500 KB.');
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => patch({ imageUrl: String(reader.result) });
                    reader.readAsDataURL(file);
                  }}
                />
                {draft.imageUrl ? <img src={draft.imageUrl} alt="Token preview" /> : <Upload size={21} />}
                <span>
                  <strong>{draft.imageUrl ? 'Change token image' : 'Add a token image'}</strong>
                  <small>PNG, JPG or WebP · Up to 500 KB</small>
                </span>
                <Plus size={17} />
              </label>
              <div className="form-grid">
                <label>Token name<input maxLength={32} placeholder="e.g. Orbit" value={draft.name} onChange={(e) => patch({ name: e.target.value })} /></label>
                <label>
                  Symbol
                  <div className="input-prefix">
                    <span>$</span>
                    <input maxLength={10} placeholder="ORBIT" value={draft.symbol} onChange={(e) => patch({ symbol: e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() })} />
                  </div>
                </label>
              </div>
              <label>
                The story <span className="optional">optional</span>
                <textarea maxLength={500} rows={3} placeholder="What brings your community together?" value={draft.description} onChange={(e) => patch({ description: e.target.value })} />
                <small className="character-count">{draft.description.length}/500</small>
              </label>
              <label>
                Network
                <select
                  value={draft.chain}
                  onChange={(e) => {
                    const chain = e.target.value as ChainKey;
                    if (chain === 'solana') patch({ chain, quoteAddress: PROTOCOL.solMint, quoteSymbol: 'SOL', initialBuy: draft.initialBuy || '0' });
                    else if (chain === 'robinhood') patch({ chain, quoteAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', quoteSymbol: 'ETH', initialBuy: '0' });
                    else if (chain === 'arc') patch({ chain, quoteAddress: '0x3600000000000000000000000000000000000000', quoteSymbol: 'USDC', initialBuy: '0' });
                    else patch({ chain, quoteAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', quoteSymbol: CHAINS[chain].symbol, initialBuy: draft.initialBuy || '0' });
                  }}
                >
                  {CREATE_CHAINS.map((c) => (
                    <option key={c} value={c}>{CHAINS[c].name}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {step === 1 && (
            <div className="form-body">
              <h2>Launch settings.</h2>
              {solana ? (
                <>
                  <p className="form-description">Raydium LaunchLab curve is always SOL-quoted. Pick an xStock if you want that as your intended secondary pair after launch; the curve itself still uses SOL.</p>
                  <QuotePairPicker
                    label="Pair focus"
                    sectionLabel="xStocks"
                    assets={pairAssets}
                    valueSymbol={draft.quoteSymbol || 'SOL'}
                    onChange={(symbol, asset) => {
                      patch({ quoteSymbol: symbol, quoteAddress: asset.address || PROTOCOL.solMint });
                    }}
                  />
                  {stockPair && <p className="notice"><Info size={15} />LaunchLab still creates a SOL bonding curve. xStock ({quoteLabel}) is saved as your preferred pair for later Raydium liquidity — not the curve quote.</p>}
                  <label>
                    Your first buy <span className="optional">SOL · 0 = create only</span>
                    <input inputMode="decimal" placeholder="0" value={draft.initialBuy} onChange={(e) => patch({ initialBuy: e.target.value.replace(/[^0-9.]/g, '') })} />
                  </label>
                  <p className="fine-print">Platform fee {PROTOCOL.launchFeeSol} SOL is separate. xStocks are unavailable in restricted jurisdictions.</p>
                </>
              ) : evmLaunch ? (
                <>
                  <p className="form-description">On {CHAINS[draft.chain].name} you set supply and fund the pool. {draft.chain === 'arc' ? 'Arc pools use USDC and gas is paid in USDC.' : 'On Robinhood you can pair with ETH or a Stock Token.'} Fee {launchFeeLabel(draft.chain)}.</p>
                  <QuotePairPicker
                    label="Pair with"
                    sectionLabel="Stocks"
                    assets={pairAssets}
                    valueSymbol={draft.quoteSymbol || CHAINS[draft.chain].symbol}
                    onChange={(symbol, asset) => {
                      patch({
                        quoteSymbol: symbol,
                        quoteAddress: asset.address || (draft.chain === 'arc' ? '0x3600000000000000000000000000000000000000' : '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'),
                        initialBuy: asset.kind === 'stock' || draft.chain === 'robinhood' ? '0' : draft.initialBuy,
                      });
                    }}
                  />
                  {stockPair && <p className="notice"><Info size={15} />Stock Tokens are not available in the US and other restricted regions. You must already hold {quoteLabel} in your wallet to seed the pool.</p>}
                  <label>Total token supply<input inputMode="numeric" value={draft.supply} onChange={(e) => patch({ supply: e.target.value.replace(/[^0-9]/g, '') })} /></label>
                  <div className="form-grid">
                    <label>Tokens into the pool<input inputMode="decimal" value={draft.tokenLiquidity} onChange={(e) => patch({ tokenLiquidity: e.target.value })} /></label>
                    <label>{quoteLabel} into the pool<input inputMode="decimal" placeholder={draft.chain === 'arc' ? '10' : '0.05'} value={draft.quoteLiquidity} onChange={(e) => patch({ quoteLiquidity: e.target.value })} /></label>
                  </div>
                  <label>
                    Your first buy <span className="optional">{CHAINS[draft.chain].symbol} · 0 to skip{draft.chain === 'robinhood' || stockPair ? ' · skip on RH / stock pairs' : ''}</span>
                    <input inputMode="decimal" placeholder="0" disabled={draft.chain === 'robinhood' || stockPair} value={draft.chain === 'robinhood' || stockPair ? '0' : draft.initialBuy} onChange={(e) => patch({ initialBuy: e.target.value.replace(/[^0-9.]/g, '') })} />
                  </label>
                  <p className="fine-print">Pool amounts leave your wallet. LIFT never adds liquidity.</p>
                </>
              ) : (
                <>
                  <p className="form-description">This network is not launch-ready yet.</p>
                </>
              )}
            </div>
          )}
          {step === 2 && (
            <div className="form-body">
              <h2>A small beginning.</h2>
              <p className="form-description">{solana ? (feePaid ? 'Fee already confirmed. Next: sign LaunchLab mint in Phantom (no second fee).' : 'Two Phantom prompts: (1) platform fee, then (2) LaunchLab mint. If mint is interrupted, you can finish it without paying again.') : evmLaunch ? (liquidityPending ? 'Token already deployed. Sign only the missing pool transaction. Live after the pair is verified on-chain.' : 'Fee → deploy → your pool → optional first buy.') : 'Review your launch. This network is not enabled yet.'}</p>
              <div className="review-list">
                <div><span>Network</span><strong>{CHAINS[draft.chain].name}</strong></div>
                <div><span>Token</span><strong>{draft.name || '—'} · ${draft.symbol || '—'}</strong></div>
                {evmLaunch && <div><span>Supply</span><strong>{draft.supply || '—'}</strong></div>}
                {evmLaunch && <div><span>Pool</span><strong>{draft.tokenLiquidity || '0'} tokens + {draft.quoteLiquidity || '0'} {quoteLabel}</strong></div>}
                <div><span>First buy</span><strong>{Number(draft.initialBuy || '0') > 0 ? `${draft.initialBuy} ${solana ? 'SOL' : CHAINS[draft.chain].symbol}` : 'None'}</strong></div>
                <div><span>Platform fee</span><strong>{launchFeeLabel(draft.chain)}</strong></div>
              </div>
              {draft.chain === 'robinhood' && (
                <p className="notice"><Info size={15} />ETH must be on Robinhood Chain, not Ethereum. If MetaMask greys out Confirm, you do not have enough Robinhood ETH for the pool plus gas.</p>
              )}
              {!canLaunch && <p className="notice"><Info size={16} />Mainnet launch on this network is not enabled. The deployment contract and pool must be verified first.</p>}
              {solana && platform && !platform.registered && (
                <p className="notice"><Info size={16} />LaunchLab still uses Raydium’s default platform until the treasury registers LIFT. Connect the Solana treasury and register once so 0.25% curve fees go to LIFT.</p>
              )}
              {solana && platform?.registered && <p className="fine-print">LaunchLab platform {platform.platformId?.slice(0, 4)}…{platform.platformId?.slice(-4)} · 0.25% to treasury.</p>}
              {solana && feePaid && !launchComplete && (
                <p className="notice"><Info size={15} />Fee paid{draft.feeTx ? <> · <a href={`https://solscan.io/tx/${draft.feeTx}`} target="_blank" rel="noreferrer">view fee tx</a></> : null}. Finish mint to get your token address.</p>
              )}
              {liquidityPending && draft.tokenAddress && (
                <div className="review-list" style={{ marginTop: 12 }}>
                  <div><span>Status</span><strong>Liquidity pending</strong></div>
                  <div><span>Contract</span><strong style={{ overflowWrap: 'anywhere' }}>{draft.tokenAddress}</strong></div>
                  <div><span>Explorer</span><strong><a href={explorerUrl(draft.chain, 'token', draft.tokenAddress)} target="_blank" rel="noreferrer">{explorerName(draft.chain)} ↗</a></strong></div>
                </div>
              )}
              {launchComplete && draft.tokenAddress && (
                <div className="review-list" style={{ marginTop: 12 }}>
                  <div><span>Status</span><strong>Live</strong></div>
                  <div><span>Mint</span><strong style={{ overflowWrap: 'anywhere' }}>{draft.tokenAddress}</strong></div>
                  <div><span>Explorer</span><strong><a href={explorerUrl(draft.chain, 'token', draft.tokenAddress)} target="_blank" rel="noreferrer">{explorerName(draft.chain)} ↗</a></strong></div>
                </div>
              )}
              <p className="fine-print">The platform fee is extra to network gas. Shown before you sign.</p>
            </div>
          )}
          {error && <p role="alert" className="notice error">{error}</p>}
          <div className="form-actions">
            <div className="form-actions-secondary">
              <button type="button" className="text-button" onClick={() => saveDraft(draft)}>Save draft</button>
              {isStoredDraft && (
                <button type="button" className="text-button create-delete" onClick={requestDeleteDraft}>
                  <Trash2 size={14} /> Delete draft
                </button>
              )}
            </div>
            {step === 2 && solana && !feePaid && !launchComplete && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  const nextDraft = { ...draft, stage: 'token' as const, resumeFee: true, lastError: undefined, updatedAt: new Date().toISOString() };
                  persistDraft(nextDraft);
                  setDraft(nextDraft);
                  notify('Resume armed. Tap Finish mint — we will reuse your on-chain fee if found.');
                }}
              >
                Already paid fee?
              </button>
            )}
            {step < 2 ? (
              <button className="primary-button" onClick={next}>Continue <ArrowRight size={15} /></button>
            ) : canLaunch ? (
              <button className="primary-button" disabled={busy} onClick={launch}>
                {busy
                  ? busyHint
                  : !wallet.address || !wallet.matches(draft.chain)
                    ? (solana ? 'Connect Phantom' : 'Connect wallet')
                    : launchComplete
                      ? 'View launch'
                      : liquidityPending
                        ? 'Resume liquidity'
                        : solana && feePaid
                        ? 'Finish mint · fee paid'
                        : `Launch · ${launchFeeLabel(draft.chain)} fee`}
                {busy ? <LoaderCircle size={15} className="spin" /> : <ArrowUpRight size={15} />}
              </button>
            ) : (
              <button className="primary-button" onClick={() => { if (saveDraft(draft)) setReview(true); }}>Save launch plan <Check size={15} /></button>
            )}
          </div>
          <p className="local-note">Drafts autosave on this device.</p>
        </div>
        <aside className="launch-preview">
          <span className="eyebrow">YOUR FIRST IMPRESSION</span>
          <div className="preview-card">
            <div className="preview-art">
              {draft.imageUrl ? <img src={draft.imageUrl} alt="Your token" /> : <span>{draft.symbol ? draft.symbol.slice(0, 1).toLowerCase() + '.' : '↗'}</span>}
              <span className="preview-network"><ChainIcon chain={draft.chain} />{CHAINS[draft.chain].short}</span>
            </div>
            <h3>{draft.name || 'Your next big idea'}</h3>
            <span className="muted">${draft.symbol || 'YOURTOKEN'}</span>
            <p>{draft.description || 'A little idea. A new community. Something worth starting.'}</p>
            <div className="preview-pair">
              <span>Paired with</span>
              <strong>{quoteLabel}{stockPair ? ' · STOCK' : ''} <ArrowUpRight size={12} /></strong>
            </div>
            <div className="preview-pair">
              <span>First buy</span>
              <strong>{Number(draft.initialBuy || '0') > 0 ? `${draft.initialBuy} ${solana ? 'SOL' : CHAINS[draft.chain].symbol}` : 'Skip'}</strong>
            </div>
            {evmLaunch && (
              <div className="preview-pair">
                <span>In pool</span>
                <strong>{draft.tokenLiquidity || '0'} / {draft.quoteLiquidity || '0'} {CHAINS[draft.chain].symbol}</strong>
              </div>
            )}
          </div>
          <div className="launch-note">
            <Layers size={17} />
            <p>Your token. Your community.<br /><span>Your wallet stays in control.</span></p>
          </div>
        </aside>
      </div>
      {review && (
        <Modal title="Your idea has a place." onClose={closeReview}>
          <p className="modal-copy">{canLaunch
            ? (liquidityPending && draft.tokenAddress
              ? `Contract ${draft.tokenAddress}. Not Live until the pool is verified.`
              : draft.tokenAddress
              ? `Mint ${draft.tokenAddress}. Portfolio shows it as Live.`
              : 'The launch transactions were sent. Check Portfolio for the mint and signatures.')
            : 'Your launch plan is saved on this device. You can return to it from Portfolio.'}</p>
          {draft.tokenAddress && (
            <a className="secondary-button full" href={explorerUrl(draft.chain, 'token', draft.tokenAddress)} target="_blank" rel="noreferrer" style={{ marginBottom: 10 }}>
              Open on {explorerName(draft.chain)} <ArrowUpRight size={15} />
            </a>
          )}
          <Link href="/portfolio" className="primary-button full">View in Portfolio <ArrowRight size={15} /></Link>
        </Modal>
      )}
      {confirmDelete && draft && (
        <Modal title="Delete this draft?" onClose={() => setConfirmDelete(false)}>
          <div className="confirm-delete">
            <div className="confirm-delete-icon" aria-hidden="true">
              <Trash2 size={22} />
            </div>
            <p className="modal-copy">
              Delete <strong>{draft.name?.trim() || draft.symbol?.trim() || 'this draft'}</strong>?
              This only removes it from this device. On-chain tokens stay untouched.
            </p>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setConfirmDelete(false)}>
                Keep draft
              </button>
              <button type="button" className="danger-button" onClick={confirmDeleteDraft}>
                <Trash2 size={15} /> Delete draft
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
