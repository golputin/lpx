export type TokenMeta = {
  address: string;
  name?: string;
  symbol?: string;
  description?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  imageUrl?: string;
  updatedAt?: number;
};

const KEY = "lpx_token_meta_v1";

function readAll(): Record<string, TokenMeta> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, TokenMeta>;
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, TokenMeta>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(map));
}

export function getTokenMeta(address: string): TokenMeta | null {
  if (!address) return null;
  const all = readAll();
  return all[address.toLowerCase()] || null;
}

export function saveTokenMeta(meta: TokenMeta) {
  if (!meta?.address) return;
  const all = readAll();
  const key = meta.address.toLowerCase();
  all[key] = {
    ...all[key],
    ...meta,
    address: key,
    updatedAt: Math.floor(Date.now() / 1000),
  };
  writeAll(all);
}

export function mergeTokenMeta<T extends { address: string }>(token: T): T & Partial<TokenMeta> {
  const m = getTokenMeta(token.address);
  if (!m) return token;
  return {
    ...token,
    description: m.description || (token as { description?: string }).description,
    website: m.website || (token as { website?: string }).website,
    twitter: m.twitter || (token as { twitter?: string }).twitter,
    telegram: m.telegram || (token as { telegram?: string }).telegram,
    imageUrl: m.imageUrl || (token as { imageUrl?: string }).imageUrl,
    name: m.name || (token as { name?: string }).name,
    symbol: m.symbol || (token as { symbol?: string }).symbol,
  };
}
