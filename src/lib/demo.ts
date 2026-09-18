import type { Token } from './types';
const observedAt = '2026-09-10T08:00:00Z';
const base = { source: 'demo' as const, observedAt, address: '', priceUsd: .000148, volume24h: 48200, liquidityUsd: 25000, marketCap: 148000, change24h: 12.8 };
export const DEMO_TOKENS: Token[] = [
  {...base,id:'demo-lift',chain:'solana',name:'LIFT',symbol:'LIFT',quoteSymbol:'SOL',mark:'↑',color:'#f04b2f',marketCap:4920000,priceUsd:.00492,volume24h:612000,change24h:6.1,liquidityUsd:380000,description:'The LIFT protocol token. 25% of platform fees buy $LIFT and burn it. 25% is airdropped to wallets that launch here.'},
  {...base,id:'demo-orbit',chain:'robinhood',name:'Orbit',symbol:'ORBIT',quoteSymbol:'NVDA Stock Token',mark:'OR',color:'#f04b2f',marketCap:1240000,priceUsd:.00124,volume24h:284000,change24h:24.8,description:'For the ideas that refuse to stay grounded. A community exploring what comes next.'},
  {...base,id:'demo-moss',chain:'solana',name:'Moss',symbol:'MOSS',quoteSymbol:'SOL',mark:'MS',color:'#c4a07a',marketCap:842000,volume24h:167000,change24h:16.2,description:'Slow growth. Strong roots. A small corner of the internet with room to grow.'},
  {...base,id:'demo-afterhours',chain:'robinhood',name:'After Hours',symbol:'AFTER',quoteSymbol:'AAPL Stock Token',mark:'AH',color:'#b89bb8',marketCap:628000,volume24h:94500,change24h:8.4,description:'The best ideas happen after hours. A gathering place for curious minds.'},
  {...base,id:'demo-pebble',chain:'base',name:'Pebble',symbol:'PBL',quoteSymbol:'ETH',mark:'PB',color:'#e0c8a0',marketCap:391000,volume24h:68400,change24h:-3.2,description:'One small thing can make a ripple.'},
  {...base,id:'demo-pixel',chain:'bsc',name:'Pixel Club',symbol:'PXL',quoteSymbol:'BNB',mark:'PX',color:'#f0a45a',marketCap:287000,volume24h:42600,change24h:11.7},
  {...base,id:'demo-tide',chain:'hyperevm',name:'Tide',symbol:'TIDE',quoteSymbol:'HYPE',mark:'TD',color:'#4fd4c8',marketCap:215000,volume24h:31900,change24h:6.3},
  {...base,id:'demo-sunday',chain:'arbitrum',name:'Sunday',symbol:'SUN',quoteSymbol:'ETH',mark:'SU',color:'#28a0f0',marketCap:172000,volume24h:22400,change24h:-1.4},
  {...base,id:'demo-field',chain:'solana',name:'Field Notes',symbol:'FIELD',quoteSymbol:'SOL',mark:'FN',color:'#8fb4e8',marketCap:96000,volume24h:17300,change24h:4.9}
];
export function demoSeries(seed = 1) {
  let state = (Math.imul(seed + 1, 0x9e3779b9) >>> 0) || 1;
  const rand = () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17; state >>>= 0;
    state ^= state << 5; state >>>= 0;
    return state / 4294967296;
  };
  let value = 36 + rand() * 22;
  const drift = (rand() - 0.46) * 0.22;
  return Array.from({ length: 72 }, (_, i) => {
    const burst = rand() < 0.045 ? (rand() - 0.5) * 11 : 0;
    const step = rand() < 0.14 ? 0 : (rand() - 0.5) * 2.1;
    value = Math.max(6, value + drift + step + burst);
    if (i > 48 && rand() < 0.2) value += (rand() - 0.35) * 1.4;
    return { x: i, y: value };
  });
}
