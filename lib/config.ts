export const APP_NAME = "LPX";
export const APP_TAGLINE = "launchpad";
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

export const GRAD_TARGET = 20_000;

export const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_FACTORY || "";
export const DEMO_MODE = !FACTORY_ADDRESS;

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
