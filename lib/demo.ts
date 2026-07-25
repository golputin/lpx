import {
  CREATOR_FEE_BPS,
  GRAD_TARGET,
  PLATFORM_FEE_BPS,
  feeSplit,
} from "./config";

export type TokenStatus = "live" | "graduated";

/** demo connect wallet — also used so profile has sample launches */
export const DEMO_WALLET = "0x1b04beb50c40df7e5efdbf91c5d876e94666603d";

export type LaunchToken = {
  address: string;
  name: string;
  symbol: string;
  creator: string;
  createdAt: number;
  raised: number;
  mcap: number;
  vol24h: number;
  holders: number;
  progress: number;
  status: TokenStatus;
  price: number;
  change24h: number;
  description: string;
  /** bonding curve address (live) */
  curve?: string;
  /** lifetime creator fee accrued from trades */
  creatorFeesEarned: number;
  /** already claimed by creator */
  creatorFeesClaimed: number;
  platformFeesEarned: number;
  imageHue: number;
  /** data URL or remote image */
  imageUrl?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
};

export function claimableFees(t: LaunchToken) {
  return Math.max(0, (t.creatorFeesEarned || 0) - (t.creatorFeesClaimed || 0));
}

export type Activity = {
  id: string;
  kind: "buy" | "sell";
  token: string;
  symbol: string;
  trader: string;
  amountUsd: number;
  ts: number;
};

const now = () => Math.floor(Date.now() / 1000);

function addr(n: number) {
  return (`0x${n.toString(16).padStart(40, "0")}`).toLowerCase();
}

function feesFromVol(vol: number) {
  const s = feeSplit(vol);
  return { creator: s.creator, platform: s.platform };
}

/** deterministic placeholder art so trenches don't look empty */
export function placeholderImage(seed: string, hue = 160) {
  const safe = encodeURIComponent(seed.slice(0, 24) || "lpx");
  // dicebear shapes — no API key, good enough for demo logos
  return `https://api.dicebear.com/9.x/shapes/svg?seed=${safe}&backgroundColor=${hue
    .toString(16)
    .padStart(2, "0")}${((hue * 3) % 255).toString(16).padStart(2, "0")}${((hue * 7) % 255)
    .toString(16)
    .padStart(2, "0")}`;
}

function tok(
  partial: Omit<
    LaunchToken,
    "creatorFeesEarned" | "creatorFeesClaimed" | "platformFeesEarned" | "imageUrl"
  > & {
    volForFees: number;
    imageUrl?: string;
    claimedRatio?: number;
  }
): LaunchToken {
  const f = feesFromVol(partial.volForFees);
  const claimedRatio = Math.min(1, Math.max(0, partial.claimedRatio ?? 0));
  const { volForFees: _v, claimedRatio: _c, ...rest } = partial;
  return {
    ...rest,
    creatorFeesEarned: f.creator,
    creatorFeesClaimed: f.creator * claimedRatio,
    platformFeesEarned: f.platform,
    imageUrl: partial.imageUrl || placeholderImage(partial.symbol + partial.address, partial.imageHue),
  };
}

export const DEMO_TOKENS: LaunchToken[] = [
  tok({
    address: addr(0x1111),
    name: "Stable Signal",
    symbol: "SIG",
    creator: DEMO_WALLET,
    createdAt: now() - 420,
    raised: 1840,
    mcap: 9200,
    vol24h: 12600,
    holders: 86,
    progress: (1840 / GRAD_TARGET) * 100,
    status: "live",
    price: 0.0000184,
    change24h: 42.5,
    description: "Signal desk for Stable flow.",
    imageHue: 168,
    website: "https://lpx-tau.vercel.app",
    twitter: "https://x.com/stable",
    telegram: "https://t.me/stable",
    volForFees: 12600,
    claimedRatio: 0.25,
  }),
  tok({
    address: addr(0x2222),
    name: "Vault Cat",
    symbol: "VCAT",
    creator: DEMO_WALLET,
    createdAt: now() - 3600,
    raised: 9200,
    mcap: 41000,
    vol24h: 33400,
    holders: 214,
    progress: (9200 / GRAD_TARGET) * 100,
    status: "live",
    price: 0.000082,
    change24h: 12.1,
    description: "Cold storage memes.",
    imageHue: 280,
    twitter: "https://x.com/vaultcat",
    volForFees: 33400,
    claimedRatio: 0.1,
  }),
  tok({
    address: addr(0x3333),
    name: "Gridlock",
    symbol: "GRID",
    creator: addr(0xaaa3),
    createdAt: now() - 7200,
    raised: 450,
    mcap: 2100,
    vol24h: 1800,
    holders: 31,
    progress: (450 / GRAD_TARGET) * 100,
    status: "live",
    price: 0.0000042,
    change24h: -8.4,
    description: "Micro-cap grid cult.",
    imageHue: 210,
    volForFees: 1800,
  }),
  tok({
    address: addr(0x4444),
    name: "Northstar",
    symbol: "NSTR",
    creator: addr(0xaaa4),
    createdAt: now() - 86400,
    raised: GRAD_TARGET,
    mcap: 128000,
    vol24h: 89000,
    holders: 540,
    progress: 100,
    status: "graduated",
    price: 0.00021,
    change24h: 6.2,
    description: "Cleared graduation. Same pool.",
    imageHue: 40,
    website: "https://northstar.example",
    twitter: "https://x.com/northstar",
    telegram: "https://t.me/northstar",
    volForFees: 89000,
  }),
  tok({
    address: addr(0x5555),
    name: "Quiet Protocol",
    symbol: "QUIET",
    creator: DEMO_WALLET,
    createdAt: now() - 1400,
    raised: 3100,
    mcap: 15500,
    vol24h: 9800,
    holders: 102,
    progress: (3100 / GRAD_TARGET) * 100,
    status: "live",
    price: 0.000031,
    change24h: 19.8,
    description: "No CT spam. Just chart.",
    imageHue: 200,
    telegram: "https://t.me/quiet",
    volForFees: 9800,
    claimedRatio: 0,
  }),
  tok({
    address: addr(0x6666),
    name: "Ironleaf",
    symbol: "LEAF",
    creator: addr(0xaaa6),
    createdAt: now() - 5400,
    raised: 12500,
    mcap: 62000,
    vol24h: 22100,
    holders: 188,
    progress: (12500 / GRAD_TARGET) * 100,
    status: "live",
    price: 0.00011,
    change24h: -3.2,
    description: "Slow grind curve.",
    imageHue: 130,
    volForFees: 22100,
  }),
  tok({
    address: addr(0x7777),
    name: "Apex Unit",
    symbol: "APEX",
    creator: addr(0xaaa7),
    createdAt: now() - 20000,
    raised: GRAD_TARGET,
    mcap: 240000,
    vol24h: 150000,
    holders: 890,
    progress: 100,
    status: "graduated",
    price: 0.00048,
    change24h: 28.4,
    description: "High-conviction clear.",
    imageHue: 350,
    website: "https://apex.example",
    twitter: "https://x.com/apexunit",
    volForFees: 150000,
  }),
  tok({
    address: addr(0x8888),
    name: "Dust Route",
    symbol: "DUST",
    creator: addr(0xaaa8),
    createdAt: now() - 900,
    raised: 180,
    mcap: 900,
    vol24h: 620,
    holders: 14,
    progress: (180 / GRAD_TARGET) * 100,
    status: "live",
    price: 0.0000018,
    change24h: 4.0,
    description: "Fresh. Thin book.",
    imageHue: 20,
    volForFees: 620,
  }),
];

export const DEMO_ACTIVITY: Activity[] = [
  { id: "1", kind: "buy", token: addr(0x1111), symbol: "SIG", trader: addr(0xb001), amountUsd: 120, ts: now() - 40 },
  { id: "2", kind: "sell", token: addr(0x2222), symbol: "VCAT", trader: addr(0xb002), amountUsd: 85, ts: now() - 90 },
  { id: "3", kind: "buy", token: addr(0x8888), symbol: "DUST", trader: addr(0xb008), amountUsd: 32, ts: now() - 120 },
  { id: "4", kind: "buy", token: addr(0x5555), symbol: "QUIET", trader: DEMO_WALLET, amountUsd: 250, ts: now() - 200 },
  { id: "5", kind: "sell", token: addr(0x4444), symbol: "NSTR", trader: addr(0xb003), amountUsd: 180, ts: now() - 260 },
  { id: "6", kind: "buy", token: addr(0x6666), symbol: "LEAF", trader: addr(0xb004), amountUsd: 64, ts: now() - 300 },
  { id: "7", kind: "sell", token: addr(0x1111), symbol: "SIG", trader: DEMO_WALLET, amountUsd: 40, ts: now() - 500 },
  { id: "8", kind: "buy", token: addr(0x2222), symbol: "VCAT", trader: addr(0xb006), amountUsd: 500, ts: now() - 700 },
  { id: "9", kind: "buy", token: addr(0x1111), symbol: "SIG", trader: DEMO_WALLET, amountUsd: 50, ts: now() - 420 },
  { id: "10", kind: "sell", token: addr(0x5555), symbol: "QUIET", trader: addr(0xb007), amountUsd: 22, ts: now() - 800 },
  { id: "11", kind: "buy", token: addr(0x6666), symbol: "LEAF", trader: addr(0xb009), amountUsd: 95, ts: now() - 1000 },
  { id: "12", kind: "sell", token: addr(0x2222), symbol: "VCAT", trader: addr(0xb00a), amountUsd: 140, ts: now() - 1200 },
];

export function createDemoToken(input: {
  name: string;
  symbol: string;
  description?: string;
  creator?: string;
  firstBuy?: number;
  imageUrl?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
}): LaunchToken {
  const raised = Math.max(0, Number(input.firstBuy) || 0);
  const f = feeSplit(raised);
  const hue = Math.floor(Math.random() * 360);
  const symbol = input.symbol.toUpperCase().slice(0, 10);
  const address = addr(0x9000 + Math.floor(Math.random() * 0xffff));
  return {
    address,
    name: input.name,
    symbol,
    creator: input.creator || addr(0xcafe),
    createdAt: now(),
    raised,
    mcap: Math.max(raised * 4, 500),
    vol24h: raised,
    holders: raised > 0 ? 2 : 1,
    progress: Math.min(100, (raised / GRAD_TARGET) * 100),
    status: raised >= GRAD_TARGET ? "graduated" : "live",
    price: 0.000001 + raised / 1e9,
    change24h: 0,
    description: input.description || "",
    creatorFeesEarned: f.creator,
    creatorFeesClaimed: 0,
    platformFeesEarned: f.platform,
    imageHue: hue,
    imageUrl: input.imageUrl || placeholderImage(symbol + address, hue),
    website: input.website || "",
    twitter: input.twitter || "",
    telegram: input.telegram || "",
  };
}

void CREATOR_FEE_BPS;
void PLATFORM_FEE_BPS;
