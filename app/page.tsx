"use client";

import { useEffect, useMemo, useState } from "react";
import {
  APP_NAME,
  APP_TAGLINE,
  CHAIN_ID,
  CHAIN_NAME,
  CREATOR_FEE_BPS,
  DEMO_MODE,
  GRAD_TARGET,
  PLATFORM_FEE_BPS,
  QUOTE_SYMBOL,
  bpsToPct,
  fmt,
  fmtUsd,
  shortAddr,
  timeAgo,
} from "@/lib/config";
import {
  Activity,
  DEMO_ACTIVITY,
  DEMO_TOKENS,
  LaunchToken,
  createDemoToken,
} from "@/lib/demo";

type Tab = "explore" | "create" | "token";
type Filter = "all" | "live" | "graduated" | "newest" | "mcap" | "volume";
type Side = "buy" | "sell";

const STORE_KEY = "lpx_pad_tokens_v1";
const ACT_KEY = "lpx_pad_activity_v1";

function loadTokens(): LaunchToken[] {
  if (typeof window === "undefined") return DEMO_TOKENS;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return DEMO_TOKENS;
    const parsed = JSON.parse(raw) as LaunchToken[];
    return parsed.length ? parsed : DEMO_TOKENS;
  } catch {
    return DEMO_TOKENS;
  }
}

function loadActivity(): Activity[] {
  if (typeof window === "undefined") return DEMO_ACTIVITY;
  try {
    const raw = localStorage.getItem(ACT_KEY);
    if (!raw) return DEMO_ACTIVITY;
    return JSON.parse(raw) as Activity[];
  } catch {
    return DEMO_ACTIVITY;
  }
}

function avatarStyle(hue: number) {
  return {
    background: `linear-gradient(135deg, hsl(${hue} 42% 58%), hsl(${(hue + 40) % 360} 35% 42%))`,
  } as const;
}

export default function HomePage() {
  const [tab, setTab] = useState<Tab>("explore");
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [wallet, setWallet] = useState<string | null>(null);
  const [tokens, setTokens] = useState<LaunchToken[]>(DEMO_TOKENS);
  const [activity, setActivity] = useState<Activity[]>(DEMO_ACTIVITY);
  const [selected, setSelected] = useState<string | null>(null);
  const [side, setSide] = useState<Side>("buy");
  const [tradeAmt, setTradeAmt] = useState("100");
  const [msg, setMsg] = useState<string | null>(null);

  // create form
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [desc, setDesc] = useState("");
  const [firstBuy, setFirstBuy] = useState("50");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTokens(loadTokens());
    setActivity(loadActivity());
  }, []);

  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify(tokens));
  }, [tokens]);

  useEffect(() => {
    localStorage.setItem(ACT_KEY, JSON.stringify(activity));
  }, [activity]);

  const stats = useMemo(() => {
    const launched = tokens.length;
    const live = tokens.filter((t) => t.status === "live").length;
    const graduated = tokens.filter((t) => t.status === "graduated").length;
    const vol = tokens.reduce((a, t) => a + t.vol24h, 0);
    const creatorFees = tokens.reduce((a, t) => a + t.creatorFeesEarned, 0);
    return { launched, live, graduated, vol, creatorFees };
  }, [tokens]);

  const filtered = useMemo(() => {
    let list = [...tokens];
    if (filter === "live") list = list.filter((t) => t.status === "live");
    if (filter === "graduated") list = list.filter((t) => t.status === "graduated");
    if (filter === "newest") list.sort((a, b) => b.createdAt - a.createdAt);
    else if (filter === "mcap") list.sort((a, b) => b.mcap - a.mcap);
    else if (filter === "volume") list.sort((a, b) => b.vol24h - a.vol24h);
    else list.sort((a, b) => b.createdAt - a.createdAt);

    if (q.trim()) {
      const s = q.trim().toLowerCase();
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(s) ||
          t.symbol.toLowerCase().includes(s) ||
          t.address.includes(s)
      );
    }
    return list;
  }, [tokens, filter, q]);

  const active = useMemo(
    () => tokens.find((t) => t.address === selected) || null,
    [tokens, selected]
  );

  function connect() {
    // demo wallet — UI only until factory is wired
    const w = "0x1b04beb50c40df7e5efdbf91c5d876e94666603d";
    setWallet(w);
    setMsg("Wallet connected (demo). Factory not required for UI preview.");
  }

  function openToken(addr: string) {
    setSelected(addr);
    setTab("token");
    setMsg(null);
  }

  function launchToken() {
    if (!name.trim() || !symbol.trim()) {
      setMsg("Name and symbol are required.");
      return;
    }
    setBusy(true);
    setTimeout(() => {
      const t = createDemoToken({
        name: name.trim(),
        symbol: symbol.trim(),
        description: desc.trim(),
        creator: wallet || "0xcafe00000000000000000000000000000000cafe",
        firstBuy: Number(firstBuy) || 0,
      });
      setTokens((prev) => [t, ...prev]);
      setActivity((prev) => [
        {
          id: `${Date.now()}`,
          kind: "launch",
          token: t.address,
          symbol: t.symbol,
          trader: t.creator,
          amountUsd: Number(firstBuy) || 0,
          ts: Math.floor(Date.now() / 1000),
        },
        ...prev,
      ]);
      if ((Number(firstBuy) || 0) > 0) {
        setActivity((prev) => [
          {
            id: `${Date.now()}-buy`,
            kind: "buy",
            token: t.address,
            symbol: t.symbol,
            trader: t.creator,
            amountUsd: Number(firstBuy) || 0,
            ts: Math.floor(Date.now() / 1000),
          },
          ...prev,
        ]);
      }
      setBusy(false);
      setName("");
      setSymbol("");
      setDesc("");
      setFirstBuy("50");
      setMsg(`Deployed ${t.symbol} on bonding curve (demo). Creator fee ${bpsToPct(CREATOR_FEE_BPS)} active.`);
      openToken(t.address);
    }, 450);
  }

  function simulateTrade() {
    if (!active) return;
    const amt = Math.max(0, Number(tradeAmt) || 0);
    if (amt <= 0) {
      setMsg("Enter a valid amount.");
      return;
    }
    const creatorCut = (amt * CREATOR_FEE_BPS) / 10_000;
    const platformCut = (amt * PLATFORM_FEE_BPS) / 10_000;
    const net = amt - creatorCut - platformCut;
    setTokens((prev) =>
      prev.map((t) => {
        if (t.address !== active.address) return t;
        const raisedDelta = side === "buy" ? net : -net * 0.9;
        const raised = Math.max(0, t.raised + raisedDelta);
        const progress = Math.min(100, (raised / GRAD_TARGET) * 100);
        const graduated = raised >= GRAD_TARGET;
        return {
          ...t,
          raised,
          progress,
          mcap: Math.max(500, t.mcap + (side === "buy" ? amt * 3.2 : -amt * 2.4)),
          vol24h: t.vol24h + amt,
          holders: side === "buy" ? t.holders + (Math.random() > 0.6 ? 1 : 0) : t.holders,
          price: Math.max(0.0000001, t.price * (side === "buy" ? 1.02 : 0.985)),
          change24h: t.change24h + (side === "buy" ? 1.2 : -0.9),
          creatorFeesEarned: t.creatorFeesEarned + creatorCut,
          platformFeesEarned: t.platformFeesEarned + platformCut,
          status: graduated ? "graduated" : t.status,
        };
      })
    );
    setActivity((prev) => [
      {
        id: `${Date.now()}`,
        kind: side,
        token: active.address,
        symbol: active.symbol,
        trader: wallet || "0xdemo0000000000000000000000000000000001",
        amountUsd: amt,
        ts: Math.floor(Date.now() / 1000),
      },
      ...prev,
    ]);
    setMsg(
      `${side === "buy" ? "Bought" : "Sold"} ~${fmtUsd(amt)} · creator fee ${fmtUsd(creatorCut)} · platform ${fmtUsd(platformCut)}`
    );
  }

  return (
    <div className="shell">
      <nav className="nav">
        <div className="brand">
          <img src="/logo.svg" alt="LPX" />
          <div className="t">
            <strong>{APP_NAME}</strong>
            <span>{APP_TAGLINE}</span>
          </div>
        </div>
        <div className="nav-mid">
          <button className={tab === "explore" ? "active" : ""} onClick={() => setTab("explore")}>
            Explore
          </button>
          <button className={tab === "create" ? "active" : ""} onClick={() => setTab("create")}>
            Create
          </button>
          <button
            className={tab === "token" ? "active" : ""}
            onClick={() => (active ? setTab("token") : setTab("explore"))}
          >
            Token
          </button>
        </div>
        <div className="nav-right">
          <span className="badge">
            <span className="dot" /> {CHAIN_NAME} · {CHAIN_ID}
          </span>
          {DEMO_MODE && <span className="badge">DEMO</span>}
          <button className="btn primary" onClick={connect}>
            {wallet ? shortAddr(wallet, 4) : "Connect"}
          </button>
        </div>
      </nav>

      {tab === "explore" && (
        <>
          <section className="hero">
            <div className="panel">
              <div className="kicker">Bonding curve launchpad</div>
              <h1>
                Launch tokens.
                <br />
                Earn on every trade.
              </h1>
              <p className="lead">
                Deploy a coin on Stable with locked curve liquidity. Creators earn a permanent fee
                share. Platform takes a thin cut. Graduate to DEX when the raise clears{" "}
                {fmtUsd(GRAD_TARGET)}.
              </p>
              <div className="stat-row">
                <div className="stat">
                  <div className="l">Launched</div>
                  <div className="v">{stats.launched}</div>
                </div>
                <div className="stat">
                  <div className="l">On curve</div>
                  <div className="v">{stats.live}</div>
                </div>
                <div className="stat">
                  <div className="l">Graduated</div>
                  <div className="v">{stats.graduated}</div>
                </div>
                <div className="stat">
                  <div className="l">24h volume</div>
                  <div className="v">{fmtUsd(stats.vol)}</div>
                </div>
              </div>
            </div>
            <div className="panel fee-card">
              <div className="kicker">Fee model</div>
              <h3>Creator fee built in</h3>
              <p>
                Every buy and sell on the curve routes fees automatically — no harvest bot theater.
                Transparent split, shown on every token page.
              </p>
              <div className="fee-grid">
                <div className="row">
                  <span>Creator fee</span>
                  <strong className="gold">{bpsToPct(CREATOR_FEE_BPS)}</strong>
                </div>
                <div className="row">
                  <span>Platform fee</span>
                  <strong>{bpsToPct(PLATFORM_FEE_BPS)}</strong>
                </div>
                <div className="row">
                  <span>Total trade fee</span>
                  <strong>{bpsToPct(CREATOR_FEE_BPS + PLATFORM_FEE_BPS)}</strong>
                </div>
                <div className="row">
                  <span>Quote asset</span>
                  <strong className="mono">{QUOTE_SYMBOL}</strong>
                </div>
                <div className="row">
                  <span>Creator fees (demo set)</span>
                  <strong className="good">{fmtUsd(stats.creatorFees)}</strong>
                </div>
              </div>
              <button className="btn primary block lg" style={{ marginTop: 14 }} onClick={() => setTab("create")}>
                Create token
              </button>
            </div>
          </section>

          <div className="toolbar">
            <div className="tabs">
              {(
                [
                  ["all", "All"],
                  ["live", "On curve"],
                  ["graduated", "Graduated"],
                  ["newest", "Newest"],
                  ["mcap", "Market cap"],
                  ["volume", "Volume"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  className={`tab ${filter === id ? "active" : ""}`}
                  onClick={() => setFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="search">
              <input
                placeholder="Search name, symbol, address"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>

          <div className="layout">
            <div>
              {filtered.length === 0 ? (
                <div className="empty">No tokens match this filter.</div>
              ) : (
                <div className="token-grid">
                  {filtered.map((t) => (
                    <button key={t.address} className="token-card" onClick={() => openToken(t.address)}>
                      <div className="top">
                        <div className="avatar" style={avatarStyle(t.imageHue)}>
                          {t.symbol.slice(0, 2)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <h3>{t.name}</h3>
                          <div className="sym">
                            ${t.symbol} · {shortAddr(t.address, 4)}
                          </div>
                        </div>
                        <span className={`pill ${t.status === "graduated" ? "grad" : "live"}`}>
                          {t.status === "graduated" ? "Graduated" : "Live"}
                        </span>
                      </div>
                      <div className="meta">
                        <div>
                          <div className="l">Mcap</div>
                          <div className="v">{fmtUsd(t.mcap)}</div>
                        </div>
                        <div>
                          <div className="l">Vol 24h</div>
                          <div className="v">{fmtUsd(t.vol24h)}</div>
                        </div>
                        <div>
                          <div className="l">24h</div>
                          <div className={`v ${t.change24h >= 0 ? "good" : "bad"}`}>
                            {t.change24h >= 0 ? "+" : ""}
                            {t.change24h.toFixed(1)}%
                          </div>
                        </div>
                      </div>
                      <div className="bar">
                        <i style={{ width: `${Math.min(100, t.progress)}%` }} />
                      </div>
                      <div className="bar-label">
                        <span>
                          {fmtUsd(t.raised)} / {fmtUsd(GRAD_TARGET)}
                        </span>
                        <span>{timeAgo(t.createdAt)} ago</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <aside className="panel flat">
              <div className="kicker">Live activity</div>
              <div className="activity">
                {activity.slice(0, 18).map((a) => (
                  <div className="act" key={a.id}>
                    <div className={`k ${a.kind}`}>{a.kind}</div>
                    <div>
                      <div>
                        <strong>${a.symbol}</strong>{" "}
                        <span className="faint mono">{shortAddr(a.trader, 3)}</span>
                      </div>
                      <div className="faint">{timeAgo(a.ts)} ago</div>
                    </div>
                    <div className={a.kind === "sell" ? "bad" : "good"}>
                      {a.amountUsd > 0 ? fmtUsd(a.amountUsd) : "—"}
                    </div>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </>
      )}

      {tab === "create" && (
        <section className="create-grid">
          <div className="panel">
            <div className="kicker">Create</div>
            <h2 style={{ margin: "0 0 6px", fontSize: "1.35rem", letterSpacing: "-0.02em" }}>
              Deploy a bonding-curve token
            </h2>
            <p className="muted" style={{ marginTop: 0, lineHeight: 1.55 }}>
              One flow: metadata → curve → optional first buy. Creator fee is fixed at{" "}
              {bpsToPct(CREATOR_FEE_BPS)} of every trade for the life of the curve.
            </p>
            <div className="form" style={{ marginTop: 16 }}>
              <div className="two">
                <div className="field">
                  <label>Token name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Northstar" />
                </div>
                <div className="field">
                  <label>Symbol</label>
                  <input
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    placeholder="NSTR"
                    maxLength={10}
                  />
                </div>
              </div>
              <div className="field">
                <label>Description</label>
                <textarea
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="Short thesis. No emoji spam."
                />
              </div>
              <div className="two">
                <div className="field">
                  <label>First buy ({QUOTE_SYMBOL})</label>
                  <input
                    type="number"
                    min={0}
                    value={firstBuy}
                    onChange={(e) => setFirstBuy(e.target.value)}
                  />
                  <div className="hint">Optional sniper buy in the same launch flow.</div>
                </div>
                <div className="field">
                  <label>Graduation target</label>
                  <input value={`${GRAD_TARGET} ${QUOTE_SYMBOL}`} disabled />
                  <div className="hint">Auto-migrate liquidity when filled.</div>
                </div>
              </div>
              <button className="btn primary lg" disabled={busy} onClick={launchToken}>
                {busy ? "Deploying…" : "Create token"}
              </button>
              {msg && <div className="note">{msg}</div>}
            </div>
          </div>

          <div className="panel summary">
            <div className="kicker">Live summary</div>
            <div className="row">
              <span>Name</span>
              <strong>{name || "—"}</strong>
            </div>
            <div className="row">
              <span>Symbol</span>
              <strong>${(symbol || "———").toUpperCase()}</strong>
            </div>
            <div className="row">
              <span>Creator fee</span>
              <strong className="gold">{bpsToPct(CREATOR_FEE_BPS)}</strong>
            </div>
            <div className="row">
              <span>Platform fee</span>
              <strong>{bpsToPct(PLATFORM_FEE_BPS)}</strong>
            </div>
            <div className="row">
              <span>First buy</span>
              <strong>
                {fmt(Number(firstBuy) || 0)} {QUOTE_SYMBOL}
              </strong>
            </div>
            <div className="row">
              <span>Network</span>
              <strong>
                {CHAIN_NAME} ({CHAIN_ID})
              </strong>
            </div>
            <div className="note">
              Demo mode stores launches in your browser. Wire <code>NEXT_PUBLIC_FACTORY</code> later
              for real deploys — UI is production-shaped already.
            </div>
          </div>
        </section>
      )}

      {tab === "token" && (
        <section>
          <button className="back" onClick={() => setTab("explore")}>
            ← Back to explore
          </button>
          {!active ? (
            <div className="empty">Select a token from Explore.</div>
          ) : (
            <div className="detail">
              <div className="panel">
                <div className="top" style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div className="avatar" style={avatarStyle(active.imageHue)}>
                    {active.symbol.slice(0, 2)}
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontSize: "1.35rem" }}>{active.name}</h2>
                    <div className="muted">
                      ${active.symbol} · <span className="mono">{shortAddr(active.address, 6)}</span>
                    </div>
                  </div>
                  <span
                    className={`pill ${active.status === "graduated" ? "grad" : "live"}`}
                    style={{ marginLeft: "auto" }}
                  >
                    {active.status === "graduated" ? "Graduated" : "On curve"}
                  </span>
                </div>

                <p className="muted" style={{ lineHeight: 1.55, margin: "14px 0" }}>
                  {active.description}
                </p>

                <div className="stat-row" style={{ marginBottom: 14 }}>
                  <div className="stat">
                    <div className="l">Price</div>
                    <div className="v">${active.price.toPrecision(4)}</div>
                  </div>
                  <div className="stat">
                    <div className="l">Market cap</div>
                    <div className="v">{fmtUsd(active.mcap)}</div>
                  </div>
                  <div className="stat">
                    <div className="l">Volume 24h</div>
                    <div className="v">{fmtUsd(active.vol24h)}</div>
                  </div>
                  <div className="stat">
                    <div className="l">Holders</div>
                    <div className="v">{active.holders}</div>
                  </div>
                </div>

                <div className="chart" aria-hidden>
                  <svg viewBox="0 0 640 280" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgba(212,160,23,0.35)" />
                        <stop offset="100%" stopColor="rgba(212,160,23,0)" />
                      </linearGradient>
                    </defs>
                    <path
                      d={chartPath(active)}
                      fill="url(#fill)"
                      stroke="#d4a017"
                      strokeWidth="2.5"
                    />
                  </svg>
                </div>

                <div className="bar" style={{ marginTop: 14 }}>
                  <i style={{ width: `${Math.min(100, active.progress)}%` }} />
                </div>
                <div className="bar-label">
                  <span>
                    Curve progress · {fmtUsd(active.raised)} / {fmtUsd(GRAD_TARGET)}
                  </span>
                  <span>{Math.min(100, active.progress).toFixed(1)}%</span>
                </div>
              </div>

              <div className="panel trade-box">
                <div className="tabs-mini">
                  <button className={side === "buy" ? "active buy" : ""} onClick={() => setSide("buy")}>
                    Buy
                  </button>
                  <button
                    className={side === "sell" ? "active sell" : ""}
                    onClick={() => setSide("sell")}
                  >
                    Sell
                  </button>
                </div>
                <div className="field">
                  <label>Amount ({QUOTE_SYMBOL})</label>
                  <input
                    type="number"
                    min={0}
                    value={tradeAmt}
                    onChange={(e) => setTradeAmt(e.target.value)}
                  />
                </div>
                <div className="kv">
                  <div>
                    <span>Creator fee</span>
                    <span className="gold">
                      {fmtUsd(((Number(tradeAmt) || 0) * CREATOR_FEE_BPS) / 10_000)} (
                      {bpsToPct(CREATOR_FEE_BPS)})
                    </span>
                  </div>
                  <div>
                    <span>Platform fee</span>
                    <span>
                      {fmtUsd(((Number(tradeAmt) || 0) * PLATFORM_FEE_BPS) / 10_000)} (
                      {bpsToPct(PLATFORM_FEE_BPS)})
                    </span>
                  </div>
                  <div>
                    <span>Creator earned (total)</span>
                    <span className="good">{fmtUsd(active.creatorFeesEarned)}</span>
                  </div>
                  <div>
                    <span>Creator</span>
                    <span className="mono">{shortAddr(active.creator, 4)}</span>
                  </div>
                </div>
                <button
                  className="btn primary block lg"
                  style={{ marginTop: 14 }}
                  onClick={simulateTrade}
                >
                  {side === "buy" ? "Buy on curve" : "Sell on curve"}
                </button>
                {msg && <div className="note">{msg}</div>}
                <p className="faint" style={{ marginTop: 12, fontSize: "0.78rem", lineHeight: 1.45 }}>
                  Demo trades update local state only. Same fee math as production target: creator{" "}
                  {bpsToPct(CREATOR_FEE_BPS)} + platform {bpsToPct(PLATFORM_FEE_BPS)}.
                </p>
              </div>
            </div>
          )}
        </section>
      )}

      <footer className="footer">
        <span>
          {APP_NAME} · Stable {CHAIN_ID} · not financial advice
        </span>
        <span>
          Creator {bpsToPct(CREATOR_FEE_BPS)} · Platform {bpsToPct(PLATFORM_FEE_BPS)} · Grad{" "}
          {fmtUsd(GRAD_TARGET)}
        </span>
      </footer>
    </div>
  );
}

function chartPath(t: LaunchToken) {
  // Deterministic fake curve from token fields
  const pts: string[] = [];
  const n = 28;
  let y = 210;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 640;
    const wave =
      Math.sin(i * 0.55 + t.imageHue) * 18 +
      Math.cos(i * 0.2) * 10 +
      (t.change24h >= 0 ? -i * 2.1 : i * 1.2);
    y = Math.min(250, Math.max(40, 200 + wave - t.progress * 0.7));
    pts.push(`${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  const lastX = 640;
  return `${pts.join(" ")} L ${lastX} 280 L 0 280 Z`;
}
