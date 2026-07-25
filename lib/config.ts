export const SITE_NAME = "LPX Arcade";
export const GAME_NAME = "Paper Crash";
export const CHAIN_ID = 988;
export const CHAIN_NAME = "Stable";
export const EXPLORER = "https://stable.blockscout.com";
export const RPC_URL = "https://rpc.stable.xyz";

/** Set after token launch. Empty / TBA = not live yet */
export const CA_PLACEHOLDER =
  process.env.NEXT_PUBLIC_TOKEN_CA || "TBA — deploy & paste CA here";
export const TOKEN_SYMBOL = "LPX";
export const TOKEN_NAME = "LPX";

export const BUY_URL =
  process.env.NEXT_PUBLIC_BUY_URL ||
  (process.env.NEXT_PUBLIC_TOKEN_CA
    ? `https://dyorswap.org/?chainId=988&token=${process.env.NEXT_PUBLIC_TOKEN_CA}`
    : "https://dexscreener.com/stable");

export const X_URL = process.env.NEXT_PUBLIC_X_URL || "https://x.com/";
export const TG_URL = process.env.NEXT_PUBLIC_TG_URL || "https://t.me/";

export const POINTS_KEY = "lpx_arcade_points_v1";
export const LB_KEY = "lpx_arcade_lb_v1";
export const START_POINTS = 1000;
export const MAX_POINTS_BET = 500;

export function short(a?: string | null, n = 4) {
  if (!a || a.startsWith("TBA")) return "TBA";
  if (a.length < 12) return a;
  return `${a.slice(0, 2 + n)}…${a.slice(-n)}`;
}
