# LPX Pad

Bonding-curve **token launchpad** for **Stable Network (chain 988)**.

Inspired by the product shape of Quiver / Pons-style pads:
- Explore trenches (live + graduated)
- Create token with optional first buy
- **Creator fee on every trade** + platform fee
- Token page with curve progress + trade panel

## Fee model (defaults)

| Fee | BPS | % |
|---|---:|---:|
| Creator | 100 | 1.00% |
| Platform | 100 | 1.00% |
| Graduation target | — | $20,000 USDT0 |

## Stack

- Next.js 14 (App Router) at repo root — Vercel-ready
- Demo mode when `NEXT_PUBLIC_FACTORY` is empty (localStorage launches)
- Optional Hardhat contracts remain under `onchain/` for later wiring

## Dev

```bash
npm install
npm run dev    # http://localhost:3007
npm run build
```

## Env

```bash
NEXT_PUBLIC_FACTORY=0x...   # set after factory deploy to leave demo mode
```

## Notes

This release is a **production-shaped UI** with demo state.
Wire factory / curve contracts next for real deploys on Stable.
