import { FACTORY_ADDRESS, GRAD_TARGET, RPC_URL } from "./config";
import { DEPLOYMENT } from "./deployment";
import { LaunchToken, placeholderImage } from "./demo";

/** function selectors (keccak4) for LaunchpadFactory + BondingCurve + ERC20 */
const S = {
  allTokensLength: "0xdbb80e42",
  allTokens: "0x634282af",
  tokenToCurve: "0x0c74fbac",
  tokenCreator: "0x23774af2",
  name: "0x06fdde03",
  symbol: "0x95d89b41",
  realQuoteReserves: "0xc196c7c5",
  realTokenReserves: "0x5c25c6dd",
  graduated: "0xe7c2b772",
  progressBps: "0x6c1eba15",
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
  const h = hex.replace(/^0x/, "");
  if (!h) return 0n;
  return BigInt("0x" + h.slice(0, 64));
}

function decodeAddress(hex: string): string {
  const h = hex.replace(/^0x/, "");
  return ("0x" + h.slice(24, 64)).toLowerCase();
}

function decodeString(hex: string): string {
  const h = hex.replace(/^0x/, "");
  if (h.length < 128) return "";
  const offset = Number(BigInt("0x" + h.slice(0, 64)));
  const len = Number(BigInt("0x" + h.slice(offset * 2, offset * 2 + 64)));
  const data = h.slice(offset * 2 + 64, offset * 2 + 64 + len * 2);
  const bytes = data.match(/.{1,2}/g) || [];
  return bytes.map((b) => String.fromCharCode(parseInt(b, 16))).join("");
}

function asNum(v: bigint): number {
  return Number(v) / 1e18;
}

export async function fetchFactoryTokenCount(): Promise<number> {
  if (!FACTORY_ADDRESS) return 0;
  const raw = await ethCall(FACTORY_ADDRESS, S.allTokensLength);
  return Number(decodeUint(raw));
}

export async function loadLiveTokens(): Promise<LaunchToken[]> {
  if (!FACTORY_ADDRESS) return [];

  let count = 0;
  try {
    count = await fetchFactoryTokenCount();
  } catch (e) {
    console.warn("factory count failed", e);
    count = 0;
  }

  const out: LaunchToken[] = [];

  for (let i = 0; i < count; i++) {
    try {
      const tokenRaw = await ethCall(FACTORY_ADDRESS, S.allTokens + padUint(i));
      const token = decodeAddress(tokenRaw);
      const [curveRaw, creatorRaw, nameRaw, symbolRaw] = await Promise.all([
        ethCall(FACTORY_ADDRESS, S.tokenToCurve + padAddr(token)),
        ethCall(FACTORY_ADDRESS, S.tokenCreator + padAddr(token)),
        ethCall(token, S.name),
        ethCall(token, S.symbol),
      ]);
      const curve = decodeAddress(curveRaw);
      const creator = decodeAddress(creatorRaw);
      const name = decodeString(nameRaw) || `Token ${i}`;
      const symbol = decodeString(symbolRaw) || `T${i}`;

      const [rqRaw, rtRaw, gradRaw, progRaw] = await Promise.all([
        ethCall(curve, S.realQuoteReserves),
        ethCall(curve, S.realTokenReserves),
        ethCall(curve, S.graduated),
        ethCall(curve, S.progressBps),
      ]);

      const raised = asNum(decodeUint(rqRaw));
      const left = asNum(decodeUint(rtRaw));
      const graduated = decodeUint(gradRaw) === 1n;
      const progressBps = Number(decodeUint(progRaw));
      const progress =
        progressBps > 0 ? progressBps / 100 : Math.min(100, (raised / GRAD_TARGET) * 100);
      const sold = Math.max(0, 1_000_000_000 - left);
      const price = sold > 0 ? raised / sold : raised > 0 ? raised / 150_000 : 0.00000002;
      const mcap = price * 1_000_000_000;

      out.push({
        address: token,
        name,
        symbol,
        creator,
        curve,
        createdAt: Math.floor(Date.now() / 1000) - 90 * (count - i),
        raised,
        mcap: Math.max(mcap, raised * 4),
        vol24h: raised,
        holders: raised > 0 ? 1 : 0,
        progress,
        status: graduated ? "graduated" : "live",
        price,
        change24h: 0,
        description: `curve ${curve.slice(0, 10)}… · factory live`,
        creatorFeesEarned: raised * 0.008,
        creatorFeesClaimed: 0,
        platformFeesEarned: raised * 0.002,
        imageHue: 140 + ((i * 37) % 200),
        imageUrl: placeholderImage(symbol + token, 140 + ((i * 37) % 200)),
        website: "",
        twitter: "",
        telegram: "",
      });
    } catch (e) {
      console.warn("loadLiveTokens index", i, e);
    }
  }

  if (!out.length && DEPLOYMENT.test?.token) {
    const raised = Number(DEPLOYMENT.test.raised || 0);
    out.push({
      address: DEPLOYMENT.test.token.toLowerCase(),
      name: DEPLOYMENT.test.name,
      symbol: DEPLOYMENT.test.symbol,
      creator: "0xf34a31374bceb04e3479eac8a53eb6e600caa89f",
      curve: DEPLOYMENT.test.curve.toLowerCase(),
      createdAt: Math.floor(Date.now() / 1000) - 180,
      raised,
      mcap: raised * 5,
      vol24h: raised,
      holders: 1,
      progress: (raised / GRAD_TARGET) * 100,
      status: "live",
      price: 0.0000065,
      change24h: 0,
      description: `Live test · ${DEPLOYMENT.test.curve}`,
      creatorFeesEarned: raised * 0.008,
      creatorFeesClaimed: 0,
      platformFeesEarned: raised * 0.002,
      imageHue: 142,
      imageUrl: placeholderImage("TEST" + DEPLOYMENT.test.token, 142),
    });
  }

  return out;
}

export async function loadLiveToken(address: string): Promise<LaunchToken | null> {
  if (!FACTORY_ADDRESS || !address) return null;
  const token = address.toLowerCase();
  try {
    const curveRaw = await ethCall(FACTORY_ADDRESS, S.tokenToCurve + padAddr(token));
    const curve = decodeAddress(curveRaw);
    if (!curve || curve === "0x0000000000000000000000000000000000000000") {
      // maybe not in this factory — try listing match
      const all = await loadLiveTokens();
      return all.find((t) => t.address.toLowerCase() === token) || null;
    }
    const [creatorRaw, nameRaw, symbolRaw, rqRaw, rtRaw, gradRaw, progRaw] = await Promise.all([
      ethCall(FACTORY_ADDRESS, S.tokenCreator + padAddr(token)),
      ethCall(token, S.name),
      ethCall(token, S.symbol),
      ethCall(curve, S.realQuoteReserves),
      ethCall(curve, S.realTokenReserves),
      ethCall(curve, S.graduated),
      ethCall(curve, S.progressBps),
    ]);
    const creator = decodeAddress(creatorRaw);
    const name = decodeString(nameRaw) || "Token";
    const symbol = decodeString(symbolRaw) || "TKN";
    const raised = asNum(decodeUint(rqRaw));
    const left = asNum(decodeUint(rtRaw));
    const graduated = decodeUint(gradRaw) === 1n;
    const progressBps = Number(decodeUint(progRaw));
    const progress =
      progressBps > 0 ? progressBps / 100 : Math.min(100, (raised / GRAD_TARGET) * 100);
    const sold = Math.max(0, 1_000_000_000 - left);
    const price = sold > 0 ? raised / sold : raised > 0 ? raised / 150_000 : 0.00000002;
    const mcap = price * 1_000_000_000;
    return {
      address: token,
      name,
      symbol,
      creator,
      curve,
      createdAt: Math.floor(Date.now() / 1000),
      raised,
      mcap: Math.max(mcap, raised * 4),
      vol24h: raised,
      holders: raised > 0 ? 1 : 0,
      progress,
      status: graduated ? "graduated" : "live",
      price,
      change24h: 0,
      description: `curve ${curve.slice(0, 10)}… · factory live`,
      creatorFeesEarned: raised * 0.008,
      creatorFeesClaimed: 0,
      platformFeesEarned: raised * 0.002,
      imageHue: 142,
      imageUrl: placeholderImage(symbol + token, 142),
      website: "",
      twitter: "",
      telegram: "",
    };
  } catch (e) {
    console.warn("loadLiveToken", e);
    const all = await loadLiveTokens().catch(() => [] as LaunchToken[]);
    return all.find((t) => t.address.toLowerCase() === token) || null;
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
