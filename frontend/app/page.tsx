"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BrowserProvider, Contract, formatEther, parseEther } from "ethers";
import {
  BOX_ABI,
  BOX_ADDRESS,
  CHAIN_ID,
  CHAIN_NAME,
  DEMO_MODE,
  ERC20_ABI,
  OPEN_COST_SBOX,
  PRIZE_TOKEN,
  RPC_URL,
  SBOX_ADDRESS,
  TIERS,
  demoOpen,
  fmt,
  shortAddr,
  timeAgo,
} from "@/lib/config";

type Hist = {
  user: string;
  tierIndex: number;
  prize: number;
  ts: number;
  demo?: boolean;
};

declare global {
  interface Window {
    ethereum?: any;
  }
}

const DEMO_KEY = "stablebox_demo_history_v1";
const DEMO_BAL_KEY = "stablebox_demo_sbox_v1";

export default function HomePage() {
  const [account, setAccount] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [opened, setOpened] = useState(false);
  const [lastPrize, setLastPrize] = useState<number | null>(null);
  const [lastTier, setLastTier] = useState<number | null>(null);

  const [pool, setPool] = useState(DEMO_MODE ? 420.5 : 0);
  const [totalOpened, setTotalOpened] = useState(DEMO_MODE ? 128 : 0);
  const [sboxBal, setSboxBal] = useState(DEMO_MODE ? 25 : 0);
  const [history, setHistory] = useState<Hist[]>([]);

  const loadDemo = useCallback(() => {
    try {
      const raw = localStorage.getItem(DEMO_KEY);
      const h: Hist[] = raw ? JSON.parse(raw) : seedDemoHistory();
      setHistory(h);
      setTotalOpened(h.length);
      const bal = Number(localStorage.getItem(DEMO_BAL_KEY) || "25");
      setSboxBal(bal);
      const paid = h.reduce((a, x) => a + x.prize, 0);
      setPool(Math.max(50, 500 - paid * 0.15));
    } catch {
      setHistory(seedDemoHistory());
    }
  }, []);

  const refreshOnchain = useCallback(async () => {
    if (DEMO_MODE || !BOX_ADDRESS) return;
    try {
      const { JsonRpcProvider } = await import("ethers");
      const provider = new JsonRpcProvider(RPC_URL);
      const box = new Contract(BOX_ADDRESS, BOX_ABI, provider);
      const [p, t, cost] = await Promise.all([box.poolBalance(), box.totalOpened(), box.openCost()]);
      setPool(Number(formatEther(p)));
      setTotalOpened(Number(t));
      void cost;
      const hist = await box.getHistory(0, 20);
      setHistory(
        hist.map((x: any) => ({
          user: x.user,
          tierIndex: Number(x.tierIndex),
          prize: Number(formatEther(x.prizeAmount)),
          ts: Number(x.timestamp),
        }))
      );
      if (account && SBOX_ADDRESS) {
        const sbox = new Contract(SBOX_ADDRESS, ERC20_ABI, provider);
        const bal = await sbox.balanceOf(account);
        setSboxBal(Number(formatEther(bal)));
      }
    } catch (e: any) {
      setErr(e.message || String(e));
    }
  }, [account]);

  useEffect(() => {
    if (DEMO_MODE) loadDemo();
    else refreshOnchain();
    const id = setInterval(() => {
      if (DEMO_MODE) return;
      refreshOnchain();
    }, 12000);
    return () => clearInterval(id);
  }, [loadDemo, refreshOnchain]);

  const ev = useMemo(() => 0.25 * 0.9 + 1 * 0.09 + 5 * 0.01, []);

  async function connect() {
    setErr(null);
    if (DEMO_MODE) {
      setAccount("0xDemo000000000000000000000000000000000001");
      setMsg("Demo wallet connected — opens are simulated locally.");
      return;
    }
    if (!window.ethereum) {
      setErr("No wallet found. Install MetaMask / Rabby.");
      return;
    }
    const provider = new BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    const net = await provider.getNetwork();
    if (Number(net.chainId) !== CHAIN_ID) {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x" + CHAIN_ID.toString(16) }],
        });
      } catch {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: "0x" + CHAIN_ID.toString(16),
              chainName: CHAIN_NAME,
              rpcUrls: [RPC_URL],
              nativeCurrency: { name: "Stable", symbol: "STB", decimals: 18 },
            },
          ],
        });
      }
    }
    const signer = await provider.getSigner();
    setAccount(await signer.getAddress());
    setMsg("Wallet connected");
  }

  async function openBox() {
    setErr(null);
    setMsg(null);
    setBusy(true);
    setShake(true);
    setOpened(false);
    setLastPrize(null);
    try {
      await sleep(550);
      if (DEMO_MODE) {
        if (sboxBal < OPEN_COST_SBOX) throw new Error("Not enough SBOX (need 0.5)");
        const res = demoOpen(Date.now() ^ (Math.random() * 1e9));
        const nextBal = +(sboxBal - OPEN_COST_SBOX).toFixed(4);
        setSboxBal(nextBal);
        localStorage.setItem(DEMO_BAL_KEY, String(nextBal));
        const row: Hist = {
          user: account || "0xDemo",
          tierIndex: res.tierIndex,
          prize: res.prize,
          ts: Math.floor(Date.now() / 1000),
          demo: true,
        };
        const h = [row, ...history].slice(0, 40);
        setHistory(h);
        localStorage.setItem(DEMO_KEY, JSON.stringify(h));
        setTotalOpened((n) => n + 1);
        setPool((p) => Math.max(0, +(p - res.prize).toFixed(4)));
        setLastPrize(res.prize);
        setLastTier(res.tierIndex);
        setOpened(true);
        setMsg(`You won $${res.prize.toFixed(2)} USDT!`);
        return;
      }

      if (!window.ethereum || !account || !BOX_ADDRESS || !SBOX_ADDRESS) {
        throw new Error("Wallet / contracts not ready");
      }
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const sbox = new Contract(SBOX_ADDRESS, ERC20_ABI, signer);
      const box = new Contract(BOX_ADDRESS, BOX_ABI, signer);
      const cost = await box.openCost();
      const allowance = await sbox.allowance(account, BOX_ADDRESS);
      if (allowance < cost) {
        const txa = await sbox.approve(BOX_ADDRESS, parseEther("1000000"));
        await txa.wait();
      }
      const entropy = BigInt(Date.now());
      const tx = await box.openBox(entropy);
      const rc = await tx.wait();
      let prize = 0.25;
      let tier = 0;
      for (const log of rc.logs) {
        try {
          const parsed = box.interface.parseLog(log);
          if (parsed?.name === "Opened") {
            prize = Number(formatEther(parsed.args.prizeAmount));
            tier = Number(parsed.args.tierIndex);
          }
        } catch {
          /* skip */
        }
      }
      setLastPrize(prize);
      setLastTier(tier);
      setOpened(true);
      setMsg(`You won $${prize.toFixed(2)} USDT!`);
      await refreshOnchain();
    } catch (e: any) {
      setErr(e.shortMessage || e.message || String(e));
    } finally {
      setShake(false);
      setBusy(false);
    }
  }

  function topUpDemo() {
    const next = sboxBal + 10;
    setSboxBal(next);
    localStorage.setItem(DEMO_BAL_KEY, String(next));
    setMsg("+10 SBOX (demo faucet)");
  }

  return (
    <div className="shell">
      <nav className="nav">
        <div className="brand">
          <img src="/logo.svg" alt="StableBox logo" />
          <div>
            <h1>STABLEBOX</h1>
            <p>Mystery boxes on Stable · pay SBOX · win USDT</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {DEMO_MODE && (
            <span className="badge" style={{ background: "rgba(251,191,36,.15)", color: "#fbbf24" }}>
              DEMO
            </span>
          )}
          <button className="btn" onClick={connect}>
            {account ? shortAddr(account, 4) : "Connect wallet"}
          </button>
        </div>
      </nav>

      <section className="hero">
        <div className="panel">
          <div className="kicker">
            <span className="dot" /> Live on {CHAIN_NAME} · Chain {CHAIN_ID}
          </div>
          <h2>
            Open a box.
            <br />
            Pull random USDT.
          </h2>
          <p className="lead">
            Each open costs <b>0.5 SBOX</b> (~$0.50). Prizes are paid in USDT from the on-chain pool.
            Most opens hit the small prize — the $5 hit is rare by design.
          </p>

          <div className="stats">
            <div className="stat">
              <div className="l">Prize pool</div>
              <div className="v">{fmt(pool, 2)} USDT</div>
            </div>
            <div className="stat">
              <div className="l">Boxes opened</div>
              <div className="v">{totalOpened}</div>
            </div>
            <div className="stat">
              <div className="l">Your SBOX</div>
              <div className="v">{fmt(sboxBal, 2)}</div>
            </div>
          </div>

          <div className="tiers">
            {TIERS.map((t) => (
              <div key={t.label} className="tier" style={{ ["--c" as any]: t.color }}>
                <span className="chance">{t.chance}</span>
                <h3 style={{ color: t.color }}>{t.label}</h3>
                <p>USDT prize</p>
              </div>
            ))}
          </div>

          <p className="muted" style={{ margin: "0 0 8px", fontSize: ".85rem" }}>
            Expected value ≈ <b className="ok">${ev.toFixed(3)}</b> USDT per open · cost{" "}
            <b>${OPEN_COST_SBOX.toFixed(2)}</b> in SBOX (house edge when SBOX ≈ $1)
          </p>

          {DEMO_MODE && (
            <div className="note">
              Demo mode: contracts not deployed yet. Opens are simulated in-browser with the same
              90% / 9% / 1% weights. After deploy, set <code>NEXT_PUBLIC_BOX</code> +{" "}
              <code>NEXT_PUBLIC_SBOX</code>.
            </div>
          )}
        </div>

        <div className="panel box-stage">
          <div className={`chest ${shake ? "shake" : ""} ${opened ? "open" : ""}`}>
            <img src="/logo.svg" alt="box" style={{ width: "100%", height: "100%" }} />
          </div>
          <div className="prize-pop">
            {lastPrize != null ? (
              <>
                <div
                  className="amount"
                  style={{ color: TIERS[lastTier || 0]?.color || "var(--mint)" }}
                >
                  +${lastPrize.toFixed(2)}
                </div>
                <div className="sub">USDT credited · tier {(lastTier || 0) + 1}</div>
              </>
            ) : (
              <>
                <div className="amount" style={{ fontSize: "1.2rem", color: "var(--muted)" }}>
                  Ready
                </div>
                <div className="sub">0.5 SBOX per open</div>
              </>
            )}
          </div>
          <div style={{ position: "relative", zIndex: 2, display: "flex", gap: 10, marginTop: 8 }}>
            <button className="btn primary lg" disabled={busy || !account} onClick={openBox}>
              {busy ? "Opening…" : "Open box"}
            </button>
            {DEMO_MODE && (
              <button className="btn lg" onClick={topUpDemo} disabled={busy}>
                Faucet +10
              </button>
            )}
          </div>
          {!account && <p className="muted" style={{ position: "relative", zIndex: 2 }}>Connect wallet to open</p>}
          {msg && <p className="ok" style={{ position: "relative", zIndex: 2 }}>{msg}</p>}
          {err && <p className="err" style={{ position: "relative", zIndex: 2 }}>{err}</p>}
        </div>
      </section>

      <section className="grid2">
        <div className="panel">
          <div className="kicker">How it works</div>
          <div className="how">
            <div className="step">
              <div className="n">1</div>
              <div>
                <h4>Get SBOX</h4>
                <p>Hold SBOX token. Each open burns/spends 0.5 SBOX.</p>
              </div>
            </div>
            <div className="step">
              <div className="n">2</div>
              <div>
                <h4>Open a mystery box</h4>
                <p>Smart contract rolls weighted RNG and picks a prize tier.</p>
              </div>
            </div>
            <div className="step">
              <div className="n">3</div>
              <div>
                <h4>Receive USDT</h4>
                <p>Prize pool pays 0.25 / 1 / 5 USDT instantly to your wallet.</p>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 16 }} className="muted mono">
            Prize token: {shortAddr(PRIZE_TOKEN, 6)}
            {BOX_ADDRESS ? ` · Box ${shortAddr(BOX_ADDRESS, 6)}` : " · Box not deployed"}
          </div>
        </div>

        <div className="panel">
          <div className="kicker">Recent opens</div>
          <div className="history">
            {history.length === 0 && <div className="muted">No opens yet.</div>}
            {history.map((h, i) => (
              <div className="row" key={`${h.ts}-${i}`}>
                <span
                  className="badge"
                  style={{
                    background: `${TIERS[h.tierIndex]?.color}22`,
                    color: TIERS[h.tierIndex]?.color,
                  }}
                >
                  {TIERS[h.tierIndex]?.label || "?"}
                </span>
                <div>
                  <div className="mono">{shortAddr(h.user, 4)}</div>
                  <div className="muted" style={{ fontSize: ".75rem" }}>
                    {timeAgo(h.ts)} ago {h.demo ? "· demo" : ""}
                  </div>
                </div>
                <div className="ok" style={{ fontWeight: 800 }}>
                  +{fmt(h.prize, 2)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="footer">
        <span>StableBox · not financial advice · play responsibly</span>
        <span>Odds: 90% $0.25 · 9% $1 · 1% $5</span>
      </footer>
    </div>
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function seedDemoHistory(): Hist[] {
  const users = [
    "0xabc0000000000000000000000000000000000001",
    "0xdef0000000000000000000000000000000000002",
    "0xbeef000000000000000000000000000000000003",
  ];
  const now = Math.floor(Date.now() / 1000);
  const rows: Hist[] = [];
  for (let i = 0; i < 12; i++) {
    const r = demoOpen(1000 + i * 97);
    rows.push({
      user: users[i % users.length],
      tierIndex: r.tierIndex,
      prize: r.prize,
      ts: now - i * 90 - 20,
      demo: true,
    });
  }
  return rows;
}
