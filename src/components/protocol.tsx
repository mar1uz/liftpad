'use client';
import { useEffect, useState } from 'react';
import { PROTOCOL, protocolSnapshot, type ProtocolSnapshot } from '@/lib/protocol';
import { money } from '@/lib/format';

function useProtocolSnapshot() {
  const [snap, setSnap] = useState<ProtocolSnapshot>(() => protocolSnapshot());
  useEffect(() => {
    const id = setInterval(() => setSnap(protocolSnapshot()), 2000);
    return () => clearInterval(id);
  }, []);
  return snap;
}

function tokens(n: number) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export function ProtocolHow() {
  return (
    <section className="protocol-how" id="how-fees-work">
      <div className="protocol-how-head">
        <span className="eyebrow">AIRDROP · 25% OF FEES</span>
        <h2>Launch here. You’re in the airdrop<span>.</span></h2>
        <p>
          A quarter of every LIFT platform fee is airdropped on the 1st of each month, in SOL or ETH,
          to wallets that finished a launch on this launchpad. Drafts do not count.
          Another quarter buys $LIFT and burns it. Half runs the product.
          Gas stays with the signer. Liquidity stays with the creator.
        </p>
      </div>
      <div className="protocol-split protocol-split-lg" aria-hidden="true">
        <span className="keep-half">50% run</span>
        <span className="airdrop-half">25% airdrop</span>
        <span className="burn-half">25% burn</span>
      </div>
    </section>
  );
}

export function ProtocolBurnPanel() {
  const snap = useProtocolSnapshot();
  return (
    <div className="protocol-panel">
      <div className="protocol-panel-head">
        <span className="new-tag">AIRDROP</span>
        <p>
          There will be an airdrop. 25% of every platform fee is sent on the 1st of each month, in SOL or ETH, to wallets that launched a token here.
          Another 25% buys ${PROTOCOL.symbol} and burns it. The remaining 50% runs the product. No tax on transfers.
        </p>
      </div>
      <div className="protocol-metrics">
        <div><span>Fees collected</span><strong>{money(snap.feesUsd)}</strong></div>
        <div><span>Airdrop pool</span><strong>{money(snap.creatorUsd)}</strong></div>
        <div><span>Bought &amp; burned</span><strong>{money(snap.burnedUsd)}</strong></div>
        <div><span>$LIFT burned</span><strong>{tokens(snap.burnedTokens)}</strong></div>
      </div>
      <div className="protocol-split" aria-hidden="true">
        <span className="keep-half">50% run</span>
        <span className="airdrop-half">25% airdrop</span>
        <span className="burn-half">25% burn</span>
      </div>
      <div className="burn-track">
        <span style={{ width: `${Math.max(4, Math.min(100, snap.burnedPct))}%` }} />
      </div>
      <small>
        {snap.burnedPct.toFixed(2)}% of {tokens(PROTOCOL.totalSupply)} supply burned · ~{money(snap.perCreatorUsd)} / eligible wallet this epoch
      </small>
    </div>
  );
}
