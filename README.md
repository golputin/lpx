# StableBox

Mystery box dApp on **Stable Network (chain 988)**.

Pay **0.5 SBOX** (~$0.50) → open a box → receive random **USDT** prize.

## Odds

| Prize | Chance |
|------:|-------:|
| **$0.25** USDT | **90%** |
| **$1.00** USDT | **9%** |
| **$5.00** USDT | **1%** |

Expected prize ≈ **$0.365** USDT per open (when pool solvent).

> This is a **paid game / mystery box**, not an investment product.  
> No ROI promises, no multi-level recruitment.

## Stack

- Solidity 0.8.24 + Hardhat
- `SBOX` ERC-20 (open payment)
- `MysteryBox` prize pool (USDT / WgUSDT)
- Next.js frontend (`frontend/`) with logo + demo mode

## Contracts

```bash
cd /root/clawd/stablebox
npm install
npm test
npm run compile

# Deploy to Stable 988
export PRIVATE_KEY=0x...
export PRIZE_TOKEN=0x817997ca8394e26cce3de3a076a4889b27dbf9de
npm run deploy:stable
```

Then fund the box:

```text
approve USDT → MysteryBox.fundPool(amount)
```

Optional: distribute SBOX to users / LP / sale.

## Frontend

```bash
cd frontend
npm install
npm run dev   # http://localhost:3007
```

Env (after deploy):

```bash
NEXT_PUBLIC_SBOX=0x...
NEXT_PUBLIC_BOX=0x...
NEXT_PUBLIC_PRIZE=0x817997ca8394e26cce3de3a076a4889b27dbf9de
```

Without env addresses, UI runs in **DEMO mode** (local RNG + faucet).

## Admin knobs

- `setOpenCost`
- `setTiers(amounts, weightsBps)` — weights must sum to 10_000
- `setPaymentMode(burn, treasury)`
- `fundPool` / `withdrawPool`

## RNG note

Current RNG uses `block.prevrandao` + entropy. Fine for degen demo;  
for production high-stakes use Chainlink VRF or commit-reveal.
