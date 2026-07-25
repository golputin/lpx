# LPX Arcade

Free-to-play degen arcade for **Stable Network (988)**.

No deposit. No prize pool. No mystery-box bankroll.

## What's live

- **Paper Crash** — cash out before the multiplier dumps
- **Leaderboard** — best cash-out multiplier (browser local for now)
- **Token page** — clean TBA slot for `$LPX` when you launch

## Why this model

Same *retention idea* as Fefer Arcade (play free → flex score → token culture),
but **not a Win98/dino clone**: neon crash terminal, one flagship game, ship fast, **$0 treasury**.

## Dev

```bash
npm install
npm run dev    # :3007
npm run build
```

## Env (optional)

```bash
NEXT_PUBLIC_TOKEN_CA=0x...
NEXT_PUBLIC_BUY_URL=https://...
NEXT_PUBLIC_X_URL=https://x.com/...
NEXT_PUBLIC_TG_URL=https://t.me/...
```

## On-chain contracts

Hardhat / old StableBox contracts remain under `onchain/` for later if needed.
They are **not** required for the arcade site.
