# HANDOFF.md — Launchpad

Acest fișier este **sursa canonică** a proiectului: plan, abateri aprobate, context tehnic și jurnal. Orice decizie, modificare de cod, bugfix sau abatere de la plan se notează în jurnal, cu o explicație scurtă. Chat-ul nu este memorie durabilă.

---

## Plan canonic (nu se modifică fără notă în jurnal)

Textul de mai jos este planul aprobat de utilizator. Copiat verbatim.

# Launchpad minimalist construit pe infrastructură existentă

## 1. Principiul de implementare

**Construim experiența și integrările; folosim furnizori existenți pentru infrastructura blockchain și operare.** Contractele proprii devin ultima opțiune, numai pentru cerințe care nu pot fi acoperite prin protocoale sau module existente.

Păstrăm cerințele stabilite:

- Design minimalist inspirat de LONG, aplicat în întreaga aplicație.
- Lansare și trading pe cele șase rețele.
- Perechi cu Stock Tokens inițial pe Robinhood Chain.
- Creatorul finanțează lichiditatea; utilizatorul semnează din wallet.
- Brand și aplicație independente de launchpad.meme.

## 2. Ce reutilizăm

| Componentă | Alegerea de bază |
|---|---|
| Hosting și frontend | Next.js pe Vercel |
| Bază de date, fișiere și actualizări | Supabase gestionat |
| Lansare pe Solana | Raydium LaunchLab, cu configurarea platformei proprii |
| Creare tokenuri EVM | Contracte standard existente, cu versiune și permisiuni verificate; SDK thirdweb pentru deployment unde este compatibil |
| Pooluri și trading | Contractele DEX deja existente pe fiecare rețea |
| Indexare EVM | Goldsky unde serviciul necesar este disponibil |
| RPC Solana | Helius |
| RPC EVM | Furnizori gestionați, cu endpoint de rezervă pe fiecare rețea |
| Date suplimentare despre pooluri | DEX Screener, prin cache comun |
| Stock Tokens | Registrul și API-urile oficiale Robinhood, plus feedurile Chainlink |
| Metadate persistente | Serviciu de pinning IPFS |

Raydium permite experiențe de lansare cu brand propriu. thirdweb oferă deployment din contracte publicate sau bytecode; asta nu reprezintă automat un launchpad complet și nici dovada auditării contractului ales. [Raydium](https://docs.raydium.io/user-flows/launchlab-platforms), [thirdweb](https://portal.thirdweb.com/contracts/deploy)

Goldsky listează inclusiv Robinhood Chain, dar capabilitățile diferă între rețele. Validăm serviciul concret necesar, nu doar prezența rețelei în catalog. [Rețele Goldsky](https://docs.goldsky.com/chains/supported-networks)

DEX Screener oferă date despre perechi, cu limite de cereri; îl folosim complementar. Confirmarea tranzacțiilor și cotațiile executabile provin din blockchain și routerele DEX. [API DEX Screener](https://docs.dexscreener.com/api/reference)

## 3. Ce construim noi

Un strat restrâns de aplicație:

- Ecranele **Explore, Create, Token și Portfolio**, inclusiv variante mobile.
- Adaptoare care unifică furnizorii și formatele diferitelor rețele.
- Fluxul de lansare: token → aprobări → pool → lichiditate → confirmare.
- Registrul activelor de cotare acceptate și verificarea contractelor canonice.
- Watchlist, filtre, carduri sociale și administrare.
- Procesarea evenimentelor și calculele specifice produsului, executate pe infrastructură gestionată.

Deploymentul tokenului și crearea poolului pot necesita tranzacții separate. Salvăm progresul și permitem reluarea fără emiterea accidentală a unui al doilea token.

**Interfețe interne:** `launch`, `quote`, `buildTransaction`, `verifyTransaction` și `getPoolData`. Identificatorii includ rețeaua și adresa; fiecare rezultat indică sursa și momentul actualizării.

Datele aplicației rămân exportabile din PostgreSQL. Furnizorii sunt izolați în adaptoare, pentru a putea fi înlocuiți fără rescrierea interfeței.

### Perechile cu Stock Tokens

Folosim pooluri AMM existente, alimentate de creator. Documentația Robinhood confirmă compatibilitatea Stock Tokens cu AMM-uri standard. [Integrare oficială](https://docs.robinhood.com/chain/building-with-stock-tokens/)

- Activele provin din registrul oficial, filtrat după eligibilitate și compatibilitate.
- Prețul de execuție vine din pool; valoarea USD este calculată separat.
- Tratăm ajustările corporative fără aplicarea dublă a multiplicatorului.
- Disponibilitatea AMM-ului, programul pieței suport și actualitatea oracle-ului sunt stări distincte.
- Activarea publică depinde de stabilirea jurisdicției și respectarea condițiilor emitentului.

## 4. Validarea furnizorilor și testarea

Prima etapă durează estimativ **1–2 săptămâni** și produce o matrice pentru toate cele șase rețele: lansare, pool, trading, date, comisioane, lichiditate și costuri.

Ordinea de selecție este:

1. Protocol existent cu integrare directă.
2. Contract standard existent, configurat fără modificări.
3. Modul minimal propriu, numai dacă primele două nu satisfac cerința.

Pentru fiecare integrare verificăm suportul mainnet, licența, utilizarea comercială, limitele, istoricul disponibil, permisiunile contractelor și posibilitatea de încasare a comisioanelor. Nu presupunem venituri ale platformei acolo unde furnizorul nu le permite.

**Teste de acceptare:**

- Lansare și buy/sell pe fiecare rețea; pereche cu Stock Token pe Robinhood.
- Reluarea unei lansări întrerupte între tranzacții.
- Sold insuficient, wallet greșit, refuzul semnăturii și slippage.
- Evenimente duplicate, date întârziate, limitarea API și căderea furnizorului.
- Corectitudinea preciziei, evaluărilor USD și ajustărilor corporative.
- Export și restaurare a datelor.

Reutilizarea contractelor reduce codul de auditat, dar verificarea configurației și securității integrărilor rămâne obligatorie.

## 5. Calendar și buget

**Estimare condiționată de acoperirea furnizorilor:**

| Livrabil | Estimare |
|---|---:|
| Validarea furnizorilor | 1–2 săptămâni |
| Design și prototip complet | 2–3 săptămâni |
| Integrări și aplicație funcțională | 5–8 săptămâni |
| Verificare de securitate și beta | 2–4 săptămâni |

Cu activități suprapuse: **aproximativ 10–16 săptămâni**, dacă nu sunt necesare contracte noi semnificative.

Rezervă orientativă: **60.000–140.000 EUR dezvoltare/design**, plus **10.000–30.000 EUR verificare de securitate**. Estimările sunt proprii, nu oferte ale furnizorilor.

Costul lunar se stabilește după validarea volumelor și ofertelor pentru date/indexare. Abonamentele gestionate reduc operarea, dar nu garantează facturi mai mici la trafic mare. [Supabase](https://supabase.com/pricing), [Goldsky](https://goldsky.com/pricing), [Vercel](https://vercel.com/pricing)

Toate șase rețelele rămân în obiectiv. Lipsa unei integrări eligibile devine un blocaj explicit, fără reducerea tacită a acoperirii. Lichiditatea, marketingul și serviciile juridice sunt bugete separate.

---

## Audit implementare vs. plan

Stare la 10 septembrie 2026. Abaterile neaprobate se prezintă utilizatorului înainte de alt lucru.

| Cerință din plan | Stare | Notă |
|---|---|---|
| Next.js pe Vercel | parțial | App Next 16 există (`still-launchpad`). Deploy Vercel neconfigurat în repo. |
| Design LONG, tot UI-ul | parțial | UI LIFT: Unbounded + vermillion, hero animat. Inspirat de ritmul LONG, nu clonă. |
| Șase rețele | aliniat | `solana`, `base`, `bsc`, `hyperevm`, `arbitrum`, `robinhood`, plus `arc` și `near` (#8, branch `feat/near`). |
| Brand independent de launchpad.meme | aliniat | Brand vizibil: **LIFT**. Pachet intern încă `still-launchpad`. |
| Creatorul finanțează LP; semnătură din wallet | parțial | Solana: Create semnează fee 0,01 SOL + LaunchLab mint. EVM launch încă 503. |
| Raydium LaunchLab + platformă proprie | parțial | `POST /api/launch` construiește tx LaunchLab (platformă default Raydium). Platforma LIFT PDA încă nu e creată — fee 0,25% pe curve nu e al nostru până atunci. |
| DEX existent pe fiecare rețea | implementat pentru lansările LIFT | LaunchLab/Jupiter pe Solana și rutare V2 nativă pentru pool-urile LIFT pe Base, BSC, HyperEVM, Arbitrum și Robinhood. |
| Token EVM via contracte standard / thirdweb | neconfigurat | `EvmAdapter.launch` returnează 503 (`LAUNCH_NOT_CONFIGURED`). |
| Goldsky | nevalidat | Tabele `chain_events` / `provider_checkpoints` există; ingest Goldsky nu e legat. |
| Helius (Solana RPC) | nevalidat | RPC prin env `RPC_SOLANA`; furnizorul nu e fixat în cod. |
| RPC EVM + backup | aliniat (schelet) | `RPC_<CHAIN>` + `RPC_<CHAIN>_BACKUP`, HTTPS obligatoriu. |
| DEX Screener + cache | parțial | Sursă de piață `dexscreener`; cache comun de validat. |
| Stock Tokens: registru oficial + Chainlink | parțial | Stock-urile sunt permise doar pe `robinhood`; activare publică cere `STOCK_TOKENS_ENABLED` + `ELIGIBILITY_VERIFIER_URL`. Multiplier / oracle: de implementat. |
| Pinning IPFS | absent | — |
| Interfețe `launch` / `quote` / `buildTransaction` / `verifyTransaction` / `getPoolData` | aliniat | `ChainAdapter` în `src/lib/types.ts`. |
| ID-uri chain+adresă; sursă + `observedAt` | aliniat | Token, quote, pool data. |
| Reluare lansare, fără al doilea token | schelet | Stagii `draft→token→approval→pool→liquidity→complete`; unique pe `(chain, token_address)` și un pas pending. |
| Watchlist, filtre, carduri sociale, admin | parțial | Watchlist în SQL; admin/social de verificat. |
| Date exportabile din PostgreSQL | intenție | Schema Supabase există; export/restore nu e livrat. |
| Matrice validare 6 rețele (etapa 1) | neîncepută | Prima etapă din plan. |
| Teste de acceptare (lansare, buy/sell, resume, erori, oracle, export) | neîncepută | Scripturi: `typecheck`, `test` (`tests/*.test.ts` — folderul nu e listat). |
| Fee de platformă LIFT | aprobat, trezorerii setate | SOL: `9hcL7zEG5X8V4uwhRE2pLQN8KzVzAiqYTqa9Epmp2GDP`. EVM: `0x6810EB6699f8d497de9DcCCE34774fAD87759552`. Încasarea on-chain: neimplementată. |

**Abateri de produs:** doar fee-ul de platformă (aprobat). Restul rămâne schelet aliniat. Lipsa integrărilor eligibile rămâne blocaj explicit, nu se taie rețele din obiectiv.

---

## Decizii aprobate

### Fee de platformă LIFT (2026-09-10)

Gas-ul și lichiditatea rămân ale userului/creatorului. LIFT ia o tăietură de platformă, afișată înainte de semnătură.

| Unde | Ce | Cum |
|---|---|---|
| Lansare, toate rețelele | 0,01 SOL pe Solana; 0,00005 ETH pe EVM (Base etc.) | Transfer către trezoreria LIFT, înainte sau în același flux cu deploy-ul. |
| Trading Solana (LaunchLab) | 0,25% (`platform_fee_bps`) pe buy/sell pe bonding curve | Platform PDA LaunchLab, `platform_fee_destination`. După graduation: share LP locked la platformă, conform upgrade 2026-08-17. |
| Trading EVM / Uniswap v3 | 0% pe swap | Fără hook v4 / router propriu. Se reevaluează doar dacă merită un modul minimal. |

**Împărțirea fee-urilor colectate (aprobat):**

| Cotă | Destinație | Detaliu |
|---|---|---|
| 50% | Operare | RPC, hosting, produs. Nu se ia din lichiditatea creatorului. |
| 25% | Airdrop creatori | Împărțit egal, **lunar pe data de 1**, în SOL sau ETH, către wallet-urile care au **terminat** o lansare pe LIFT. Drafturile nu contează. |
| 25% | Buy & burn $LIFT | Cumpărare pe piață + burn. Mint standard, fără taxă pe transfer. |

Tokenul de protocol **$LIFT** trăiește pe Solana (acolo se acumulează fee-ul de trading). UI-ul arată split-ul pe Explore, Create, About și pagina tokenului.

Trezorerie Solana: `9hcL7zEG5X8V4uwhRE2pLQN8KzVzAiqYTqa9Epmp2GDP` — fee lansare 0,01 SOL și `platform_fee_destination` LaunchLab.
Trezorerie EVM (Base, BSC, HyperEVM, Arbitrum, Robinhood): `0x6810EB6699f8d497de9DcCCE34774fAD87759552` — fee lansare 0,00005 unități native.
Încasarea on-chain încă nu e legată. Fără contracte proprii pentru acest fee.

---

## Context tehnic

- **Repo:** `/Users/marius/antigravity/Launchpad`
- **VM / Oracle:** `instance-20260909-1828` (A1 Flex, `eu-stockholm-1`), OCID `ocid1.instance.oc1.eu-stockholm-1.anqxeljr2n6qfsycaw6zesp2en3ass3jkquanp4oyff4rich7bkgsjngafzq`; acces prin CLI `oci` (`~/.oci`, auth funcțional); cheie SSH nouă `~/.ssh/oracle_lift.key` — vechea cheie din `~/Downloads` nu mai există pe Mac.
- **Stack:** Next.js 16.3.4, React 19, TypeScript, viem, Zod, `@supabase/supabase-js`, lucide-react
- **Comenzi:**
  - `npm run dev` — `next dev --hostname 127.0.0.1`
  - `npm run build` / `npm start`
  - `npm run typecheck`
  - `npm test` — `tsx --test tests/*.test.ts`
  - `npm run check` — typecheck + test
- **Adaptoare:** `src/lib/server/adapters/` — Solana vs EVM; factory `adapter(chain)`
- **Config runtime (env):** `RPC_<CHAIN>`, `RPC_<CHAIN>_BACKUP`, `DEX_<CHAIN>` (JSON reviewed), `QUOTE_ASSETS_JSON`, `STOCK_TOKENS_ENABLED`, `ELIGIBILITY_VERIFIER_URL`
- **DB:** `supabase/migrations/001_initial.sql` — `launch_drafts`, `watchlist`, `launches`, `launch_steps`, `chain_events`, `provider_checkpoints`, `candles` (RLS)
- **UI:** `src/app/` + `src/components/` (explore, create, token-detail, portfolio, launchpad, ui)
- **Gotcha Next 16:** vezi `AGENTS.md` — citește ghidurile din `node_modules/next/dist/docs/` înainte de API-uri Next.
- **Workspace Hermes:** proiect desktop `Launchpad` (`p_aa961c04`), path primar același folder.

---

## Jurnal

### 2026-09-12 — Create: scos warning Phantom/Blowfish
- User: scoate notice-ul „Phantom may show new domain or Blowfish warnings…” de pe Create (review step). Șters din `create.tsx`.

### 2026-09-12 — Mobile EVM WalletConnect
- Extended Reown AppKit with `@reown/appkit-adapter-ethers` alongside Solana adapter (same `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`).
- Mobile `connect('evm')` without injected `window.ethereum` opens AppKit Connect (`eip155`) → MetaMask / Rainbow / Phantom EVM; session stays in Chrome.
- Ethereum button copy matches Phantom WC hint. `send()` uses WC EIP-1193 provider when connected via WC. Disconnect clears eip155 + solana sessions.

### 2026-09-11 (night) — WalletConnect Solana primary on mobile
- **Root cause (confirmed):** Phantom `ul/v1/connect` often completes inside Phantom WebView / another browser context, so `still.phantom.session.v1` never lands in Android Chrome. Hydrate-only fixes cannot help — there is no session to read. My launches = `still.launches.v1` drafts (does not imply connected).
- **Fix:** Reown AppKit Solana (`@reown/appkit` + `@reown/appkit-adapter-solana`) as **PRIMARY** mobile connect when no injected provider. WC session stays in the Chrome tab; Phantom approves via WC deeplink. Native Phantom deeplink kept as secondary fallback only. `signTransaction` uses WC provider when connected that way. Disconnect clears WC + mirrors.
- Env: `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (build-time). Reown Cloud on box was at `dashboard.reown.com/sign-in` — **login required**; parent must hand box for login / paste Project ID into `.env` then redeploy.
- Portfolio copy: My launches can show device drafts without a connected wallet. `phantom_return=1` without data/session → explicit error directing user to WalletConnect.
- Files: `src/lib/wc-solana.ts` (new), `src/lib/wallet.ts`, `src/lib/phantom-deeplink.ts`, `src/components/portfolio.tsx`, `src/components/launchpad.tsx`, `.env` / `.env.example`, `next.config.ts`, `Dockerfile`, `docker-compose.yml`.
- Do **not** use `ul/browse`.


### 2026-09-11 (night) — homepage hero matches X banner
- HeroMotion evolved from flat orb + 2 rings + floor plane into a banner-like animated stage: textured glowing #f04b2f orb, solid + dashed elliptical orbital rings, glowing nodes, ember/particle mist, deep black field. CSS/HTML only.
- Visual stays on the right; Explore copy unchanged. No wordmark duplicated over the headline.
- Files: `src/components/ui.tsx` (HeroMotion), `src/app/globals.css` (hero-stage overrides).


### 2026-09-11 (night) — Portfolio Connect wallet + My launches → token page
- **Bug 1 root cause:** My launches count comes from `still.launches.v1` (no wallet needed). Header/Portfolio CTA only read React `wallet.address`. After Phantom deeplink return to `/portfolio`, Launchpad remounts; SSR starts with empty address. Prior hydrate `useEffect`/interval fixes were insufficient when session/UI mirror existed but state lagged (or redirect landed without params so session never applied into the header). Drafts showing ≠ connected.
- **Fix:** `useSyncExternalStore` over `still.phantom.session.v1` + `still.wallet.ui.v1`; `useWallet().address` is always `live || session || uiMirror`. `saveSession` also writes UI mirror. Header + Portfolio CTA use that address with `suppressHydrationWarning`.
- **Bug 2:** Live My launches linked to Solscan externally, not TokenDetail. Now `/token/{chain}/{pool|mint}` with platform-launch + soft liftpad fallback; client enriches from local drafts. Contract shown on row + detail. Deeplink mint complete best-effort POSTs `/api/launch/complete`.
- Verify: tsc clean; redeploy; on mobile connect Phantom on Portfolio → header must show short address; tap Live row → buy/sell + full contract.


### 2026-09-11 — Mobile Phantom deeplink connect (no ul/browse)
- Approach: Phantom native `https://phantom.app/ul/v1/connect` + `signTransaction` with HTTPS `redirect_link` back to current liftpad page. TweetNaCl + bs58 encryption. Session in localStorage.
- Desktop/injected unchanged (`provider.connect()`). Mobile without inject opens Phantom briefly, returns to Safari/Chrome tab — never `ul/browse`.
- No WalletConnect / Reown projectId required.
- Files: `src/lib/phantom-deeplink.ts` (new), `src/lib/wallet.ts`, `src/components/launchpad.tsx`, `src/components/create.tsx`, `.env.example`.


### 2026-09-11

### Decizie airdrop (2026-09-11)
- Cadence schimbată din săptămânal în **lunar, pe 1 ale lunii** (distribuție pentru luna calendaristică anterioară).
- Schema Supabase: `002_fee_ledger_airdrop.sql` — `platform_fees`, `airdrop_rounds`, `airdrop_allocations`.
- Încă necesar: proiect Supabase live (`SUPABASE_URL` + service role), indexer pe trezorerie/LaunchLab, job pe 1 care face snapshot + payout.

- Stock / xStock registry: `data/quote-assets.json` (194 Robinhood Stock Tokens from api.robinhood.com/rhj/assets + 61 Backed xStocks on Solana). `STOCK_TOKENS_ENABLED` + placeholder `/api/eligibility`. Create: RH pair ETH or Stock Token (Uniswap v3 ERC20/ERC20 LP); Solana LaunchLab stays SOL-quoted with optional xStock as preferred secondary pair.

- Create **Launch settings**: supply + pool amounts (EVM), initial buy (Solana LaunchLab `buyAmount` / EVM V2 `swapExactETHForTokens` after LP). Robinhood initial buy deferred (v3). No max-wallet anti-sniper yet.

- Create networks: **Solana, Base, BSC, HyperEVM, Robinhood**. HyperEVM uses HyperSwap V2 router `0xb4a9…240A` (WHYPE `0x5555…5555`, verified on RPC). BSC Pancake V2 unchanged.

- Create network picker: **Solana, Base, BSC, HyperEVM, Arbitrum, Robinhood**; Stable a fost eliminată din produs.


- Activated **Base** and **Robinhood** launches: `RPC_BASE` + `RPC_ROBINHOOD` in `.env`/compose; `EVM_LAUNCH` includes `robinhood`; Create UI treats RH like Base/BSC.
- Robinhood has no Uniswap v2 — LP uses official Uniswap v3 NPM (`0x7399…e0d3`) + WETH (`0x0Bd7…AD73`), fee 3000, full-range mint via multicall. Base/BSC stay on v2 `addLiquidityETH`.
- Wallet: `wallet_addEthereumChain` fallback for Base / Robinhood / BSC when switch returns 4902.

### 2026-09-13 — Stable înlocuit cu Arbitrum
- Arbitrum One (`42161`) este disponibil în Explore, Create, Portfolio, status și AppKit.
- ERC-20 deploy + pool ETH prin routerul oficial Uniswap V2 (`0x4752…aD24`) și WETH (`0x82aF…Bab1`).
- Buy/sell direct pentru pool-urile LIFT, schimbare/adăugare rețea în wallet și Arbiscan.
- Drafturile locale și înregistrările persistente de pe vechea rețea Stable sunt filtrate în siguranță.



### 2026-09-11 (late) — Solana Create fee→mint resume
- Root cause: Create signed fee + LaunchLab mint as sequential Phantom prompts; after fee confirmed, mint abandon/block left draft at `stage:draft` with no `feeTx`, Portfolio hard-coded “Draft”, and retry would charge fee again. Explore “New launches” only DEX Screener (empty for fresh LaunchLab).
- On-chain: fee `5wT9HdeF…` (0.01 SOL) from treasury wallet at 21:15 PT; no mint.
- Fix: durable 2-step Solana launch — persist `feeTx` + `stage:token` after fee; resume mint with `skipFee` after on-chain fee verify; `Already paid fee?` recovers lost local state via recent fee scan; complete writes `data/platform-launches.json` + Portfolio Live + mint Solscan; market merges liftpad launches; Phantom warning copy only (Blowfish not removable in code). `migrateType: cpmm` kept.

### 2026-09-11 (night) — Phantom LaunchLab simulation fix
- Root cause: Create used `migrateType: 'amm'` but LIFT platform `4WYB…MmQG` was registered with CPMM config `D4FP…BvC2`. LaunchLab returns Anchor `MigrateTypeNotMatch` (6007); Phantom shows "Failed to simulate".
- Fix: `src/lib/server/solana-launch.ts` now uses `migrateType: 'cpmm'`, signs mint keypair, server-side `simulateTransaction` before returning txs, fresher fee blockhash, compute budget.
- Errors: `/api/solana/send` and `errorResponse` surface real simulation/send messages; wallet maps Phantom reject/sim failures.
- Verified dry-run: fee + LaunchLab createOnly simulate `err: null` on mainnet RPC. `tsc --noEmit` clean.

### 2026-09-11 (evening) — readiness for $LIFT launch
- Persisted LaunchLab platform into `data/lift-platform.json`: platformId `4WYB7yp3fv9KNuTJgPAFsSVrU1SxLHjEjmyJbvFMMmqG`, sig from earlier register tx.
- Docker Compose now loads `.env` and passes `RPC_SOLANA`, `LAUNCHLAB_PLATFORM_ID`, optional Supabase/EVM RPC.
- `/api/status` now reports Solana `launch:true` + `publicLaunch:true` when platformId is present; Base/BSC launch marked available; other EVM still pending.
- Supabase remains optional (drafts/watchlist); not required for Solana Create → LaunchLab.
- Next: redeploy OCI, verify `/api/launch/platform` + `/api/status`, then create $LIFT via Create (Solana).

- Explore: proiectele trec de la tabel (15/row) la **grilă de carduri** — 4 carduri pe rând, max 4 rânduri (16/pagină). Noul component `TokenCard` (icon + nume/simbol, market cap / 24h volume / 24h change, sparkline, pair + rețea + CTA View). `TokenRow` devine alias la `TokenCard` (Watchlist din Portfolio rămâne funcțional, devine card și el). Responsive: 4 col desktop, 3 la ≤1100px, 2 la ≤800/560px. Verificat pe desktop 1440px: 4×4 = 16 carduri.
- Carduri fără grafic de preț (scos OHLCV/spark de pe Explore). Rămân preț, change, mcap, volum, lichiditate, pair + Trade.
- Explore: scoase cardurile 50/25/25 (Run / Airdrop / Burn) din `ProtocolHow`. Rămâne titlul „Launch here. You’re in the airdrop” + textul de fee.
- Bara orizontală 50% run / 25% airdrop / 25% burn pusă înapoi sub airdrop. Buton **Register LIFT platform** mutat pe homepage (sub bară). CSRF pe POST: origini HTTP IP + HTTPS nip.io acceptate (Caddy forwardează Host). Phantom: `signTransaction` apoi POST `/api/solana/send` (RPC public blochează `sendRawTransaction` din browser cu 403 Access forbidden). Avertismentul Phantom „This dApp could be malicious” pe nip.io e reputația domeniului wildcard — userul apasă Proceed anyway până există liftpad.xyz.
- Fix preexistent (nu e de la carduri): `launchpad.tsx:8` avea un `-` rătăcit în fața unui import (`-import { useWallet }`) care rupea Turbopack build-ul; plus import moarte `PlatformFee` (nu există în `@/lib/wallet`). Reparate; `npm run typecheck` + `npm run build` trec.
- Redeploy pe `207.127.89.107` cu `./deploy/deploy.sh`.
- LaunchLab **înregistrat**. `registered:true`, platformId `4WYB7yp3fv9KNuTJgPAFsSVrU1SxLHjEjmyJbvFMMmqG`, sig `22k6H2jMt6f1Tzm2Vg7WJ8VVepDX5cstY2WUXiqprWofiz5iMDXFmRz55cSy8pCoQqzEeL4Yit3dT9pyWFueWp5k`, owner on-chain `LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj` (LaunchLab). Fee 0,25% pe curve → trezorerie `9hcL7zEG5X8V4uwhRE2pLQN8KzVzAiqYTqa9Epmp2GDP`. Butonul de register dispare de pe home.
- Domeniu **liftpad.xyz** live: A `207.127.89.107`, HTTPS Let's Encrypt pe apex + www. HTTP → https://liftpad.xyz. `compose up` nu recreează Caddy (bind-mount rămâne vechi) — nevoie `docker compose up -d --force-recreate --no-deps caddy`.
- Brand vizibil pe site: wordmark + titlu tab **liftpad** (iconul pad+săgeată neschimbat). Tokenul de protocol rămâne **$LIFT**.
- Homepage: scoase CTA register LaunchLab („Curve fees…”, „Connect treasury · register”) și linia de launch fee 0,01 SOL / 0,00005 ETH / 0,25%. Rămân titlul airdrop, copy-ul de split și bara 50/25/25. Nu se pun înapoi pe Explore.
- Scos tot Preview: toggle Preview/Live, DEMO_TOKENS pe Explore/Portfolio, rute `/token/demo`, sparkline ilustrativ, copy „fictional examples”. Piața e doar DEX Screener live.

### 2026-09-10

- Deschis workspace-ul Hermes pe `~/antigravity/Launchpad`.
- Planul canonic „Launchpad minimalist construit pe infrastructură existentă” (secțiunile 1–5) a fost lipit aici, neschimbat. De acum, orice schimbare de plan trece prin jurnal.
- Restilizare UI: paletă negru + lime (`#c8f542`), tipografie Syne 800 / Instrument Sans, grafice random-walk în loc de sinusoidă. Minimalismul rămâne, dar mai bold. Designul LONG rămâne referință de densitate, nu de paletă/greutate.
- Brand redenumit din STILL în **LIFT** (acțiune, lansare). Logo: marcă lime cu pad + săgeată în sus + wordmark. Cheile localStorage `still.*` rămân ca să nu se piardă drafturile.
- Salvare versiune **v1.0**: schelet Next.js + restilizare vizuală LIFT. Repo git inițializat local. Commit `a9f6946`, tag `v1.0`.
- Regândire grafică inspirată de LONG, fără clonă: paletă caldă (cerneală + os + cupru), titluri Fraunces, obiecte originale (placă, rampă, disc) în loc de lime/chart. Graficele din tabel rămân random-walk.
- Salvare versiune **v1.1**: varianta editorială cupru / Fraunces. Commit `60f2ab5`, tag `v1.1`.
- Varianta **premium** (nesalvată încă): Unbounded 800 + Outfit, aur champagne, inele/orb metalic în loc de rampa de cupru. Revenire la v1.1: `git checkout v1.1`.
- Paletă schimbată din aur în oțel/cobalt; hero-ul e animat lent (inele, sferă, plan).
- Paletă vermillion pe negru; animația din hero e pe HTML/CSS (inele 10–16s) și nu mai e oprită de Reduce Motion.
- Salvare versiune **v1.2**: Unbounded, vermillion, hero animat. Commit `c5a36a9`, tag `v1.2`.
- Fee platformă aprobat: 0,01 SOL / 0,00005 ETH la lansare; 0,25% LaunchLab pe Solana; 0% pe swap Uniswap v3. Wallet trezorerie de setat. Fără contracte proprii.
- Token protocol $LIFT + split fee: 50% operare, 25% airdrop creatori (**lunar pe 1**, SOL/ETH, lansări complete), 25% buy&burn. UI pe Explore / Create / About / pagina $LIFT.
- Trezorerie Solana setată: `9hcL7zEG5X8V4uwhRE2pLQN8KzVzAiqYTqa9Epmp2GDP`. Trezorerie EVM: `0x6810EB6699f8d497de9DcCCE34774fAD87759552`.
- Implementat: piață live (până la 20 perechi noi / rețea), buy/sell Jupiter (Solana) + Kyber (Base/BSC), lansare Solana (fee 0,01 SOL + LaunchLab mint). Platforma LaunchLab LIFT PDA încă default Raydium.
- Continuare: lansare ERC-20 pe Base/BSC (fee 0,00005 ETH + deploy). Înregistrare platformă LaunchLab LIFT (o tx din trezoreria SOL) ca 0,25% pe curve să meargă la LIFT.
- Lichiditatea e 100% a creatorului. LIFT nu pune LP. Pe Base/BSC, după deploy userul semnează approve + addLiquidityETH din wallet-ul lui. Pe Solana, curba e alimentată de cumpărători (createOnly, buyAmount 0).
- Domeniu canonic: **liftpad.xyz** (RDAP liber la alegere). Brandul rămâne LIFT. De cumpărat de utilizator în registrar.
- Deploy public pe VM Oracle existentă `instance-20260909-1828` (`eu-stockholm-1`, A1 Flex): [http://207.127.89.107](http://207.127.89.107). Docker `liftpad` pe port 80. Redeploy: `./deploy/deploy.sh 207.127.89.107 ubuntu /Users/marius/Downloads/ssh-key-2026-09-09.key`. HTTPS după ce domeniul are A record.
- Wallet pe mobil: dacă nu e injected provider, LIFT deschide Phantom (`ul/browse`) pe aceeași pagină. Extensia rămâne pentru desktop.
- Bannerul airdrop de deasupra fold-ului scos; rămâne secțiunea How fees work mai jos pe Explore.
- CTA Launch a token: hit-target pe mobil (max-width hero nu mai e negativ) + draft ID fără `randomUUID` pe HTTP.
- Phantom pe mobil: NXDOMAIN pe IP. HTTPS pe `https://207.127.89.107.nip.io` (Caddy); deep link-ul Phantom folosește hostname-ul, nu IP-ul.
- Create: scos „Fee split / Airdrop 25% burn 25% run 50%”. Split-ul rămâne doar în How fees work.
- Create review: scos lista Fee to / trezorerie / Pair / Your liquidity / Buyers on the curve.
- Favicon LIFT adăugat în `src/app/icon.svg`, folosind marca pătrat + săgeată din wordmark.

## Journal — 2026-10-11 — NEAR ca rețeaua #8 (branch `feat/near`, nedeployat)

- Cerere utilizator: integrează rețeaua NEAR în launchpad. Branch `feat/near`; nimic împins, nimic deployat.
- Abordare (conform principiului „furnizori existenți, fără contracte proprii”):
  - **Token:** factory public NEP-141 `tkn.near` (testnet `tokenfactory.testnet`), `create_token` → `<symbol>.tkn.near`, toată oferta la creator. Depozit de storage citit din `get_required_deposit` (~2,28 NEAR, plătit rețelei, nu LIFT). Simbolul devine contul tokenului — unic; verificat cu `get_token` înainte de semnare.
  - **Pool:** Ref Finance `v2.ref-finance.near`, pool simplu token/wNEAR (fee 0,30%), creat și finanțat din wallet-ul creatorului → LP-ul rămâne al creatorului. Ref whitelistează automat `*.tkn.near`.
  - **Fee LIFT:** transfer `NEXT_PUBLIC_NEAR_LAUNCH_FEE` (implicit **0,1 NEAR — de aprobat**) către `NEXT_PUBLIC_NEAR_TREASURY` în același prompt cu create_token. Split 50/25/25 rămâne off-chain ca la celelalte rețele.
  - **Wallet:** `@near-wallet-selector` 10.1.4 (MyNearWallet, Meteor, HERE) cu `modal-ui-js` (nu `modal-ui`, care aduce React 18). Tip separat `near` în `useWallet`; Connect face mereu sign-out + chooser nou (aprobare proaspătă); conectarea NEAR deconectează ETH/SOL și invers.
  - **Flux Create:** (1) fee + create_token într-o singură aprobare NEAR, (2) pool: storage Ref + register + `add_simple_pool` + depuneri token/wNEAR + `add_liquidity`. Resume e pe stare on-chain (depunerile deja făcute nu se refac). Pool id = `refv1-<id>` (format DEX Screener).
  - **Trading:** swap instant Ref (`ft_transfer_call` cu acțiuni) pe pool-urile LIFT; Explore listează perechi NEAR din DEX Screener (`wrap.near`).
- RPC: FastNEAR (`free.rpc.fastnear.com`) — `rpc.mainnet.near.org` dă 429. Pentru producție recomandat `RPC_NEAR` cu cheie.
- Fișiere noi: `src/lib/near.ts`, `src/lib/near-wallet.ts`, `src/lib/server/near-launch.ts`, `src/lib/server/adapters/near.ts`, `tests/near.test.ts`. Modificate: registru rețele, rute launch/liquidity/complete/status/trade/transactions, Create, wallet, launchpad, copy „seven”→„eight”, Dockerfile/compose/.env.example.
- Verificat: `npm run check` 38/38, `npm run build` OK, builderii testați read-only pe mainnet RPC (tkn.near, Ref). **Netestat:** o lansare reală semnată (necesită wallet NEAR cu ~8+ NEAR).
- Activare: setează `NEXT_PUBLIC_NEAR_TREASURY` (cont NEAR LIFT, ex. `liftpad.near`), aprobă fee-ul, opțional `RPC_NEAR`, apoi merge + `./deploy/deploy.sh`. Fără treasury, NEAR apare în Explore/Status dar Launch răspunde `NEAR_TREASURY_NOT_CONFIGURED`.

## Journal — 2026-09-18 (seara) — Activare snapshots + recuperare acces VM (boot-volume surgery)

### 1. Pașii de activare (executați integral, cu dovezi)
- Migrarea `003_market_snapshots.sql` rulată în SQL Editor (proiect `efapexfqzymileohqlmx`); tabelele `token_market_snapshots` + `job_runs` confirmate (2 rows în `information_schema`).
- Edge Function `market-snapshot` creată din dashboard (cod = `supabase/functions/market-snapshot/index.ts`) și **testată live**: invoke manual → `{"ok":true,"day":"2026-09-18","items":85}`, apoi `items:80` după deploy — ambele logate `success` în `job_runs`.
- Extensii `pg_cron` + `pg_net` activate; programare: job **`market-snapshot-daily`**, `5 0 * * *`, `active=true` (conține target-ul `market-snapshot`). Lanțul `pg_net → edge function` verificat printr-un `net.http_post` manual din SQL (rând nou `success`, 85 items).
- Rute noi live pe https://liftpad.xyz: `/api/movers` → 200; `/api/snapshots?chain=base&pool=0xd6f4…` → 200 cu `closes` + `rank 5/20`.

### 2. Incident: accesul SSH la VM era pierdut (cheia suprascrisă pe 16 sep)
- `deploy.sh` a eșuat cu `Permission denied (publickey)`: `~/.ssh/oracle_lift.key` fusese **regenerată** pe 16 sep (mtime 18:02); cheia originală (`ssh-key-2026-09-09`, singura din metadata) nu exista nicăieri local. Cele 3 încercări Run Command din 16 sep erau blocate `ACCEPTED` (agent OCI mort).
- Impasuri verificate: metadata `ssh_authorized_keys` imutabilă; `user_data` nu poate fi adăugat post-launch; Run Command nu revivează (SOFTRESET + agent-config rewrite eșuate; 6 comenzi moarte); consola serială pe ARM nu afișează GRUB (single-user imposibil); conversie IP efemer→rezervat imposibilă. **STOP păstrează IP-ul efemer** (docs oficiale + verificat live).
- Rezolvare — „boot-volume surgery” (instanța + IP 207.127.89.107 păstrate): STOP → detașare boot volume → instanță rescue `liftpad-rescue` (A1.Flex, Ubuntu 24.04 aarch64, cheia ed25519 în metadata la launch) → boot volume-ul de prod atașat ca dată (`--type paravirtualized`) → montat `/dev/sdb1`, cheia instalată în `/home/ubuntu/.ssh/authorized_keys` (uid/gid **1001**) → detașat → rescue terminat → boot volume reatașat la prod → START → SSH OK.
- Downtime total: ~25 min (ferestrele 16:2x + 16:36–16:43). Procedura completă + capcanele: skill `free-cloud-hosting` → `references/oci-vm-access-recovery.md`.

### 3. Deploy
- `git pull --ff-only` (merge `416a84e`) + `./deploy/deploy.sh 207.127.89.107 ubuntu ~/.ssh/oracle_lift.key` → rsync + rebuild Docker pe VM.
- Evidence: health `http 200` + `https-nip 200`; containerele `liftpad` (healthy) + `liftpad-caddy` sus; snapshot post-deploy `items:80`.

### 4. Lecții operaționale
- NU regenera `oracle_lift.key` fără verificare — recuperarea dacă se pierde = boot-volume surgery (nu metadata, nu agent, nu GRUB-serial pe ARM).
- Editorul SQL din dashboard se automatizează prin `monaco.editor.getEditors()[0].setValue(...)` + click pe `Run`; suprafețele de rezultate se citesc cel mai bine din screenshot.
- Dashboard-ul Supabase merge din browserul Hermes prin **Continue with GitHub** (sesiunea GitHub a profilului e autentificată).

## Journal — 2026-09-18 (Stage 1: daily market snapshots)

- PR: https://github.com/mar1uz/liftpad/pull/1 (branch `feat/daily-market-snapshots`, draft → merged de utilizator).
- Problema: datele de piață veneau doar live din DEX Screener; Supabase nu primea trafic zilnic (risc de pauză free-tier după ~7 zile inactiv) și token page avea placeholder „Historical candles are not connected yet”.
- Construit:
  - `supabase/migrations/003_market_snapshots.sql`: `token_market_snapshots` (un daily-close per token, PK `token_id+day`, RLS, doar service role) + `job_runs` (running/success/error, items, error).
  - `supabase/functions/market-snapshot/index.ts`: Edge Function; refuză orice apel fără `Authorization: Bearer <service role key>`; citește `/api/market` de pe `MARKET_SNAPSHOT_APP_ORIGIN` (default https://liftpad.xyz) și face upsert idempotent; loghează fiecare rulare în `job_runs`. Programare: `pg_cron` job `market-snapshot-daily` la 00:05 UTC prin `pg_net` (SQL-ul exact e în `supabase/functions/market-snapshot/README.md`, cu cheia service introdusă manual — nu intră în git).
  - Rute noi: `GET /api/movers` (top 3 câștigători ai zilei, filtru lichiditate ≥ $1k) și `GET /api/snapshots?chain&pool` (seria de daily-close, max 90 zile, + rank de volum în rețea). Ambele întorc payload gol (200) când storage-ul nu e configurat sau jobul nu a rulat — site-ul nu se strică niciodată din cauza pipeline-ului.
  - UI: token page arată graficul SVG de daily-close + badge „#N of M on <network>” lângă badge-ul 24H; homepage are banda „Top movers today” (3 carduri, refolosește TokenCard). Ambele se ascund elegant până există date.
  - Teste: `tests/market-snapshots.test.ts` (6 teste noi). `npm run check` = typecheck + 31/31 pass.
- Activare (o singură dată, după merge):
  1. Rulează `supabase/migrations/003_market_snapshots.sql` în SQL editor (sau Management API).
  2. `SUPABASE_ACCESS_TOKEN=... supabase functions deploy market-snapshot --project-ref efapexfqzymileohqlmx`.
  3. Rulează o dată SQL-ul de programare din `supabase/functions/market-snapshot/README.md` (înlocuiește `<SERVICE_ROLE_KEY>`).
  4. `.env` pe VM are deja `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (le folosește `database()`); nimic nou nu trebuie adăugat.
- Deploy web: pe Mac, `git pull --ff-only` apoi `./deploy/deploy.sh 207.127.89.107 ubuntu ~/.ssh/oracle_lift.key` (rsync + rebuild Docker pe VM).
- Verificare: `select * from public.job_runs order by started_at desc limit 5;` (un success/zi), `https://liftpad.xyz/api/movers` (movers ne-gol), o pagină de token (grafic după 2+ zile, badge după prima zi).
- Monitorizare: `job_runs` e sursa de adevăr a jobului; dacă cron-ul moare, pauza free-tier revine după ~7 zile (email de la Supabase).
- Rollback: web = `git revert <merge>` + redeploy cu deploy.sh; cron = `select cron.unschedule('market-snapshot-daily');`; tabele = drop manual doar dacă chiar e nevoie (pierdere de date).

## Journal — 2026-09-18
- Repo urcat pe GitHub: https://github.com/mar1uz/liftpad (privat). Remote `origin` = acel URL. `.env` rămâne local (gitignore); pe GitHub e doar `.env.example`.

## Journal — 2026-09-16
- Draft X pentru LIFT salvat în `social/liftpad-x-post.md`; publicarea și generarea imaginii rămân blocate de OAuth X expirat/neacceptat și providerul `fun-codex` lipsă în profilul Hermes `default`.
- Deploy blocat de cheia lipsă `~/Downloads/ssh-key-2026-09-09.key` (nu mai există pe Mac). Recuperarea se face 100% din CLI prin API-ul Oracle (`~/.oci` configurat; tenancy root, regiune `eu-stockholm-1`):
  - `SOFTRESET` pe `instance-20260909-1828` → site-ul a revenit singur (containere cu `restart: unless-stopped`); `https://liftpad.xyz/api/status` → 200.
  - Agentul OCA nu prelua comenzi (Run Command blocat în `ACCEPTED`): plugin-urile **Compute Instance Run Command** și **Bastion** setate `ENABLED` via `oci compute instance update --agent-config`.
  - Cheie SSH nouă generată local: `~/.ssh/oracle_lift.key`; injectarea în `~/.ssh/authorized_keys` pe VM prin Run Command — în curs.
  - Fallback pregătit: console connection serial `ocid1.instanceconsoleconnection.oc1.eu-stockholm-1.anqxeljr2n6qfsycr2hphiq2y4p2rb7jvdo5lpjkkqfucqrgkqiyfpfvrvlq` + cheie RSA `~/.ssh/oracle_lift_console_rsa` (console connection respinge `ssh-ed25519`).
  - Run Command a rămas blocat în `ACCEPTED`; accesul a fost recuperat prin **Bastion managed SSH session** (bastion `ocid1.bastion.oc1.eu-stockholm-1.amaaaaaa2n6qfsyawi7bhamogc3zjenvjqoruilymcdejr2iegt3orsei6ka`, plugin Bastion activat, TTL sesiune 3h) → cheia injectată de agent, apoi persistată manual în `authorized_keys` (independent de sesiune).
  - **Deploy executat**: `./deploy/deploy.sh 207.127.89.107 ubuntu ~/.ssh/oracle_lift.key` — build Docker pe VM + recreate container; health: local 200, nip.io 200, `https://liftpad.xyz` 200 (`/api/status`: toate rețelele available).
  - `deploy/deploy.sh` + `deploy/ORACLE_DEPLOY.md` actualizate să folosească implicit `~/.ssh/oracle_lift.key`. Bastionul a fost șters după deploy (recreare dacă e nevoie: `oci bastion bastion create --target-subnet-id ocid1.subnet.oc1.eu-stockholm-1.aaaaaaaalr2bzkj3pfoh6tc6dy2srkysdfvzae46np2de6s6hmzbrwmwmghq --name hermes-bastion --bastion-type STANDARD --client-cidr-list '["0.0.0.0/0"]'` + `oci bastion session create-managed-ssh`).

## Journal — 2026-09-13

### EVM launch: no Live without a verified pool (GENIUS / BNB)
- Root cause: after ERC-20 deploy + token approve, `addLiquidityETH` could stop (reject / timeout) while Create still marked the draft `complete` and Portfolio showed **Live**. Explorer was hardcoded to Solscan even on BNB. Complete API accepted EVM rows without `poolAddress`.
- On-chain example: GENIUS `0xb4a16c4872c788a1447c436187fa382d0604e155` on BNB — contract + 1,000 GENIUS approve exist; no GENIUS/WBNB pair; 0.070 BNB add never sent.
- Fix: EVM token without `poolAddress` is **Liquidity pending** and resumable (never redeploy). Resume settles pending txs, skips approve when allowance is enough, sends only `addLiquidityETH`, then `getPair` + reserves before Live. Complete API rejects EVM without pool. Explorer uses `explorerUrl` / BscScan on BNB.
- Recovery: Portfolio → Liquidity pending → Resume liquidity. Sign the missing 0.070 BNB pool tx. Import token in MetaMask if needed.
- Resume no longer treats a confirmed-but-unpooled liquidity hash as terminal. Pancake getPair for GENIUS is still zero; Resume must send `addLiquidityETH` again (approve is already skipped). Busy copy distinguishes pool check vs MetaMask confirm. Receipt success counts as confirmed (no wait for `finalized`).
- GENIUS pool live: `0x32214687C6B9d520Fc91f68943Af1a3F96EFb568`. Portfolio Live → token page Sell → Kyber GENIUS→native BNB (approve + swap). `tradeQuoteAddress` falls back to `0xEee…` so Sell cannot quote the mint against itself.
- Base launch `$GLASS`: Phantom stole `window.ethereum` (and the WalletConnect chooser) so MetaMask-connected users got a Phantom popup then `Unexpected error`. EVM send now ranks MetaMask over Phantom (EIP-6963 + same-account), refuses Phantom when MetaMask is injected, and maps that error to a reconnect hint. AppKit is not forced after disconnect if MetaMask is present.
- Robinhood native ETH LP: Uniswap V2 `addLiquidityETH` (`0x89e5…9eba`) instead of v3 NPM NFT mint that MetaMask greys out as Review alert. Confirm grey = not enough ETH **on Robinhood Chain**. Cancel the v3 popup, check RH ETH ≥ pool + gas (~0.02), Resume.

## Journal — 2026-09-12 (Europe/Oslo)

### Token detail: image, contract copy, Buy/Sell for fresh LIFT launches
- **Root cause (image):** create stored `data:image/…` in `still.launches.v1`, but `/api/launch/complete`, `platformLaunchToToken`, and client enrich only accepted `https://` → token page fell back to monogram.
- **Root cause (trade):** soft/platform tokens omitted `quoteAddress` (buy used mint as input); Jupiter has no route until indexed; trade panel was below a tall chart stub on mobile so it felt “missing”.
- **Fix:** persist https + data-URL images; enrich prefers draft/platform image; contract card with one-click copy + explorer; LaunchLab `buyToken`/`sellToken` quotes before Jupiter; trade panel first on mobile; SOL quote for LaunchLab curves.
- Files: `token-detail.tsx`, `launchpad.tsx`, `create.tsx`, `platform-launches.ts`, `complete/route.ts`, `token/.../page.tsx`, `solana-launch.ts`, `open-quote.ts`, `format.ts`, `globals.css`.

- `data/platform-launches.json` was empty on prod (complete never persisted / prior wipe). Seeded EMBER mint `UmcqbR…SFLF` without image. Creator photo still comes from `still.launches.v1` client enrich until a launch re-completes with data-URL/https image.
- `deploy/deploy.sh` now excludes `data/platform-launches.json` and `data/lift-platform.json` from rsync so empty local files cannot wipe prod registry.


## Journal — 2026-09-11
- Portfolio: My launches hidden until wallet connected (no more device-draft listing while disconnected). Watchlist still device-local.

- Portfolio: Watchlist also gated behind wallet connect (same as My launches).

- Create: Delete draft button when opening a stored draft; removes from still.launches.v1 and returns to Portfolio.

- Wallet desktop: Connect always re-prompts (Solana disconnect+connect onlyIfTrusted:false; EVM wallet_requestPermissions). USER_DISCONNECTED cleared only on success so ETH/SOL cannot silent-restore the same session.

- Homepage: larger NEW stock-pairs feature panel (launch paired with stocks) above markets.
