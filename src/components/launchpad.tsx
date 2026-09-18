'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, Wallet, Check, X, Copy, MoreHorizontal, Activity, BookOpen, ShieldAlert } from 'lucide-react';
import { chainKeys, type LaunchDraft, type Token } from '@/lib/types';
import { shortAddress, usableTokenImage } from '@/lib/format';
import { explorerUrl, CHAINS } from '@/lib/chains';
import { PROTOCOL } from '@/lib/protocol';
import { defaultQuoteAddress } from '@/lib/trade-quote';
import { useWallet } from '@/lib/wallet';
import { Modal, ExternalLink, Wordmark } from './ui';
import { Explore } from './explore';
import { Create } from './create';
import { Portfolio, ProviderStatus } from './portfolio';
import { TokenDetail } from './token-detail';
export type WalletState = ReturnType<typeof useWallet>;

function supportedDrafts(value: unknown): LaunchDraft[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (draft): draft is LaunchDraft =>
      Boolean(draft && typeof draft === 'object' && chainKeys.includes((draft as LaunchDraft).chain)),
  );
}

export function Launchpad({
  screen = 'explore',
  initialToken,
  tokenRoute,
}: {
  screen?: 'explore' | 'create' | 'portfolio' | 'token' | 'admin';
  initialToken?: Token;
  tokenRoute?: { chain: Token['chain']; pool: string };
}) {
  const wallet = useWallet();
  const [walletOpen, setWalletOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [info, setInfo] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [watch, setWatch] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<LaunchDraft[]>([]);
  const [token, setToken] = useState<Token | undefined>(initialToken);
  const closeWallet = useCallback(() => setWalletOpen(false), []);
  useEffect(() => {
    try {
      setWatch(JSON.parse(localStorage.getItem('still.watchlist.v1') || '[]'));
      const saved = supportedDrafts(JSON.parse(localStorage.getItem('still.launches.v1') || '[]'));
      setDrafts(saved);
      localStorage.setItem('still.launches.v1', JSON.stringify(saved));
    } catch {
      setToast('Local saved data could not be read.');
    }
  }, []);
  // Enrich soft token pages from local completed launches (mint may only live in still.launches.v1).
  useEffect(() => {
    if (screen !== 'token' || !tokenRoute) return;
    try {
      const list = supportedDrafts(JSON.parse(localStorage.getItem('still.launches.v1') || '[]'));
      const hit = list.find(
        (d) =>
          d.chain === tokenRoute.chain &&
          d.stage === 'complete' &&
          d.tokenAddress &&
          (d.tokenAddress === tokenRoute.pool || d.poolAddress === tokenRoute.pool),
      );
      if (!hit?.tokenAddress) return;
      const tokenAddress = hit.tokenAddress;
      const draftImage = usableTokenImage(hit.imageUrl);
      const solana = hit.chain === 'solana';
      setToken((prev) => ({
        id: `${hit.chain}:${hit.poolAddress || tokenAddress}`,
        chain: hit.chain,
        address: tokenAddress,
        poolAddress: hit.poolAddress || tokenAddress,
        name: hit.name || prev?.name || 'Launch',
        symbol: hit.symbol || prev?.symbol || 'TOKEN',
        // LaunchLab curve is SOL-quoted even when create UI saved an xStock preference.
        quoteSymbol: solana ? 'SOL' : (hit.quoteSymbol || prev?.quoteSymbol || CHAINS[hit.chain].symbol),
        quoteAddress: solana ? PROTOCOL.solMint : (prev?.quoteAddress || hit.quoteAddress || defaultQuoteAddress(hit.chain)),
        priceUsd: prev?.priceUsd ?? null,
        change24h: prev?.change24h ?? null,
        volume24h: prev?.volume24h ?? null,
        liquidityUsd: prev?.liquidityUsd ?? null,
        marketCap: prev?.marketCap ?? null,
        image: draftImage || usableTokenImage(prev?.image) || prev?.image,
        description: hit.description || prev?.description,
        source: prev?.source === 'dexscreener' ? 'dexscreener' : 'liftpad',
        observedAt: prev?.observedAt || new Date().toISOString(),
        url: explorerUrl(hit.chain, 'token', tokenAddress),
        dexId: prev?.dexId || (solana ? 'launchlab' : undefined),
      }));
    } catch {
      /* ignore */
    }
  }, [screen, tokenRoute]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('connect') !== '1') return;
    setWalletOpen(true);
    const kind = params.get('wallet');
    if (kind === 'solana' || kind === 'evm') void wallet.connect(kind);
    params.delete('connect');
    params.delete('wallet');
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', next);
  }, []);
  // After Phantom deeplink return, address hydrates sync — show "Your wallet" once.
  useEffect(() => {
    if (!wallet.address) return;
    try {
      const key = 'still.wallet.justConnected.v1';
      const just = sessionStorage.getItem(key);
      if (!just || just !== wallet.address) return;
      sessionStorage.removeItem(key);
      setToast('Phantom connected');
      setWalletOpen(true);
    } catch {
      /* ignore */
    }
  }, [wallet.address]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(id);
  }, [toast]);
  function toggleWatch(id: string) {
    const next = watch.includes(id) ? watch.filter((x) => x !== id) : [...watch, id];
    setWatch(next);
    try {
      localStorage.setItem('still.watchlist.v1', JSON.stringify(next));
      setToast(next.includes(id) ? 'Added to your watchlist' : 'Removed from your watchlist');
    } catch {
      setToast('Your browser could not save the watchlist.');
    }
  }
  const persistDraft = useCallback((draft: LaunchDraft, opts?: { toast?: boolean }) => {
    try {
      const raw = localStorage.getItem('still.launches.v1');
      const list = supportedDrafts(raw ? JSON.parse(raw) : []);
      const next = [{ ...draft, updatedAt: new Date().toISOString() }, ...list.filter((d) => d.id !== draft.id)];
      localStorage.setItem('still.launches.v1', JSON.stringify(next));
      setDrafts(next);
      if (opts?.toast !== false) setToast('Draft saved on this device');
      return true;
    } catch {
      if (opts?.toast !== false) setToast('Draft could not be saved. Try a smaller image.');
      return false;
    }
  }, []);
  const saveDraft = useCallback((draft: LaunchDraft) => persistDraft(draft, { toast: true }), [persistDraft]);
  const persistDraftSilent = useCallback((draft: LaunchDraft) => persistDraft(draft, { toast: false }), [persistDraft]);
  const deleteDraft = useCallback((id: string) => {
    try {
      const raw = localStorage.getItem('still.launches.v1');
      const list = supportedDrafts(raw ? JSON.parse(raw) : []);
      const next = list.filter((d) => d.id !== id);
      localStorage.setItem('still.launches.v1', JSON.stringify(next));
      setDrafts(next);
      try {
        const active = JSON.parse(localStorage.getItem('still.create.active.v1') || 'null') as { id?: string } | null;
        if (active?.id === id) localStorage.removeItem('still.create.active.v1');
      } catch {
        /* ignore */
      }
      setToast('Draft deleted');
      return true;
    } catch {
      setToast('Draft could not be deleted.');
      return false;
    }
  }, []);
  return (
    <div className="app">
      <header className="header">
        <Link className="wordmark-link" href="/" aria-label="liftpad home"><Wordmark /></Link>
        <nav className="main-navigation" aria-label="Main navigation">
          <Link className={screen === 'explore' || screen === 'token' ? 'active' : ''} href="/" aria-current={screen === 'explore' || screen === 'token' ? 'page' : undefined}>Explore</Link>
          <Link className={screen === 'create' ? 'active' : ''} href="/create" aria-current={screen === 'create' ? 'page' : undefined}>Create</Link>
          <Link className={screen === 'portfolio' ? 'active' : ''} href="/portfolio" aria-current={screen === 'portfolio' ? 'page' : undefined}>Portfolio</Link>
        </nav>
        <button className="wallet-button" onClick={() => setWalletOpen(true)} suppressHydrationWarning>
          {wallet.address && <span className="live-dot" />}
          <Wallet size={15} />
          <span suppressHydrationWarning>
            {wallet.address ? shortAddress(wallet.address) : 'Connect wallet'}
          </span>
        </button>
      </header>
      <nav className="mobile-bottom-bar" aria-label="Mobile navigation">
        <div className="mobile-bottom-scroll" aria-label="Swipe for more destinations">
          <Link className={screen === 'explore' || screen === 'token' ? 'active' : ''} href="/" aria-current={screen === 'explore' || screen === 'token' ? 'page' : undefined}>Explore</Link>
          <Link className={screen === 'create' ? 'active' : ''} href="/create" aria-current={screen === 'create' ? 'page' : undefined}>Create</Link>
          <Link className={screen === 'portfolio' ? 'active' : ''} href="/portfolio" aria-current={screen === 'portfolio' ? 'page' : undefined}>Portfolio</Link>
          <Link className={screen === 'admin' ? 'active' : ''} href="/status" aria-current={screen === 'admin' ? 'page' : undefined}><Activity size={14} /> Status</Link>
          <Link href="/#how-fees-work"><BookOpen size={14} /> Fees</Link>
        </div>
        <button className="mobile-more-trigger" type="button" onClick={() => setMobileMoreOpen(true)} aria-label="Open more options" aria-haspopup="dialog" aria-expanded={mobileMoreOpen}>
          <MoreHorizontal size={18} /> <span>More</span>
        </button>
      </nav>
      <main>
        {screen === 'explore' && <Explore watch={watch} onWatch={toggleWatch} />}
        {screen === 'create' && <Create drafts={drafts} saveDraft={saveDraft} persistDraft={persistDraftSilent} deleteDraft={deleteDraft} wallet={wallet} openWallet={() => setWalletOpen(true)} notify={setToast} />}
        {screen === 'portfolio' && <Portfolio watch={watch} onWatch={toggleWatch} drafts={drafts} wallet={wallet} openWallet={() => setWalletOpen(true)} />}
        {screen === 'token' && token && <TokenDetail token={token} saved={watch.includes(token.id)} onWatch={() => toggleWatch(token.id)} wallet={wallet} openWallet={() => setWalletOpen(true)} notify={setToast} />}
        {screen === 'admin' && <ProviderStatus />}
      </main>
      <footer>
        <Link href="/" className="wordmark-link"><Wordmark small /></Link>
        <span>Launch on seven networks. Airdrop: 25% of fees to launchers.</span>
        <div className="footer-links">
          <button onClick={() => setInfo(true)}>About & risks <ArrowUpRight size={12} /></button>
          <Link href="/#how-fees-work">How fees work</Link>
          <Link href="/status">Network status <span className="live-dot" /></Link>
        </div>
      </footer>
      {walletOpen && (
        <Modal title={wallet.address ? 'Your wallet' : 'Make yourself at home.'} onClose={closeWallet}>
          {wallet.address ? (
            <>
              <div className="wallet-address">
                <Wallet size={24} />
                <p>{shortAddress(wallet.address)}</p>
                <span>{wallet.kind === 'solana' ? 'Solana wallet' : 'EVM wallet'}</span>
              </div>
              <button className="secondary-button full" onClick={() => navigator.clipboard.writeText(wallet.address).then(() => setToast('Address copied')).catch(() => setToast('Could not access clipboard.'))}>Copy address <Copy size={15} /></button>
              <button className="text-button full" disabled={wallet.busy} onClick={async () => { await wallet.disconnect(); /* keep modal open → chooser (Phantom vs Ethereum) */ }}>Disconnect from this app</button>
            </>
          ) : (
            <>
              <p className="modal-copy">Connect your wallet to launch a token or trade. Your assets stay in your wallet.</p>
              <button className="wallet-option" disabled={wallet.busy} onClick={async () => { if (await wallet.connect('evm')) setWalletOpen(false); }}>
                <span className="wallet-glyph">◇</span>
                <span><strong>Ethereum wallet</strong><small>{
                  wallet.isMobile
                    ? (wallet.injected.evm
                      ? 'Connect in this browser'
                      : 'WalletConnect — approve in wallet, stay in this Chrome tab')
                    : 'Opens a chooser — MetaMask, Phantom, Rainbow…'
                }</small></span>
                <ArrowUpRight size={18} />
              </button>
              <button className="wallet-option" disabled={wallet.busy} onClick={async () => { if (await wallet.connect('solana')) setWalletOpen(false); }}>
                <span className="wallet-glyph phantom">◕</span>
                <span><strong>Solana wallet</strong><small>{
                  wallet.isMobile
                    ? (wallet.injected.solana || wallet.isPhantomBrowser
                      ? 'Connect in this browser'
                      : 'WalletConnect — approve in Phantom, stay in this Chrome tab')
                    : 'Opens a chooser — Phantom and other Solana wallets'
                }</small></span>
                <ArrowUpRight size={18} />
              </button>
              {wallet.error && <p className="notice error">{wallet.error}</p>}
              <p className="fine-print">
                {wallet.injected.solana || wallet.isPhantomBrowser
                  ? 'Phantom is available in this browser — connect stays on this page. Connecting does not authorize transactions.'
                  : wallet.isMobile
                    ? 'On mobile, WalletConnect keeps the session in this Chrome tab (Phantom or MetaMask approve via deeplink). Native Phantom redirect is only a fallback. Drafts autosave on this device. Connecting does not authorize transactions.'
                    : 'Connecting does not authorize transactions.'}
              </p>
            </>
          )}
        </Modal>
      )}
      {info && (
        <Modal title="About LIFT" onClose={() => setInfo(false)}>
          <p className="modal-copy">LIFT is an independent interface for discovering and launching tokens across seven validated networks.</p>
          <p className="modal-copy">Platform fees: 0.01 SOL or 0.00005 ETH at launch, plus 0.25% on Solana LaunchLab trades. Uniswap swaps have no LIFT fee. Gas is paid by the signer. Liquidity is funded by the creator.</p>
          <p className="modal-copy">There will be an airdrop. 25% of platform fees is airdropped on the 1st of each month, in SOL or ETH, to wallets that completed a launch on LIFT (drafts do not count). 25% buys $LIFT and burns it. 50% runs the product. No transfer tax.</p>
          <p className="modal-copy">Market data comes from DEX Screener. A listing is not an endorsement.</p>
          <p className="modal-copy">Community tokens can lose all their value. Stock Tokens provide economic exposure to underlying securities, not ownership of those securities. Pairing does not guarantee a token’s value.</p>
          <p className="modal-copy">Public Stock Token trading is unavailable until issuer eligibility, regional access and contract configurations are verified.</p>
          <ExternalLink href="https://docs.robinhood.com/chain/stock-tokens/">Read about Stock Tokens</ExternalLink>
        </Modal>
      )}
      {mobileMoreOpen && (
        <Modal title="More" onClose={() => setMobileMoreOpen(false)}>
          <div className="mobile-more-list">
            <Link href="/status" onClick={() => setMobileMoreOpen(false)}><Activity size={17} /><span>Network status</span><ArrowUpRight size={15} /></Link>
            <Link href="/#how-fees-work" onClick={() => setMobileMoreOpen(false)}><BookOpen size={17} /><span>How fees work</span><ArrowUpRight size={15} /></Link>
            <button type="button" onClick={() => { setMobileMoreOpen(false); setInfo(true); }}><ShieldAlert size={17} /><span>About &amp; risks</span><ArrowUpRight size={15} /></button>
          </div>
        </Modal>
      )}
      {toast && <div role="status" className="toast"><Check size={15} />{toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={14} /></button></div>}
    </div>
  );
}
