'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Wallet, ArrowUpRight, ArrowRight, Star, Plus, Info, Copy, Check } from 'lucide-react';
import { formatEther } from 'viem';
import { CHAINS } from '@/lib/chains';
import { isEvmLiquidityPending } from '@/lib/create-session';
import type { ChainKey, LaunchDraft, Token } from '@/lib/types';
import { shortAddress, usableTokenImage } from '@/lib/format';
import type { WalletState } from './launchpad';
import { TokenRow } from './explore';
import { ChainIcon } from './ui';

function launchBadge(d: LaunchDraft): { label: string; className: string } {
  if (isEvmLiquidityPending(d)) return { label: 'Liquidity pending', className: 'badge fee' };
  if (d.stage === 'complete' && d.tokenAddress) return { label: 'Live', className: 'badge live' };
  if (d.feeTx || d.stage === 'token') return { label: 'Fee paid', className: 'badge fee' };
  return { label: 'Draft', className: 'badge' };
}

function launchHref(d: LaunchDraft) {
  if (isEvmLiquidityPending(d)) return `/create?draft=${d.id}&resume=liquidity`;
  // Live launches open in-app TokenDetail (buy/sell + contract). Drafts resume Create.
  if (d.stage === 'complete' && d.tokenAddress) {
    const pool = d.poolAddress || d.tokenAddress;
    return `/token/${d.chain}/${encodeURIComponent(pool)}`;
  }
  return `/create?draft=${d.id}`;
}

export function Portfolio({
  watch,
  onWatch,
  drafts,
  wallet,
  openWallet,
}: {
  watch: string[];
  onWatch: (id: string) => void;
  drafts: LaunchDraft[];
  wallet: WalletState;
  openWallet: () => void;
}) {
  const [tab, setTab] = useState('Watchlist');
  const [balance, setBalance] = useState<string | null>(null);
  const [saved, setSaved] = useState<Token[]>([]);
  const [copiedDraftId, setCopiedDraftId] = useState('');
  const connected = Boolean(wallet.address);
  // My launches are wallet-scoped: never list device drafts while disconnected.
  const visibleDrafts = connected
    ? drafts.filter((d) => {
        if (!d.owner) return true;
        return d.owner.toLowerCase() === wallet.address!.toLowerCase();
      })
    : [];
  useEffect(() => {
    setBalance(null);
    if (wallet.address && wallet.kind === 'evm') {
      const eth = window.ethereum as { request?: (args: { method: string; params?: unknown[] }) => Promise<unknown> } | undefined;
      eth
        ?.request?.({ method: 'eth_getBalance', params: [wallet.address, 'latest'] })
        .then((v: unknown) => setBalance(formatEther(BigInt(v as string))))
        .catch(() => {});
    }
  }, [wallet.address, wallet.kind]);
  useEffect(() => {
    if (!connected || !watch.length) {
      setSaved([]);
      return;
    }
    const c = new AbortController();
    fetch('/api/market', { signal: c.signal })
      .then((r) => r.json())
      .then((d) => {
        const tokens = (d.tokens || []).filter((t: Token) => t.source !== 'demo' && watch.includes(t.id));
        setSaved(tokens);
      })
      .catch(() => setSaved([]));
    return () => c.abort();
  }, [watch, connected]);

  async function copyLaunchAddress(draft: LaunchDraft) {
    if (!draft.tokenAddress) return;
    try {
      await navigator.clipboard.writeText(draft.tokenAddress);
      setCopiedDraftId(draft.id);
      window.setTimeout(() => {
        setCopiedDraftId((current) => (current === draft.id ? '' : current));
      }, 2000);
    } catch {
      setCopiedDraftId('');
    }
  }

  return (
    <section className="portfolio-page">
      <div className="page-heading">
        <span className="eyebrow">YOUR CORNER OF THE INTERNET</span>
        <h1>
          A few things
          <br />
          worth keeping<span>.</span>
        </h1>
        <p>Your favorites, your ideas, your next beginning.</p>
      </div>
      <div className="portfolio-wallet">
        <div>
          <Wallet size={20} />
          <span>
            <strong suppressHydrationWarning>{wallet.address ? shortAddress(wallet.address) : 'Your portfolio starts here'}</strong>
            <small>
              {wallet.address
                ? balance !== null
                  ? `${balance} native token · Current wallet network`
                  : 'Wallet connected · Token balances await indexed data'
                : 'Connect a wallet to see your portfolio, watchlist sync, and launches.'}
            </small>
          </span>
        </div>
        <button className="secondary-button" onClick={openWallet} suppressHydrationWarning>
          <span suppressHydrationWarning>{wallet.address ? 'Manage wallet' : 'Connect wallet'}</span>
          <ArrowUpRight size={14} />
        </button>
      </div>
      <div className="market-tabs portfolio-tabs">
        {['Watchlist', 'My launches'].map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
            <span className="count">{t === 'Watchlist' ? (connected ? watch.length : 0) : visibleDrafts.length}</span>
          </button>
        ))}
      </div>
      {tab === 'Watchlist' ? (
        !connected ? (
          <div className="empty-state">
            <Wallet size={26} />
            <h3>Connect to see your watchlist.</h3>
            <p>Favorites stay with your wallet — nothing is listed until you connect.</p>
            <button className="primary-button" onClick={openWallet}>
              Connect wallet <ArrowUpRight size={14} />
            </button>
          </div>
        ) : saved.length ? (
          <>
            <p className="market-caption">Live markets · Saved for this wallet</p>
            <div className="token-grid">
              {saved.map((t, i) => (
                <TokenRow key={t.id} token={t} index={i} saved onWatch={() => onWatch(t.id)} />
              ))}
            </div>
          </>
        ) : (
          <div className="empty-state">
            <Star size={26} />
            <h3>A little space for your favorites.</h3>
            <p>Star a token in Explore to keep it close.</p>
            <Link className="secondary-button" href="/">
              Explore tokens <ArrowRight size={14} />
            </Link>
          </div>
        )
      ) : !connected ? (
        <div className="empty-state">
          <Wallet size={26} />
          <h3>Connect to see your launches.</h3>
          <p>Launches stay tied to your wallet — nothing is listed until you connect.</p>
          <button className="primary-button" onClick={openWallet}>
            Connect wallet <ArrowUpRight size={14} />
          </button>
        </div>
      ) : visibleDrafts.length ? (
        <>
        <p className="market-caption">
          Your launches for this wallet.
        </p>
        <div className="draft-list">
          {visibleDrafts.map((d) => {
            const badge = launchBadge(d);
            const liquidityPending = isEvmLiquidityPending(d);
            const live = Boolean(d.stage === 'complete' && d.tokenAddress && !liquidityPending);
            const href = launchHref(d);
            const image = usableTokenImage(d.imageUrl);
            const meta = [
              CHAINS[d.chain].name,
              d.quoteSymbol || 'Pair not selected',
              !d.tokenAddress && d.feeTx ? 'mint pending' : null,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <div key={d.id} className="draft-row">
                <Link href={href} className="draft-row-main">
                  <span className={`draft-icon${image ? ' has-image' : ''}`}>
                    {image ? <img src={image} alt="" /> : d.symbol?.[0] || '+'}
                  </span>
                  <span>
                  <strong>{d.name || 'Untitled idea'}</strong>
                  <small>{meta}</small>
                  {live && d.tokenAddress && (
                    <small className="draft-hint">Open token · buy/sell</small>
                  )}
                  {liquidityPending && (
                    <small className="draft-hint">Token deployed — open and finish the pool</small>
                  )}
                  {(d.feeTx || d.stage === 'token' || d.resumeFee) && d.stage !== 'complete' && (
                    <small className="draft-hint">Fee paid — open Create and tap Finish mint</small>
                  )}
                  {d.stage === 'complete' && !d.tokenAddress && (
                    <small className="draft-hint">Marked complete but mint address is missing on this device</small>
                  )}
                  </span>
                </Link>
                {d.tokenAddress && (
                  <div className="draft-contract-copy">
                    <code title={d.tokenAddress}>{shortAddress(d.tokenAddress)}</code>
                    <button
                      type="button"
                      className="icon-button draft-copy-button"
                      onClick={() => void copyLaunchAddress(d)}
                      aria-label={copiedDraftId === d.id ? 'Contract address copied' : 'Copy contract address'}
                      title={copiedDraftId === d.id ? 'Copied' : 'Copy contract address'}
                    >
                      {copiedDraftId === d.id ? <Check size={15} /> : <Copy size={15} />}
                    </button>
                  </div>
                )}
                <span className={badge.className}>{badge.label}</span>
                <Link href={href} className="draft-open" aria-label={`Open ${d.name || 'launch'}`}>
                  <ArrowUpRight size={18} />
                </Link>
              </div>
            );
          })}
        </div>
        </>
      ) : (
        <div className="empty-state">
          <Plus size={26} />
          <h3>What will you put into the world?</h3>
          <p>Start with a name. The rest can come later.</p>
          <Link className="primary-button" href="/create">
            Create a token <ArrowUpRight size={14} />
          </Link>
        </div>
      )}
      {tab === 'Watchlist' && connected && watch.length > saved.length && (
        <p className="notice">
          {watch.length - saved.length} saved pair(s) are not in the current live snapshot. Open them from Explore.
        </p>
      )}
    </section>
  );
}

export function ProviderStatus() {
  const [status, setStatus] = useState<{
    chains: { chain: ChainKey; rpc: boolean; trading: boolean; launch: boolean; reason: string }[];
    storage: boolean;
    stocks: boolean;
  } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/status')
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setError('Status could not be loaded.'));
  }, []);
  return (
    <section className="status-page">
      <div className="page-heading">
        <span className="eyebrow">TRANSPARENCY, BY DEFAULT</span>
        <h1>
          One place.
          <br />
          Seven connections<span>.</span>
        </h1>
        <p>Configuration readiness. This is not a live uptime monitor.</p>
      </div>
      {error && <p className="notice error">{error}</p>}
      <div className="status-grid">
        {status?.chains.map((c) => (
          <div key={c.chain} className="status-card">
            <h3>
              <ChainIcon chain={c.chain} />
              {CHAINS[c.chain].name}
            </h3>
            <div>
              <span>RPC configured</span>
              <span className={c.rpc ? 'positive' : 'muted'}>{c.rpc ? 'Yes' : 'Pending'}</span>
            </div>
            <div>
              <span>LIFT-token trading</span>
              <span className={c.trading ? 'positive' : 'muted'}>{c.trading ? 'Yes' : 'Pending'}</span>
            </div>
            <div>
              <span>Launch enabled</span>
              <span className={c.launch ? 'positive' : 'muted'}>{c.launch ? 'Yes' : 'Pending'}</span>
            </div>
            <p>{c.reason}</p>
          </div>
        ))}
      </div>
      <p className="notice">
        <Info size={16} />
        Launch is enabled on every listed network where the status says Yes. Each EVM creator funds the token's
        native-asset liquidity pool.
      </p>
    </section>
  );
}
