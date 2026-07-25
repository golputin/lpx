import {
  BrowserProvider,
  Contract,
  JsonRpcProvider,
  MaxUint256,
  formatEther,
  formatUnits,
  parseEther,
  parseUnits,
} from "ethers";
import { CHAIN_ID, FACTORY_ADDRESS, POOL_FEE, RPC_URL, shortAddr } from "./config";
import { DEPLOYMENT } from "./deployment";

export const STABLE_CHAIN = {
  chainId: `0x${CHAIN_ID.toString(16)}`,
  chainName: "Stable",
  nativeCurrency: { name: "USDT0", symbol: "USDT0", decimals: 18 },
  rpcUrls: [RPC_URL],
  blockExplorerUrls: [DEPLOYMENT.explorer],
} as const;

const FACTORY_ABI = [
  "function createToken(string name, string symbol) returns (address token, address pool)",
  "function tokenCount() view returns (uint256)",
  "function allTokens(uint256) view returns (address)",
  "function poolOf(address) view returns (address)",
  "function creatorOf(address) view returns (address)",
  "function isLaunch(address) view returns (bool)",
  "function collectFees(address token) returns (uint256 amount0, uint256 amount1)",
  "event TokenCreated(address indexed token, address indexed creator, string name, string symbol, address pool, uint160 sqrtPriceX96, uint128 liquidity)",
] as const;

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
] as const;

const ROUTER_ABI = [
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)",
  "function factory() view returns (address)",
  "function WETH9() view returns (address)",
] as const;

const QUOTER_ABI = [
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) view returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
] as const;

const POOL_ABI = [
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)",
  "function liquidity() view returns (uint128)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
] as const;

export type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export function getInjected(): EthereumProvider | undefined {
  if (typeof window === "undefined") return undefined;
  return window.ethereum;
}

export function readRpc() {
  return new JsonRpcProvider(RPC_URL, CHAIN_ID);
}

export async function connectWallet(): Promise<{ address: string; provider: BrowserProvider }> {
  const eth = getInjected();
  if (!eth) throw new Error("No wallet found. Install MetaMask / Rabby / OKX.");
  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  if (!accounts?.[0]) throw new Error("No account returned");
  await ensureStableChain(eth);
  const provider = new BrowserProvider(eth, CHAIN_ID);
  return { address: accounts[0].toLowerCase(), provider };
}

export async function ensureStableChain(eth: EthereumProvider) {
  const current = (await eth.request({ method: "eth_chainId" })) as string;
  if (parseInt(current, 16) === CHAIN_ID) return;
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: STABLE_CHAIN.chainId }],
    });
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    if (code === 4902 || code === -32603) {
      await eth.request({ method: "wallet_addEthereumChain", params: [STABLE_CHAIN] });
      return;
    }
    throw err;
  }
}

export async function getNativeBalance(address: string, provider?: BrowserProvider | JsonRpcProvider) {
  const p = provider || readRpc();
  const bal = await p.getBalance(address);
  return Number(formatEther(bal));
}

export async function getTokenBalance(
  token: string,
  owner: string,
  provider?: BrowserProvider | JsonRpcProvider
) {
  const p = provider || readRpc();
  const c = new Contract(token, ERC20_ABI, p);
  const [bal, dec] = await Promise.all([c.balanceOf(owner), c.decimals().catch(() => 18)]);
  return Number(formatUnits(bal, dec));
}

export async function getQuoteTokenBalance(
  owner: string,
  provider?: BrowserProvider | JsonRpcProvider
) {
  return getTokenBalance(DEPLOYMENT.quoteToken, owner, provider);
}

function quoteAmount(human: number) {
  return parseUnits(String(human), DEPLOYMENT.quoteDecimals || 6);
}

function memeAmount(human: number) {
  return parseEther(String(human));
}

/** Quote buy: spend `quoteIn` USDT0 (6 dec human) → meme tokens out */
export async function quoteBuy(poolOrIgnored: string, quoteIn: number, token?: string) {
  if (quoteIn <= 0) return { tokensOut: 0, fee: 0 };
  const meme = token;
  if (!meme) return { tokensOut: 0, fee: 0 };
  try {
    const quoter = new Contract(DEPLOYMENT.swapRouter, QUOTER_ABI, readRpc());
    const res = await quoter.quoteExactInputSingle.staticCall({
      tokenIn: DEPLOYMENT.quoteToken,
      tokenOut: meme,
      amountIn: quoteAmount(quoteIn),
      fee: POOL_FEE,
      sqrtPriceLimitX96: 0n,
    });
    const amountOut = res.amountOut ?? res[0];
    return { tokensOut: Number(formatEther(amountOut)), fee: quoteIn * 0.01 };
  } catch (e) {
    console.warn("quoteBuy", e);
    return { tokensOut: 0, fee: 0 };
  }
}

/** Quote sell: sell meme tokens → USDT0 out */
export async function quoteSell(poolOrIgnored: string, tokensIn: number, token?: string) {
  if (tokensIn <= 0) return { quoteOut: 0, fee: 0 };
  const meme = token;
  if (!meme) return { quoteOut: 0, fee: 0 };
  try {
    const quoter = new Contract(DEPLOYMENT.swapRouter, QUOTER_ABI, readRpc());
    const res = await quoter.quoteExactInputSingle.staticCall({
      tokenIn: meme,
      tokenOut: DEPLOYMENT.quoteToken,
      amountIn: memeAmount(tokensIn),
      fee: POOL_FEE,
      sqrtPriceLimitX96: 0n,
    });
    const amountOut = res.amountOut ?? res[0];
    return {
      quoteOut: Number(formatUnits(amountOut, DEPLOYMENT.quoteDecimals || 6)),
      fee: 0,
    };
  } catch (e) {
    console.warn("quoteSell", e);
    return { quoteOut: 0, fee: 0 };
  }
}

async function ensureAllowance(
  token: string,
  owner: string,
  spender: string,
  amount: bigint,
  signer: Awaited<ReturnType<BrowserProvider["getSigner"]>>
) {
  const c = new Contract(token, ERC20_ABI, signer);
  const current: bigint = await c.allowance(owner, spender);
  if (current >= amount) return;
  const tx = await c.approve(spender, MaxUint256);
  await tx.wait();
}

/** Buy meme with USDT0 ERC20 via Uni V3 router. `curve` arg kept as pool for compat; pass token in opts.token */
export async function buyOnCurve(opts: {
  provider: BrowserProvider;
  curve: string; // pool (unused for path, we use token+quote)
  token?: string;
  amountUsdt0: number;
  minTokensOut?: number;
  slippageBps?: number;
}) {
  if (!opts.token) throw new Error("token required for V3 buy");
  const signer = await opts.provider.getSigner();
  const me = await signer.getAddress();
  const amountIn = quoteAmount(opts.amountUsdt0);
  await ensureAllowance(DEPLOYMENT.quoteToken, me, DEPLOYMENT.swapRouter, amountIn, signer);

  let minOut = 0n;
  if (opts.minTokensOut != null) {
    minOut = memeAmount(opts.minTokensOut);
  } else {
    const q = await quoteBuy(opts.curve, opts.amountUsdt0, opts.token);
    const slip = BigInt(opts.slippageBps ?? 300);
    minOut = (memeAmount(q.tokensOut) * (10_000n - slip)) / 10_000n;
  }

  const router = new Contract(DEPLOYMENT.swapRouter, ROUTER_ABI, signer);
  const tx = await router.exactInputSingle(
    {
      tokenIn: DEPLOYMENT.quoteToken,
      tokenOut: opts.token,
      fee: POOL_FEE,
      recipient: me,
      amountIn,
      amountOutMinimum: minOut,
      sqrtPriceLimitX96: 0n,
    },
    { gasLimit: 800_000n }
  );
  const rc = await tx.wait();
  return { hash: tx.hash as string, receipt: rc };
}

export async function sellOnCurve(opts: {
  provider: BrowserProvider;
  curve: string;
  token: string;
  tokensIn: number;
  slippageBps?: number;
}) {
  const signer = await opts.provider.getSigner();
  const me = await signer.getAddress();
  const amountIn = memeAmount(opts.tokensIn);
  await ensureAllowance(opts.token, me, DEPLOYMENT.swapRouter, amountIn, signer);

  const q = await quoteSell(opts.curve, opts.tokensIn, opts.token);
  const slip = BigInt(opts.slippageBps ?? 300);
  const minOut =
    (quoteAmount(q.quoteOut) * (10_000n - slip)) / 10_000n;

  const router = new Contract(DEPLOYMENT.swapRouter, ROUTER_ABI, signer);
  const tx = await router.exactInputSingle(
    {
      tokenIn: opts.token,
      tokenOut: DEPLOYMENT.quoteToken,
      fee: POOL_FEE,
      recipient: me,
      amountIn,
      amountOutMinimum: minOut,
      sqrtPriceLimitX96: 0n,
    },
    { gasLimit: 800_000n }
  );
  const rc = await tx.wait();
  return { hash: tx.hash as string, receipt: rc, quoteOut: q.quoteOut };
}

export async function createTokenOnFactory(opts: {
  provider: BrowserProvider;
  name: string;
  symbol: string;
  firstBuy?: number;
}) {
  if (!FACTORY_ADDRESS) throw new Error("Factory not configured");
  const signer = await opts.provider.getSigner();
  const f = new Contract(FACTORY_ADDRESS, FACTORY_ABI, signer);
  const tx = await f.createToken(opts.name, opts.symbol, { gasLimit: 6_500_000n });
  const rc = await tx.wait();
  let token = "";
  let pool = "";
  for (const log of rc.logs || []) {
    try {
      const parsed = f.interface.parseLog(log);
      if (parsed?.name === "TokenCreated") {
        token = String(parsed.args.token);
        pool = String(parsed.args.pool);
      }
    } catch {
      /* skip */
    }
  }
  // optional first buy via router
  if (token && (opts.firstBuy || 0) > 0) {
    try {
      await buyOnCurve({
        provider: opts.provider,
        curve: pool,
        token,
        amountUsdt0: opts.firstBuy || 0,
      });
    } catch (e) {
      console.warn("first buy failed", e);
    }
  }
  return { hash: tx.hash as string, token, curve: pool, pool, receipt: rc };
}

export function txUrl(hash: string) {
  return `${DEPLOYMENT.explorer}/tx/${hash}`;
}

export function addrUrl(addr: string) {
  return `${DEPLOYMENT.explorer}/address/${addr}`;
}

export function formatTradeError(e: unknown): string {
  const any = e as {
    shortMessage?: string;
    reason?: string;
    message?: string;
    code?: number | string;
    info?: { error?: { message?: string } };
  };
  if (any?.code === 4001 || any?.code === "ACTION_REJECTED") return "User rejected in wallet";
  const msg =
    any?.shortMessage ||
    any?.reason ||
    any?.info?.error?.message ||
    any?.message ||
    String(e);
  if (/insufficient funds/i.test(msg)) return "Insufficient USDT0 for gas + trade";
  if (/STF|transfer amount exceeds|allowance/i.test(msg))
    return "Need USDT0 (6-dec) balance + approve for swap";
  if (/network/i.test(msg)) return "Wrong network — switch to Stable (988)";
  return msg.length > 140 ? msg.slice(0, 140) + "…" : msg;
}

export { formatEther, parseEther, shortAddr, FACTORY_ABI, ERC20_ABI, ROUTER_ABI, POOL_ABI };
