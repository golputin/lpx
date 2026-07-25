export const APP_NAME = "LPX Pad";
export const APP_TAGLINE = "Token launchpad on Stable";
export const CHAIN_ID = 988;
export const CHAIN_NAME = "Stable";
export const RPC_URL = "https://rpc.stable.xyz";
export const EXPLORER = "https://stable.blockscout.com";
export const QUOTE_SYMBOL = "USDT0";

/** Platform cut of each buy/sell on the curve */
export const PLATFORM_FEE_BPS = 100; // 1.00%
/** Creator cut of each buy/sell on the curve */
export const CREATOR_FEE_BPS = 100; // 1.00%
/** Graduation target raise (quote) */
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
