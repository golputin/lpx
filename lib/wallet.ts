import { BrowserProvider, Contract, JsonRpcProvider, formatEther, parseEther } from "ethers";
import { CHAIN_ID, FACTORY_ADDRESS, RPC_URL, shortAddr } from "./config";
import { DEPLOYMENT } from "./deployment";

export const STABLE_CHAIN = {
  chainId: `0x${CHAIN_ID.toString(16)}`, // 0x3dc
  chainName: "Stable",
  nativeCurrency: { name: "USDT0", symbol: "USDT0", decimals: 18 },
  rpcUrls: [RPC_URL],
  blockExplorerUrls: [DEPLOYMENT.explorer],
} as const;

const FACTORY_ABI = [
  "function createToken(string name, string symbol, uint256 initialBuyMinTokens) payable returns (address token, address curve)",
  "function allTokensLength() view returns (uint256)",
  "function allTokens(uint256) view returns (address)",
  "function tokenToCurve(address) view returns (address)",
  "function tokenCreator(address) view returns (address)",
  "event TokenLaunched(address indexed token, address indexed curve, address indexed creator, string name, string symbol, uint256 timestamp)",
] as const;

const CURVE_ABI = [
  "function buy(uint256 minTokensOut, address to) payable",
  "function sell(uint256 tokensIn, uint256 minQuoteOut, address to)",
  "function getBuyPrice(uint256 quoteIn) view returns (uint256 tokensOut, uint256 fee)",
  "function getSellPrice(uint256 tokensIn) view returns (uint256 quoteOut, uint256 fee)",
  "function realQuoteReserves() view returns (uint256)",
  "function realTokenReserves() view returns (uint256)",
  "function graduated() view returns (bool)",
  "function progressBps() view returns (uint256)",
  "function creator() view returns (address)",
  "function token() view returns (address)",
  "function feeBps() view returns (uint256)",
] as const;

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
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
  if (!eth) {
    throw new Error("No wallet found. Install MetaMask / Rabby / OKX.");
  }
  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  if (!accounts?.[0]) throw new Error("No account returned");
  await ensureStableChain(eth);
  const provider = new BrowserProvider(eth, CHAIN_ID);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== CHAIN_ID) {
    await ensureStableChain(eth);
  }
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
    // 4902 = chain not added
    if (code === 4902 || code === -32603) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [STABLE_CHAIN],
      });
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

export async function getTokenBalance(token: string, owner: string, provider?: BrowserProvider | JsonRpcProvider) {
  const p = provider || readRpc();
  const c = new Contract(token, ERC20_ABI, p);
  const bal = await c.balanceOf(owner);
  return Number(formatEther(bal));
}

export async function quoteBuy(curve: string, quoteIn: number) {
  if (!curve || quoteIn <= 0) return { tokensOut: 0, fee: 0 };
  const c = new Contract(curve, CURVE_ABI, readRpc());
  const [tokensOut, fee] = await c.getBuyPrice(parseEther(String(quoteIn)));
  return { tokensOut: Number(formatEther(tokensOut)), fee: Number(formatEther(fee)) };
}

export async function quoteSell(curve: string, tokensIn: number) {
  if (!curve || tokensIn <= 0) return { quoteOut: 0, fee: 0 };
  const c = new Contract(curve, CURVE_ABI, readRpc());
  const [quoteOut, fee] = await c.getSellPrice(parseEther(String(tokensIn)));
  return { quoteOut: Number(formatEther(quoteOut)), fee: Number(formatEther(fee)) };
}

export async function buyOnCurve(opts: {
  provider: BrowserProvider;
  curve: string;
  amountUsdt0: number;
  minTokensOut?: number;
  slippageBps?: number;
}) {
  const signer = await opts.provider.getSigner();
  const c = new Contract(opts.curve, CURVE_ABI, signer);
  const value = parseEther(String(opts.amountUsdt0));
  let minOut = 0n;
  if (opts.minTokensOut != null) {
    minOut = parseEther(String(opts.minTokensOut));
  } else {
    const [tokensOut] = await c.getBuyPrice(value);
    const slip = BigInt(opts.slippageBps ?? 300); // 3%
    minOut = (tokensOut * (10_000n - slip)) / 10_000n;
  }
  const to = await signer.getAddress();
  const tx = await c.buy(minOut, to, { value, gasLimit: 600_000n });
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
  const amount = parseEther(String(opts.tokensIn));
  // burn is onlyOwner(curve) — curve.sell burns from msg.sender without approve
  const c = new Contract(opts.curve, CURVE_ABI, signer);
  const [quoteOut] = await c.getSellPrice(amount);
  const slip = BigInt(opts.slippageBps ?? 300);
  const minOut = (quoteOut * (10_000n - slip)) / 10_000n;
  const to = await signer.getAddress();
  const tx = await c.sell(amount, minOut, to, { gasLimit: 600_000n });
  const rc = await tx.wait();
  return { hash: tx.hash as string, receipt: rc, quoteOut: Number(formatEther(quoteOut)) };
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
  const value = parseEther(String(opts.firstBuy || 0));
  const tx = await f.createToken(opts.name, opts.symbol, 0n, {
    value,
    gasLimit: 4_500_000n,
  });
  const rc = await tx.wait();
  let token = "";
  let curve = "";
  for (const log of rc.logs || []) {
    try {
      const parsed = f.interface.parseLog(log);
      if (parsed?.name === "TokenLaunched") {
        token = String(parsed.args.token);
        curve = String(parsed.args.curve);
      }
    } catch {
      /* skip */
    }
  }
  return { hash: tx.hash as string, token, curve, receipt: rc };
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
  if (/network/i.test(msg)) return "Wrong network — switch to Stable (988)";
  return msg.length > 140 ? msg.slice(0, 140) + "…" : msg;
}

export { formatEther, parseEther, shortAddr, FACTORY_ABI, CURVE_ABI, ERC20_ABI };
