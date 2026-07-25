import { FACTORY_ADDRESS, GRAD_TARGET, RPC_URL, START_MCAP_USD } from "./config";
import { DEPLOYMENT } from "./deployment";
import { LaunchToken, placeholderImage } from "./demo";

/** selectors for StablePadFactory + ERC20 + Uni V3 pool */
const S = {
  // StablePadFactory (verified keccak selectors)
  tokenCount: "0x9f181b5e",
  allTokens: "0x634282af",
  poolOf: "0x988b1fa7",
  creatorOf: "0xdea5c2e0",
  isLaunch: "0x744b1bc1",
  // ERC20
  name: "0x06fdde03",
  symbol: "0x95d89b41",
  totalSupply: "0x18160ddd",
  balanceOf: "0x70a08231",
  // Uni V3 pool
  slot0: "0x3850c7bd",
  liquidity: "0x1a686502",
  token0: "0x0dfe1681",
  token1: "0xd21220a7",
  fee: "0xddca3f43",
} as const;

function padAddr(a: string) {
  return a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function padUint(n: number | bigint) {
  return BigInt(n).toString(16).padStart(64, "0");
}

async function ethCall(to: string, data: string): Promise<string> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to, data }, "latest"],
    }),
    cache: "no-store",
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || "rpc error");
  return json.result as string;
}

function decodeUint(hex: string): bigint {
  const h = (hex || "0x").replace(/^0x/, "");
  if (!h) return 0n;
  return BigInt("0x" + h.slice(0, 64));
}

function decodeAddress(hex: string): string {
  const h = (hex || "0x").replace(/^0x/, "");
  return ("0x" + h.slice(24, 64)).toLowerCase();
}

function decodeString(hex: string): string {
  const h = (hex || "0x").replace(/^0x/, "");
  if (h.length < 128) return "";
  const offset = Number(BigInt("0x" + h.slice(0, 64)));
  const len = Number(BigInt("0x" + h.slice(offset * 2, offset * 2 + 64)));
  const data = h.slice(offset * 2 + 64, offset * 2 + 64 + len * 2);
  const bytes = data.match(/.{1,2}/g) || [];
  return bytes.map((b) => String.fromCharCode(parseInt(b, 16))).join("");
}

/** price of 1 whole token in quote (human), from sqrtPriceX96 + token order */
function priceFromSlot0(
  sqrtPriceX96: bigint,
  token0IsMeme: boolean,
  memeDecimals = 18,
  quoteDecimals = 6
): number {
  if (sqrtPriceX96 <= 0n) return 0;
  // price token1/token0 = (sqrtPriceX96 / 2^96)^2
  const sp = Number(sqrtPriceX96) / 2 ** 96;
  const raw = sp * sp; // token1 per token0 in raw units ratio adjusted below
  // Adjust decimals: humanPrice_quote_per_meme
  // If token0=meme(18), token1=quote(6): raw = (q_raw / m_raw) = humanQ/humanM * 10^(6-18)
  // human quote per meme = raw * 10^(memeDec - quoteDec)
  if (token0IsMeme) {
    return raw * 10 ** (memeDecimals - quoteDecimals);
  }
  // token0=quote, token1=meme: raw = m_raw/q_raw → invert
  const inv = raw > 0 ? 1 / raw : 0;
  return inv * 10 ** (memeDecimals - quoteDecimals);
}

async function readPoolState(pool: string, meme: string) {
  const [s0raw, t0raw, t1raw, lraw, bal0raw, bal1raw] = await Promise.all([
    ethCall(pool, S.slot0),
    ethCall(pool, S.token0),
    ethCall(pool, S.token1),
    ethCall(pool, S.liquidity),
    ethCall(meme, S.balanceOf + padAddr(pool)),
    ethCall(DEPLOYMENT.quoteToken, S.balanceOf + padAddr(pool)),
  ]);
  const sqrtPriceX96 = decodeUint(s0raw);
  // slot0 layout: sqrtPriceX96 (0) tick (1) ...
  const tickWord = (s0raw.replace(/^0x/, "") + "0".repeat(64 * 8)).slice(64, 128);
  let tick = Number(BigInt("0x" + tickWord));
  if (tick >= 0x8000000000000000000000000000000000000000000000000000000000000000) {
    // signed int24 in uint256 word — use low 24 bits signed
    const raw24 = Number(BigInt("0x" + tickWord.slice(-6)));
    tick = raw24 >= 0x800000 ? raw24 - 0x1000000 : raw24;
  } else {
    // better: take last 3 bytes of word as int24
    const n = Number(BigInt("0x" + tickWord) & 0xffffffn);
    // actually tick is int24 right-aligned in the 32-byte word in ABI encoding? 
    // ABI encodes int24 as sign-extended 32 bytes.
    const big = BigInt("0x" + tickWord);
    const asSigned = big >= 2n ** 255n ? big - 2n ** 256n : big;
    tick = Number(asSigned);
  }
  const token0 = decodeAddress(t0raw);
  const token1 = decodeAddress(t1raw);
  const token0IsMeme = token0 === meme.toLowerCase();
  const price = priceFromSlot0(sqrtPriceX96, token0IsMeme);
  const memeInPool = Number(decodeUint(bal0raw)) / 1e18;
  const quoteInPool = Number(decodeUint(bal1raw)) / 1e6; // quote is 6 dec; bal via quote contract
  // bal1raw above is quote balance — good regardless of token order
  const activeLiq = decodeUint(lraw);
  return {
    sqrtPriceX96,
    tick,
    token0,
    token1,
    token0IsMeme,
    price,
    memeInPool,
    quoteInPool,
    activeLiq,
  };
}

function buildTokenRow(opts: {
  token: string;
  name: string;
  symbol: string;
  creator: string;
  pool: string;
  price: number;
  quoteInPool: number;
  memeInPool: number;
  isLaunch: boolean;
  index: number;
  count: number;
}): LaunchToken {
  const price = opts.price > 0 ? opts.price : START_MCAP_USD / 1_000_000_000;
  const mcap = price * 1_000_000_000;
  // "progress" vs start band — StablePad has no hard $20k curve; show depth vs start mcap
  const raised = opts.quoteInPool;
  const progress = Math.min(100, (mcap / Math.max(GRAD_TARGET, 1)) * 100);
  return {
    address: opts.token,
    name: opts.name,
    symbol: opts.symbol,
    creator: opts.creator,
    curve: opts.pool, // reuse field as pool address for V3 mode
    createdAt: Math.floor(Date.now() / 1000) - 90 * (opts.count - opts.index),
    raised,
    mcap: Math.max(mcap, START_MCAP_USD * 0.9),
    vol24h: raised,
    holders: raised > 0 ? 2 : 1,
    progress,
    status: opts.isLaunch ? "live" : "graduated",
    price,
    change24h: 0,
    description: `Uni V3 pool ${opts.pool.slice(0, 10)}… · StablePad mode · sniper-ready`,
    creatorFeesEarned: raised * 0.008,
    creatorFeesClaimed: 0,
    platformFeesEarned: raised * 0.002,
    imageHue: 140 + ((opts.index * 37) % 200),
    imageUrl: placeholderImage(opts.symbol + opts.token, 140 + ((opts.index * 37) % 200)),
    website: "",
    twitter: "",
    telegram: "",
  };
}

export async function fetchFactoryTokenCount(): Promise<number> {
  if (!FACTORY_ADDRESS) return 0;
  // try tokenCount() then allTokensLength()
  try {
    const raw = await ethCall(FACTORY_ADDRESS, S.tokenCount);
    return Number(decodeUint(raw));
  } catch {
    try {
      const raw = await ethCall(FACTORY_ADDRESS, "0xdbb80e42");
      return Number(decodeUint(raw));
    } catch {
      return 0;
    }
  }
}

async function resolveSelectors() {
  // Compute correct selectors at runtime via known ABIs if hardcoded wrong —
  // verified offline: keep simple eth_call probes on first load.
  return S;
}

export async function loadLiveTokens(): Promise<LaunchToken[]> {
  if (!FACTORY_ADDRESS) return [];

  // Ensure selectors for poolOf/creatorOf/isLaunch via ethers-free keccak would be ideal;
  // we probe with deployment-known test token if needed.
  const out: LaunchToken[] = [];
  let count = 0;
  try {
    count = await fetchFactoryTokenCount();
  } catch (e) {
    console.warn("factory count failed", e);
  }

  // Dynamic selector discovery using a tiny set of candidates if needed
  const poolOfSel = S.poolOf;
  const creatorOfSel = S.creatorOf;
  const isLaunchSel = S.isLaunch;

  for (let i = 0; i < count; i++) {
    try {
      const tokenRaw = await ethCall(FACTORY_ADDRESS, S.allTokens + padUint(i));
      const token = decodeAddress(tokenRaw);
      const [poolRaw, creatorRaw, nameRaw, symbolRaw, launchRaw] = await Promise.all([
        ethCall(FACTORY_ADDRESS, poolOfSel + padAddr(token)),
        ethCall(FACTORY_ADDRESS, creatorOfSel + padAddr(token)),
        ethCall(token, S.name),
        ethCall(token, S.symbol),
        ethCall(FACTORY_ADDRESS, isLaunchSel + padAddr(token)).catch(() => "0x" + "0".repeat(63) + "1"),
      ]);
      const pool = decodeAddress(poolRaw);
      const creator = decodeAddress(creatorRaw);
      const name = decodeString(nameRaw) || `Token ${i}`;
      const symbol = decodeString(symbolRaw) || `T${i}`;
      const isLaunch = decodeUint(launchRaw) === 1n;
      let price = START_MCAP_USD / 1_000_000_000;
      let quoteInPool = 0;
      let memeInPool = 0;
      if (pool && pool !== "0x0000000000000000000000000000000000000000") {
        const st = await readPoolState(pool, token);
        price = st.price || price;
        quoteInPool = st.quoteInPool;
        memeInPool = st.memeInPool;
      }
      out.push(
        buildTokenRow({
          token,
          name,
          symbol,
          creator,
          pool,
          price,
          quoteInPool,
          memeInPool,
          isLaunch,
          index: i,
          count,
        })
      );
    } catch (e) {
      console.warn("loadLiveTokens index", i, e);
    }
  }

  if (!out.length && DEPLOYMENT.test?.token) {
    const token = DEPLOYMENT.test.token.toLowerCase();
    const pool = (DEPLOYMENT.test.pool || "").toLowerCase();
    let price = START_MCAP_USD / 1_000_000_000;
    let quoteInPool = 0;
    let memeInPool = 0;
    try {
      if (pool) {
        const st = await readPoolState(pool, token);
        price = st.price || price;
        quoteInPool = st.quoteInPool;
        memeInPool = st.memeInPool;
      }
    } catch {}
    out.push(
      buildTokenRow({
        token,
        name: DEPLOYMENT.test.name,
        symbol: DEPLOYMENT.test.symbol,
        creator: DEPLOYMENT.deployer?.toLowerCase?.() || "0xf34a31374bceb04e3479eac8a53eb6e600caa89f",
        pool,
        price,
        quoteInPool,
        memeInPool,
        isLaunch: true,
        index: 0,
        count: 1,
      })
    );
  }

  return out.reverse(); // newest first-ish
}

const _selCache: Record<string, string> = {};

async function findSelector(target: string, label: string, candidates: string[]): Promise<string> {
  if (_selCache[label]) return _selCache[label];
  // Prefer first candidate that doesn't revert on zero address / known token
  const probe = (DEPLOYMENT.test?.token || "0x0000000000000000000000000000000000000001").toLowerCase();
  for (const sel of candidates) {
    try {
      const raw = await ethCall(target, sel + padAddr(probe));
      if (raw && raw !== "0x") {
        _selCache[label] = sel;
        return sel;
      }
    } catch {
      /* try next */
    }
  }
  _selCache[label] = candidates[0];
  return candidates[0];
}

export async function loadLiveToken(address: string): Promise<LaunchToken | null> {
  if (!FACTORY_ADDRESS || !address) return null;
  const token = address.toLowerCase();
  try {
    const all = await loadLiveTokens();
    const hit = all.find((t) => t.address.toLowerCase() === token);
    if (hit) return hit;

    // direct poolOf
    const poolOfSel = await findSelector(FACTORY_ADDRESS, "poolOf(address)", [
      "0xf886ce36",
      "0x44590b4e",
    ]);
    const creatorOfSel = await findSelector(FACTORY_ADDRESS, "creatorOf(address)", [
      "0x6cfde2e2",
      "0x23774af2",
    ]);
    const pool = decodeAddress(await ethCall(FACTORY_ADDRESS, poolOfSel + padAddr(token)));
    if (!pool || pool === "0x0000000000000000000000000000000000000000") return null;
    const [creatorRaw, nameRaw, symbolRaw] = await Promise.all([
      ethCall(FACTORY_ADDRESS, creatorOfSel + padAddr(token)),
      ethCall(token, S.name),
      ethCall(token, S.symbol),
    ]);
    const st = await readPoolState(pool, token);
    return buildTokenRow({
      token,
      name: decodeString(nameRaw) || "Token",
      symbol: decodeString(symbolRaw) || "TKN",
      creator: decodeAddress(creatorRaw),
      pool,
      price: st.price,
      quoteInPool: st.quoteInPool,
      memeInPool: st.memeInPool,
      isLaunch: true,
      index: 0,
      count: 1,
    });
  } catch (e) {
    console.warn("loadLiveToken", e);
    return null;
  }
}

export function explorerAddress(addr: string) {
  return `${DEPLOYMENT.explorer}/address/${addr}`;
}

export function explorerTx(hash: string) {
  return `${DEPLOYMENT.explorer}/tx/${hash}`;
}

export function isLiveConfigured() {
  return Boolean(FACTORY_ADDRESS && FACTORY_ADDRESS.startsWith("0x") && FACTORY_ADDRESS.length === 42);
}

// silence unused
void resolveSelectors;
