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

Goldsky listează inclusiv Robinhood Chain și Stable, dar capabilitățile diferă între rețele. Validăm serviciul concret necesar, nu doar prezența rețelei în catalog. [Rețele Goldsky](https://docs.goldsky.com/chains/supported-networks)

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
| Design LONG, tot UI-ul | parțial | Ecranele Explore / Create / Token / Portfolio există; audit vizual LONG nu e închis. |
| Șase rețele | aliniat | `solana`, `base`, `bsc`, `hyperevm`, `stable`, `robinhood`. |
| Brand independent de launchpad.meme | aliniat | Brand vizibil: **LIFT**. Pachet intern încă `still-launchpad`. |
| Creatorul finanțează LP; semnătură din wallet | intenție, neimplementat | Fluxul de lansare nu emite încă tx-uri. |
| Raydium LaunchLab + platformă proprie | neconfigurat | `SolanaAdapter.launch` / `quote` / `getPoolData` returnează 503. |
| Token EVM via contracte standard / thirdweb | neconfigurat | `EvmAdapter.launch` returnează 503 (`LAUNCH_NOT_CONFIGURED`). |
| DEX existent pe fiecare rețea | schelet | Trading EVM V3 doar dacă `DEX_*` e JSON reviewed; pool-urile trebuie pe allowlist. |
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

**Nicio abatere de produs aprobată.** Codul existent este schelet aliniat cu planul, nu o schimbare de direcție. Lipsa integrărilor eligibile rămâne blocaj explicit, nu se taie rețele din obiectiv.

---

## Context tehnic

- **Repo:** `/Users/marius/antigravity/Launchpad`
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

### 2026-09-10

- Deschis workspace-ul Hermes pe `~/antigravity/Launchpad`.
- Planul canonic „Launchpad minimalist construit pe infrastructură existentă” (secțiunile 1–5) a fost lipit aici, neschimbat. De acum, orice schimbare de plan trece prin jurnal.
- Restilizare UI: paletă negru + lime (`#c8f542`), tipografie Syne 800 / Instrument Sans, grafice random-walk în loc de sinusoidă. Minimalismul rămâne, dar mai bold. Designul LONG rămâne referință de densitate, nu de paletă/greutate.
- Brand redenumit din STILL în **LIFT** (acțiune, lansare). Logo: marcă lime cu pad + săgeată în sus + wordmark. Cheile localStorage `still.*` rămân ca să nu se piardă drafturile.
- Salvare versiune **v1.0**: schelet Next.js + restilizare vizuală LIFT. Repo git inițializat local.
