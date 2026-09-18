'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Star, Share2, LoaderCircle, Copy, Download } from 'lucide-react';
import { CHAINS, explorerUrl } from '@/lib/chains';
import type { Token, TradeQuote } from '@/lib/types';
import { isProtocolToken } from '@/lib/protocol';
import { money, percent, shortAddress } from '@/lib/format';
import { tradeQuoteAddress, tradeQuoteSymbol } from '@/lib/trade-quote';
import type { WalletState } from './launchpad';
import { ChainIcon, TokenIcon, Modal, ExternalLink, Wordmark } from './ui';
import { ProtocolBurnPanel } from './protocol';
import { DailyChart, NetworkRankBadge, type SnapshotInsights } from './daily-chart';

export function TokenDetail({
  token,
  saved,
  onWatch,
  wallet,
  openWallet,
  notify,
}: {
  token: Token;
  saved: boolean;
  onWatch: () => void;
  wallet: WalletState;
  openWallet: () => void;
  notify: (m: string) => void;
}) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState('0.5');
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hash, setHash] = useState('');
  const [txStatus, setTxStatus] = useState('');
  const [share, setShare] = useState(false);
  const [copied, setCopied] = useState(false);
  const [insights, setInsights] = useState<SnapshotInsights | null>(null);
  const liftLaunch = token.source === 'liftpad';
  const paySymbol = side === 'buy' ? tradeQuoteSymbol(token) : token.symbol;
  const receiveSymbol = side === 'buy' ? token.symbol : tradeQuoteSymbol(token);

  useEffect(() => {
    setQuote(null);
    setError('');
  }, [side, amount, slippage, wallet.address, token.address]);

  async function copyContract() {
    try {
      await navigator.clipboard.writeText(token.address);
      setCopied(true);
      notify('Contract copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notify('Could not access clipboard.');
    }
  }

  async function requestQuote() {
    if (!wallet.address || !wallet.matches(token.chain)) {
      openWallet();
      return;
    }
    setBusy(true);
    setError('');
    try {
      const quoteAddr = tradeQuoteAddress(token);
      const r = await fetch('/api/trade/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chain: token.chain,
          pool: token.poolAddress || token.address,
          tokenIn: side === 'buy' ? quoteAddr : token.address,
          tokenOut: side === 'buy' ? token.address : quoteAddr,
          amountIn: amount,
          slippageBps: Math.round(Number(slippage) * 100),
          account: wallet.address,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not get a quote.');
      setQuote(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not get a quote.');
    } finally {
      setBusy(false);
    }
  }

  async function execute() {
    if (!quote) return;
    if (!wallet.matches(token.chain)) {
      openWallet();
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (quote.approval) await wallet.send(quote.approval);
      const h = await wallet.send(quote.transaction);
      setHash(h);
      setTxStatus('Submitted · Waiting for confirmation');
      setQuote(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transaction was not submitted.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!hash) return;
    let cancelled = false;
    let count = 0;
    const poll = async () => {
      count++;
      try {
        const r = await fetch(`/api/transactions/${token.chain}/${hash}`);
        const d = await r.json();
        if (cancelled) return;
        if (d.status === 'confirmed') {
          setTxStatus('Confirmed on-chain');
          clearInterval(timer);
        } else if (d.status === 'failed') {
          setTxStatus('Transaction reverted');
          clearInterval(timer);
        } else if (count >= 30) {
          setTxStatus('Still pending. Check the transaction in the explorer.');
          clearInterval(timer);
        }
      } catch {
        if (!cancelled) setTxStatus('Confirmation unavailable. Check the explorer.');
      }
    };
    const timer = setInterval(poll, 4000);
    poll();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [hash, token.chain]);

  return (
    <section className="detail-page">
      <Link href="/" className="back-link">
        <ArrowLeft size={14} /> All tokens
      </Link>

      <div className="token-detail-heading">
        <div>
          <TokenIcon token={token} large />
          <span>
            <h1>
              {token.name}
              <span className="symbol">${token.symbol}</span>
            </h1>
            <span className="detail-chain">
              <ChainIcon chain={token.chain} />
              {CHAINS[token.chain].name}
              <span>·</span>
              Paired with {token.quoteSymbol}
            </span>
          </span>
        </div>
        <div className="detail-actions">
          <button
            className={`icon-button ${saved ? 'saved' : ''}`}
            onClick={onWatch}
            aria-label="Toggle watchlist"
            aria-pressed={saved}
          >
            <Star size={18} fill={saved ? 'currentColor' : 'none'} />
          </button>
          <button className="secondary-button" onClick={() => setShare(true)}>
            <Share2 size={14} />
            Share
          </button>
        </div>
      </div>

      {isProtocolToken(token) && <ProtocolBurnPanel />}

      <div className="demo-notice">
        <span className="live-dot" />
        {liftLaunch ? (
          <>Launched on LIFT{token.chain === 'solana' ? ' · LaunchLab curve trades in SOL' : ''}.</>
        ) : (
          <>Not launched on LIFT · Buy and sell use the existing pool ({token.dexId || 'DEX'}).</>
        )}
      </div>

      <div className="contract-card">
        <div className="contract-card-main">
          <span className="contract-label">Contract</span>
          <code className="contract-address" title={token.address}>
            {shortAddress(token.address)}
          </code>
          <span className="contract-full" aria-hidden="true">
            {token.address}
          </span>
        </div>
        <div className="contract-card-actions">
          <button type="button" className="secondary-button" onClick={copyContract}>
            <Copy size={14} />
            {copied ? 'Copied' : 'Copy'}
          </button>
          <ExternalLink href={explorerUrl(token.chain, 'token', token.address)}>
            Explorer
          </ExternalLink>
        </div>
      </div>

      <div className="detail-layout">
        <div className="trade-panel">
          <div className="trade-tabs">
            <button className={side === 'buy' ? 'active' : ''} onClick={() => setSide('buy')}>
              Buy
            </button>
            <button className={side === 'sell' ? 'active' : ''} onClick={() => setSide('sell')}>
              Sell
            </button>
          </div>

          {liftLaunch && token.chain === 'solana' && (
            <p className="trade-ready-note">
              Trade against the LaunchLab bonding curve. Quotes work even before DEX Screener indexes the pool.
            </p>
          )}
          {liftLaunch && token.chain !== 'solana' && (
            <p className="trade-ready-note">
              Sell receives {tradeQuoteSymbol(token)}. First sell asks for a token approval, then the swap.
            </p>
          )}

          <label>
            You pay
            <div className="trade-amount">
              <input
                aria-label="Trade amount"
                placeholder="0.00"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <span>{paySymbol}</span>
            </div>
          </label>
          <div className="amount-presets">
            {['0.1', '0.5', '1', '5'].map((n) => (
              <button key={n} type="button" onClick={() => setAmount(n)}>
                {n}
              </button>
            ))}
          </div>
          <div className="trade-meta">
            <span>Slippage tolerance</span>
            <label>
              <select aria-label="Slippage tolerance" value={slippage} onChange={(e) => setSlippage(e.target.value)}>
                <option value="0.1">0.1%</option>
                <option value="0.5">0.5%</option>
                <option value="1">1%</option>
                <option value="3">3%</option>
              </select>
            </label>
          </div>
          <div className="trade-meta">
            <span>Receive</span>
            <strong>
              {quote ? quote.amountOut : '—'} {receiveSymbol}
            </strong>
          </div>
          {quote && (
            <div className="notice">
              Minimum received: {quote.minimumOut}. Quote expires in ~30 seconds. Network fees are additional
              {quote.source === 'launchlab' ? ' · 0.25% LaunchLab fee' : ''}.
            </div>
          )}
          {quote ? (
            <button className="primary-button full" disabled={busy} onClick={execute}>
              {busy ? 'Waiting for wallet…' : 'Review in wallet'}
              <ArrowUpRight size={15} />
            </button>
          ) : (
            <button
              className="primary-button full"
              disabled={busy || (!amount && !!wallet.address)}
              onClick={requestQuote}
            >
              {busy ? 'Getting quote…' : wallet.address ? 'Get quote' : 'Connect wallet'}
              {busy ? <LoaderCircle size={15} className="spin" /> : <ArrowUpRight size={15} />}
            </button>
          )}
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          {hash && (
            <div className="notice">
              <p>{txStatus}</p>
              <ExternalLink href={explorerUrl(token.chain, 'tx', hash)}>View transaction</ExternalLink>
            </div>
          )}
          <p className="fine-print">
            Your wallet. Your signature.
            <br />
            Every trade is yours to approve.
          </p>
        </div>

        <div className="chart-panel">
          <div className="price-heading">
            <div>
              <span className="eyebrow">PRICE IN USD</span>
              <h2>
                {money(token.priceUsd, false)}
                <span className={(token.change24h ?? 0) < 0 ? 'negative' : 'positive'}>{percent(token.change24h)}</span>
              </h2>
            </div>
            <span className="badge">24H</span>
            <NetworkRankBadge insights={insights} chain={token.chain} />
          </div>
          <DailyChart
            chain={token.chain}
            pool={token.poolAddress || token.address}
            explorerHref={token.url}
            onInsights={setInsights}
          />
          <div className="token-stats">
            {[
              ['Market cap', money(token.marketCap)],
              ['24h volume', money(token.volume24h)],
              ['Liquidity', money(token.liquidityUsd)],
            ].map(([k, v]) => (
              <div key={k}>
                <span>{k}</span>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="token-about">
        <div>
          <h3>Behind the token</h3>
          <p>{token.description || 'No creator description is available for this token.'}</p>
        </div>
        <div>
          <h3>The details</h3>
          <div className="review-list">
            <div>
              <span>Token contract</span>
              <ExternalLink href={explorerUrl(token.chain, 'token', token.address)}>{shortAddress(token.address)}</ExternalLink>
            </div>
            <div>
              <span>Full address</span>
              <strong style={{ wordBreak: 'break-all', fontSize: 12 }}>{token.address}</strong>
            </div>
            <div>
              <span>Data source</span>
              <strong>
                {token.source === 'liftpad' ? 'LIFT' : token.source === 'dexscreener' ? 'DEX Screener' : token.source}
              </strong>
            </div>
            <div>
              <span>Observed at</span>
              <strong>
                {new Date(token.observedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {share && (
        <Modal title="Good things are worth sharing." onClose={() => setShare(false)}>
          <div className="share-card">
            <Wordmark small />
            <TokenIcon token={token} large />
            <h2>{token.name}</h2>
            <p>
              ${token.symbol} / {token.quoteSymbol}
            </p>
            <span>
              {CHAINS[token.chain].name} · Live market
            </span>
          </div>
          <button
            className="primary-button full"
            onClick={() =>
              navigator.clipboard
                .writeText(location.href)
                .then(() => notify('Link copied'))
                .catch(() => notify('Could not access clipboard.'))
            }
          >
            Copy token link <Copy size={15} />
          </button>
          <a
            className="secondary-button full"
            download
            href={`/api/share?chain=${token.chain}&pool=${encodeURIComponent(token.poolAddress || token.address)}`}
          >
            Download card <Download size={15} />
          </a>
        </Modal>
      )}
    </section>
  );
}
