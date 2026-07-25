# StableBox

Mystery box dApp on **Stable Network (chain 988)**.

Pay **0.5 SBOX** (~$0.50) → open a box → receive random **USDT** prize.

## Odds

| Prize | Chance |
|------:|-------:|
| **$0.25** USDT | **90%** |
| **$1.00** USDT | **9%** |
| **$5.00** USDT | **1%** |

Expected prize ≈ **$0.365** USDT per open.

> Paid mystery-box game — not an investment product.

## Repo layout

- **Root** — Next.js website (Vercel deploys this)
- **`onchain/`** — Hardhat contracts (`SBOX`, `MysteryBox`), tests, deploy script

## Frontend (Vercel)

```bash
npm install
npm run dev   # http://localhost:3007
npm run build
```

Env (after contract deploy):

```bash
NEXT_PUBLIC_SBOX=0x...
NEXT_PUBLIC_BOX=0x...
NEXT_PUBLIC_PRIZE=0x817997ca8394e26cce3de3a076a4889b27dbf9de
```

Without those env vars, the site runs in **DEMO mode**.

## Contracts

```bash
cd onchain
npm install
npm test
npm run compile

export PRIVATE_KEY=0x...
export PRIZE_TOKEN=0x817997ca8394e26cce3de3a076a4889b27dbf9de
npm run deploy:stable
```

Then `fundPool` with USDT/WgUSDT.

## Odds detail

- 90% → 0.25 USDT  
- 9% → 1 USDT  
- 1% → 5 USDT  
