import {
  CREATOR_FEE_BPS,
  GRAD_TARGET,
  PLATFORM_FEE_BPS,
  feeSplit,
} from "./config";

export type TokenStatus = "live" | "graduated";

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
  creatorFeesEarned: number;
  platformFeesEarned: number;
  imageHue: number;
};

export type Activity = {
  id: string;
  kind: "buy" | "sell" | "launch" | "graduate";
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

export const DEMO_TOKENS: LaunchToken[] = [
  {
    address: addr(0x1111),
    name: "Stable Signal",
    symbol: "SIG",
    creator: addr(0xaaa1),
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
    ...(() => {
      const f = feesFromVol(12600);
      return { creatorFeesEarned: f.creator, platformFeesEarned: f.platform };
    })(),
    imageHue: 168,
  },
  {
    address: addr(0x2222),
    name: "Vault Cat",
    symbol: "VCAT",
    creator: addr(0xaaa2),
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
    ...(() => {
      const f = feesFromVol(33400);
      return { creatorFeesEarned: f.creator, platformFeesEarned: f.platform };
    })(),
    imageHue: 280,
  },
  {
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
    ...(() => {
      const f = feesFromVol(1800);
      return { creatorFeesEarned: f.creator, platformFeesEarned: f.platform };
    })(),
    imageHue: 210,
  },
  {
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
    ...(() => {
      const f = feesFromVol(89000);
      return { creatorFeesEarned: f.creator, platformFeesEarned: f.platform };
    })(),
    imageHue: 40,
  },
  {
    address: addr(0x5555),
    name: "Quiet Protocol",
    symbol: "QUIET",
    creator: addr(0xaaa5),
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
    ...(() => {
      const f = feesFromVol(9800);
      return { creatorFeesEarned: f.creator, platformFeesEarned: f.platform };
    })(),
    imageHue: 200,
  },
  {
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
    ...(() => {
      const f = feesFromVol(22100);
      return { creatorFeesEarned: f.creator, platformFeesEarned: f.platform };
    })(),
    imageHue: 130,
  },
  {
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
    ...(() => {
      const f = feesFromVol(150000);
      return { creatorFeesEarned: f.creator, platformFeesEarned: f.platform };
    })(),
    imageHue: 350,
  },
  {
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
    ...(() => {
      const f = feesFromVol(620);
      return { creatorFeesEarned: f.creator, platformFeesEarned: f.platform };
    })(),
    imageHue: 20,
  },
];

export const DEMO_ACTIVITY: Activity[] = [
  { id: "1", kind: "buy", token: addr(0x1111), symbol: "SIG", trader: addr(0xb001), amountUsd: 120, ts: now() - 40 },
  { id: "2", kind: "sell", token: addr(0x2222), symbol: "VCAT", trader: addr(0xb002), amountUsd: 85, ts: now() - 90 },
  { id: "3", kind: "launch", token: addr(0x8888), symbol: "DUST", trader: addr(0xaaa8), amountUsd: 0, ts: now() - 900 },
  { id: "4", kind: "buy", token: addr(0x5555), symbol: "QUIET", trader: addr(0xb003), amountUsd: 250, ts: now() - 200 },
  { id: "5", kind: "graduate", token: addr(0x4444), symbol: "NSTR", trader: addr(0xaaa4), amountUsd: GRAD_TARGET, ts: now() - 80000 },
  { id: "6", kind: "buy", token: addr(0x6666), symbol: "LEAF", trader: addr(0xb004), amountUsd: 64, ts: now() - 300 },
  { id: "7", kind: "sell", token: addr(0x1111), symbol: "SIG", trader: addr(0xb005), amountUsd: 40, ts: now() - 500 },
  { id: "8", kind: "buy", token: addr(0x2222), symbol: "VCAT", trader: addr(0xb006), amountUsd: 500, ts: now() - 700 },
];

export function createDemoToken(input: {
  name: string;
  symbol: string;
  description?: string;
  creator?: string;
  firstBuy?: number;
}): LaunchToken {
  const raised = Math.max(0, Number(input.firstBuy) || 0);
  const f = feeSplit(raised);
  return {
    address: addr(0x9000 + Math.floor(Math.random() * 0xffff)),
    name: input.name,
    symbol: input.symbol.toUpperCase().slice(0, 10),
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
    platformFeesEarned: f.platform,
    imageHue: Math.floor(Math.random() * 360),
  };
}

// keep unused import noise down for older references
void CREATOR_FEE_BPS;
void PLATFORM_FEE_BPS;
