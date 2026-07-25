export const APP_NAME = "FEFER";
export const APP_TAGLINE = "LAUNCHPAD";
export const APP_FULL_NAME = "FEFER LAUNCHPAD";
export const TWITTER_HANDLE = "Feferdotpw";
export const TWITTER_URL = "https://x.com/Feferdotpw";
export const CHAIN_ID = 988;
export const CHAIN_NAME = "Stable";
export const RPC_URL = "https://rpc.stable.xyz";
export const EXPLORER = "https://stable.blockscout.com";
export const QUOTE_SYMBOL = "USDT0";

/**
 * Trade fee model (Pons-style):
 * - TRADE_FEE_BPS = total fee charged on each buy/sell (1%)
 * - CREATOR_SHARE_BPS = creator cut of that fee (80%)
 * - PLATFORM_SHARE_BPS = platform cut of that fee (20%)
 *
 * Effective creator take ≈ 0.80% of volume
 * Effective platform take ≈ 0.20% of volume
 */
export const TRADE_FEE_BPS = 100; // 1.00% total
export const CREATOR_SHARE_BPS = 8000; // 80% of trade fee
export const PLATFORM_SHARE_BPS = 2000; // 20% of trade fee

/** @deprecated use TRADE_FEE_BPS * CREATOR_SHARE_BPS / 10000 */
export const CREATOR_FEE_BPS = Math.round((TRADE_FEE_BPS * CREATOR_SHARE_BPS) / 10_000); // 80 bps = 0.80%
/** @deprecated use TRADE_FEE_BPS * PLATFORM_SHARE_BPS / 10000 */
export const PLATFORM_FEE_BPS = Math.round((TRADE_FEE_BPS * PLATFORM_SHARE_BPS) / 10_000); // 20 bps = 0.20%

/**
 * StablePad-style: instant Uni V3 pool at create.
 * "Graduation" is UI phase only — pool is tradeable from block 0.
 * Start mcap ≈ $3k (see DEPLOYMENT.startMarketCapUsd).
 */
export const GRAD_TARGET = 3_000;
export const START_MCAP_USD = 3_000;
export const POOL_FEE = 10_000; // Uni V3 1%

/**
 * Create cost model (StablePad-style):
 * - No platform create fee
 * - User pays network gas only (~create token + V3 pool + mint LP)
 * - Optional first buy is separate capital, not a fee
 */
export const CREATE_PLATFORM_FEE_USD = 0;
/** createToken + createPool + mint is heavier than curve-only */
export const CREATE_GAS_UNITS = 5_500_000;
export const CREATE_GAS_PRICE_GWEI = 1.2;
export const CREATE_GAS_TOKEN_USD = 1;
export const CREATE_GAS_EST_USD =
  (CREATE_GAS_UNITS * CREATE_GAS_PRICE_GWEI * 1e-9) * CREATE_GAS_TOKEN_USD;

/**
 * Live StablePad-style factory on Stable mainnet.
 * Override with NEXT_PUBLIC_FACTORY when redeploying.
 * Empty string forces demo mode.
 */
export const FACTORY_ADDRESS =
  process.env.NEXT_PUBLIC_FACTORY ||
  "0xBecc3b11E6dE1c0cc2fBcb4827533Aa440a953C6";

/** demo only when factory explicitly disabled */
export const DEMO_MODE =
  process.env.NEXT_PUBLIC_DEMO === "1" ||
  !FACTORY_ADDRESS ||
  FACTORY_ADDRESS === "0x" ||
  FACTORY_ADDRESS.toLowerCase() === "demo";

export function shortAddr(a?: string | null, n = 4) {
  if (!a) return "—";
  return `${a.slice(0, 2 + n)}…${a.slice(-n)}`;
}

export function fmt(n: number, d = 2) {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: d });
}

export function fmtUsd(n: number, d = 2) {
  if (!Number.isFinite(n)) return "$0";
  if (Math.abs(n) > 0 && Math.abs(n) < 0.01) return `$${n.toFixed(4)}`;
  return `$${fmt(n, d)}`;
}

export function timeAgo(ts: number) {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function bpsToPct(bps: number) {
  return `${(bps / 100).toFixed(2)}%`;
}

export function shareToPct(shareBps: number) {
  return `${(shareBps / 100).toFixed(0)}%`;
}

/** fee amounts from a trade notional */
export function feeSplit(amount: number) {
  const total = (amount * TRADE_FEE_BPS) / 10_000;
  const creator = (total * CREATOR_SHARE_BPS) / 10_000;
  const platform = total - creator;
  return { total, creator, platform };
}

export function normalizeUrl(raw?: string | null) {
  const v = (raw || "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  if (v.startsWith("x.com/") || v.startsWith("twitter.com/") || v.startsWith("t.me/")) {
    return `https://${v}`;
  }
  if (v.startsWith("@")) return `https://x.com/${v.slice(1)}`;
  if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(v)) return `https://${v}`;
  return v;
}

export function createCostBreakdown(firstBuy = 0) {
  const platformFee = CREATE_PLATFORM_FEE_USD;
  const gasEst = CREATE_GAS_EST_USD;
  const buy = Math.max(0, Number(firstBuy) || 0);
  return {
    platformFee,
    gasEst,
    firstBuy: buy,
    totalCash: platformFee + buy,
    totalWithGas: platformFee + gasEst + buy,
  };
}
