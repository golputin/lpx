export const CHAIN_ID = 988;
export const CHAIN_NAME = "Stable";
export const RPC_URL = "https://rpc.stable.xyz";
export const EXPLORER = "https://stable.blockscout.com";

// Deployed addresses — empty until deploy:stable
export const SBOX_ADDRESS = process.env.NEXT_PUBLIC_SBOX || "";
export const BOX_ADDRESS = process.env.NEXT_PUBLIC_BOX || "";
export const PRIZE_TOKEN =
  process.env.NEXT_PUBLIC_PRIZE || "0x817997ca8394e26cce3de3a076a4889b27dbf9de";

export const OPEN_COST_SBOX = 0.5;
export const DEMO_MODE = !BOX_ADDRESS;

export const TIERS = [
  { label: "$0.25", amount: 0.25, weightBps: 9000, color: "#7dd3fc", chance: "90%" },
  { label: "$1.00", amount: 1.0, weightBps: 900, color: "#a78bfa", chance: "9%" },
  { label: "$5.00", amount: 5.0, weightBps: 100, color: "#fbbf24", chance: "1%" },
];

export const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

export const BOX_ABI = [
  "function openCost() view returns (uint256)",
  "function poolBalance() view returns (uint256)",
  "function totalOpened() view returns (uint256)",
  "function totalPaidOut() view returns (uint256)",
  "function expectedPrize() view returns (uint256)",
  "function sbox() view returns (address)",
  "function prizeToken() view returns (address)",
  "function getTiers() view returns (tuple(uint256 amount,uint16 weightBps)[])",
  "function openBox(uint256 userEntropy) returns (uint256 tierIndex, uint256 prize)",
  "function getHistory(uint256 offset, uint256 limit) view returns (tuple(address user,uint256 tierIndex,uint256 prizeAmount,uint256 timestamp,bytes32 seed)[])",
  "function fundPool(uint256 amount)",
  "event Opened(address indexed user, uint256 indexed tierIndex, uint256 prizeAmount, uint256 openCostPaid, bytes32 seed)",
];

export function shortAddr(a?: string | null, n = 4) {
  if (!a) return "—";
  return `${a.slice(0, 2 + n)}…${a.slice(-n)}`;
}

export function fmt(n: number | string, d = 2) {
  const x = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(x)) return "0";
  return x.toLocaleString(undefined, { maximumFractionDigits: d });
}

export function timeAgo(ts: number) {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** Client-side demo RNG matching contract weights */
export function demoOpen(entropy = Date.now()): { tierIndex: number; prize: number } {
  let h = entropy >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h = (h ^ (h >>> 16)) >>> 0;
  const roll = h % 10000;
  if (roll < 9000) return { tierIndex: 0, prize: 0.25 };
  if (roll < 9900) return { tierIndex: 1, prize: 1 };
  return { tierIndex: 2, prize: 5 };
}
