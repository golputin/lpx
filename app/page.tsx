"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  APP_NAME,
  CHAIN_ID,
  CHAIN_NAME,
  CREATE_GAS_EST_USD,
  CREATE_PLATFORM_FEE_USD,
  CREATOR_SHARE_BPS,
  DEMO_MODE,
  GRAD_TARGET,
  PLATFORM_SHARE_BPS,
  QUOTE_SYMBOL,
  TRADE_FEE_BPS,
  bpsToPct,
  createCostBreakdown,
  feeSplit,
  fmt,
  fmtUsd,
  normalizeUrl,
  shareToPct,
  shortAddr,
  timeAgo,
} from "@/lib/config";
import {
  Activity,
  DEMO_ACTIVITY,
  DEMO_TOKENS,
  LaunchToken,
  createDemoToken,
  placeholderImage,
} from "@/lib/demo";

type Tab = "explore" | "create" | "token";
type Filter = "all" | "live" | "graduated" | "newest" | "mcap" | "volume";
type Side = "buy" | "sell";

const STORE_KEY = "lpx_pad_tokens_v3";
const ACT_KEY = "lpx_pad_activity_v3";
const MAX_LOGO_BYTES = 1_200_000; // ~1.2MB before base64

function loadTokens(): LaunchToken[] {
  if (typeof window === "undefined") return DEMO_TOKENS;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return DEMO_TOKENS;
    const parsed = JSON.parse(raw) as LaunchToken[];
    if (!parsed.length) return DEMO_TOKENS;
    return parsed.map((t) => ({
      ...t,
      imageUrl: t.imageUrl || placeholderImage(t.symbol + t.address, t.imageHue || 160),
      website: t.website || "",
      twitter: t.twitter || "",
      telegram: t.telegram || "",
    }));
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

function TokenAvatar({
  token,
  size = 34,
  className = "av",
}: {
  token: Pick<LaunchToken, "symbol" | "imageUrl" | "imageHue" | "address">;
  size?: number;
  className?: string;
}) {
  const src = token.imageUrl || placeholderImage(token.symbol + token.address, token.imageHue);
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        background: `hsl(${token.imageHue || 160} 40% 18%)`,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
      <span>{token.symbol.slice(0, 2)}</span>
    </div>
  );
}

function SocialLinks({ token }: { token: LaunchToken }) {
  const items = [
    { href: normalizeUrl(token.website), label: "web" },
    { href: normalizeUrl(token.twitter), label: "x" },
    { href: normalizeUrl(token.telegram), label: "tg" },
  ].filter((x) => x.href);
  if (!items.length) return null;
  return (
    <div className="socials">
      {items.map((x) => (
        <a key={x.label} href={x.href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
          {x.label}
        </a>
      ))}
    </div>
  );
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

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [desc, setDesc] = useState("");
  const [firstBuy, setFirstBuy] = useState("50");
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [logoData, setLogoData] = useState<string>("");
  const [logoName, setLogoName] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

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

  const createCost = useMemo(() => createCostBreakdown(Number(firstBuy) || 0), [firstBuy]);

  function connect() {
    setWallet("0x1b04beb50c40df7e5efdbf91c5d876e94666603d");
    setMsg("connected (demo)");
  }

  function openToken(addr: string) {
    setSelected(addr);
    setTab("token");
    setMsg(null);
  }

  function onLogoPick(file?: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMsg("logo must be an image");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setMsg("logo too large (max ~1MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      setLogoData(result);
      setLogoName(file.name);
      setMsg(null);
    };
    reader.onerror = () => setMsg("failed to read logo");
    reader.readAsDataURL(file);
  }

  function clearLogo() {
    setLogoData("");
    setLogoName("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function launchToken() {
    if (!name.trim() || !symbol.trim()) {
      setMsg("name + symbol required");
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
        imageUrl: logoData || undefined,
        website: normalizeUrl(website),
        twitter: normalizeUrl(twitter),
        telegram: normalizeUrl(telegram),
      });
      setTokens((prev) => [t, ...prev]);
      const ts = Math.floor(Date.now() / 1000);
      const rows: Activity[] = [
        {
          id: `${Date.now()}`,
          kind: "launch",
          token: t.address,
          symbol: t.symbol,
          trader: t.creator,
          amountUsd: Number(firstBuy) || 0,
          ts,
        },
      ];
      if ((Number(firstBuy) || 0) > 0) {
        rows.unshift({
          id: `${Date.now()}-b`,
          kind: "buy",
          token: t.address,
          symbol: t.symbol,
          trader: t.creator,
          amountUsd: Number(firstBuy) || 0,
          ts,
        });
      }
      setActivity((prev) => [...rows, ...prev]);
      setBusy(false);
      setName("");
      setSymbol("");
      setDesc("");
      setWebsite("");
      setTwitter("");
      setTelegram("");
      clearLogo();
      setMsg(
        `${t.symbol} live · create fee $0 · gas ~${fmtUsd(CREATE_GAS_EST_USD)} · creator ${shareToPct(CREATOR_SHARE_BPS)} of ${bpsToPct(TRADE_FEE_BPS)} fee`
      );
      openToken(t.address);
    }, 350);
  }

  function simulateTrade() {
    if (!active) return;
    const amt = Math.max(0, Number(tradeAmt) || 0);
    if (amt <= 0) {
      setMsg("bad amount");
      return;
    }
    const split = feeSplit(amt);
    const net = amt - split.total;
    setTokens((prev) =>
      prev.map((t) => {
        if (t.address !== active.address) return t;
        const raisedDelta = side === "buy" ? net : -net * 0.9;
        const raised = Math.max(0, t.raised + raisedDelta);
        const progress = Math.min(100, (raised / GRAD_TARGET) * 100);
        return {
          ...t,
          raised,
          progress,
          mcap: Math.max(500, t.mcap + (side === "buy" ? amt * 3.2 : -amt * 2.4)),
          vol24h: t.vol24h + amt,
          holders: side === "buy" ? t.holders + (Math.random() > 0.6 ? 1 : 0) : t.holders,
          price: Math.max(0.0000001, t.price * (side === "buy" ? 1.02 : 0.985)),
          change24h: t.change24h + (side === "buy" ? 1.2 : -0.9),
          creatorFeesEarned: t.creatorFeesEarned + split.creator,
          platformFeesEarned: t.platformFeesEarned + split.platform,
          status: raised >= GRAD_TARGET ? "graduated" : t.status,
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
      `${side} ${fmtUsd(amt)} · fee ${fmtUsd(split.total)} → creator ${fmtUsd(split.creator)} (${shareToPct(CREATOR_SHARE_BPS)})`
    );
  }

  const tradePreview = feeSplit(Number(tradeAmt) || 0);

  return (
    <div className="app">
      <header className="top">
        <div className="logo">
          <img src="/logo.svg" alt="" />
          {APP_NAME}
          <span>/{CHAIN_ID}</span>
        </div>
        <nav className="menu">
          <button className={tab === "explore" ? "on" : ""} onClick={() => setTab("explore")}>
            explore
          </button>
          <button className={tab === "create" ? "on" : ""} onClick={() => setTab("create")}>
            create
          </button>
          <button
            className={tab === "token" ? "on" : ""}
            onClick={() => (active ? setTab("token") : setTab("explore"))}
          >
            token
          </button>
        </nav>
        <div className="right">
          <span className="pill">
            <b>●</b> {CHAIN_NAME}
          </span>
          {DEMO_MODE && <span className="pill">demo</span>}
          <button className="btn green" onClick={connect}>
            {wallet ? shortAddr(wallet, 3) : "connect"}
          </button>
        </div>
      </header>

      {tab === "explore" && (
        <>
          <div className="strip">
            <div className="s">
              <div className="l">launched</div>
              <div className="v">{stats.launched}</div>
            </div>
            <div className="s">
              <div className="l">on curve</div>
              <div className="v">{stats.live}</div>
            </div>
            <div className="s">
              <div className="l">graduated</div>
              <div className="v">{stats.graduated}</div>
            </div>
            <div className="s">
              <div className="l">vol 24h</div>
              <div className="v">{fmtUsd(stats.vol)}</div>
            </div>
            <div className="s">
              <div className="l">creator fees</div>
              <div className="v up">{fmtUsd(stats.creatorFees)}</div>
            </div>
          </div>

          <div className="bar">
            <div className="filters">
              {(
                [
                  ["all", "all"],
                  ["live", "live"],
                  ["graduated", "grad"],
                  ["newest", "new"],
                  ["mcap", "mcap"],
                  ["volume", "vol"],
                ] as const
              ).map(([id, label]) => (
                <button key={id} className={filter === id ? "on" : ""} onClick={() => setFilter(id)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="search">
              <input
                placeholder="search token / ca"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <button className="btn green" onClick={() => setTab("create")}>
              + create
            </button>
          </div>

          <div className="main">
            <div className="table-wrap scrollx">
              <table className="tokens">
                <thead>
                  <tr>
                    <th>token</th>
                    <th>status</th>
                    <th>mcap</th>
                    <th>vol</th>
                    <th>24h</th>
                    <th>curve</th>
                    <th>creator fee</th>
                    <th>age</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr key={t.address} onClick={() => openToken(t.address)}>
                      <td>
                        <div className="tok">
                          <TokenAvatar token={t} />
                          <div>
                            <div className="n">{t.name}</div>
                            <div className="m">
                              ${t.symbol} · {shortAddr(t.address, 3)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`tag ${t.status === "graduated" ? "grad" : "live"}`}>
                          {t.status === "graduated" ? "grad" : "live"}
                        </span>
                      </td>
                      <td>{fmtUsd(t.mcap)}</td>
                      <td>{fmtUsd(t.vol24h)}</td>
                      <td className={t.change24h >= 0 ? "up" : "dn"}>
                        {t.change24h >= 0 ? "+" : ""}
                        {t.change24h.toFixed(1)}%
                      </td>
                      <td>
                        <div className="prog">
                          <div className="track">
                            <i style={{ width: `${Math.min(100, t.progress)}%` }} />
                          </div>
                          <div className="cap">
                            {fmtUsd(t.raised)}/{fmtUsd(GRAD_TARGET)}
                          </div>
                        </div>
                      </td>
                      <td className="up">{fmtUsd(t.creatorFeesEarned)}</td>
                      <td className="dim">{timeAgo(t.createdAt)}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={8}>
                        <div className="empty">no tokens</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <aside className="side">
              <h3>activity</h3>
              <div className="feed">
                {activity.slice(0, 24).map((a) => {
                  const tok = tokens.find((t) => t.address === a.token);
                  return (
                    <div className="row" key={a.id} onClick={() => openToken(a.token)}>
                      <div className={`k ${a.kind}`}>{a.kind}</div>
                      <div className="act-main">
                        {tok && <TokenAvatar token={tok} size={22} className="av sm" />}
                        <div>
                          <div>
                            <b>${a.symbol}</b>{" "}
                            <span className="dim mono">{shortAddr(a.trader, 2)}</span>
                          </div>
                          <div className="dim">{timeAgo(a.ts)}</div>
                        </div>
                      </div>
                      <div className={a.kind === "sell" ? "dn" : "up"}>
                        {a.amountUsd > 0 ? fmtUsd(a.amountUsd) : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </aside>
          </div>
        </>
      )}

      {tab === "create" && (
        <div className="grid2">
          <div className="card">
            <h2>create token</h2>
            <p className="sub">
              1% trade fee · creator gets <b>{shareToPct(CREATOR_SHARE_BPS)}</b> · platform{" "}
              {shareToPct(PLATFORM_SHARE_BPS)} · create fee <b>$0</b>
            </p>
            <div className="form">
              <div className="logo-row">
                <button
                  type="button"
                  className="logo-pick"
                  onClick={() => fileRef.current?.click()}
                  style={
                    logoData
                      ? { backgroundImage: `url(${logoData})` }
                      : { background: "hsl(160 40% 16%)" }
                  }
                >
                  {!logoData && <span>logo</span>}
                </button>
                <div className="logo-meta">
                  <div className="field" style={{ margin: 0 }}>
                    <label>token logo</label>
                    <div className="logo-actions">
                      <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
                        {logoData ? "change" : "upload"}
                      </button>
                      {logoData && (
                        <button type="button" className="btn" onClick={clearLogo}>
                          remove
                        </button>
                      )}
                    </div>
                    <div className="hint">
                      {logoName || "png / jpg / webp · max ~1MB · shown in trenches + token page"}
                    </div>
                  </div>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => onLogoPick(e.target.files?.[0])}
                />
              </div>

              <div className="two">
                <div className="field">
                  <label>name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="name" />
                </div>
                <div className="field">
                  <label>symbol</label>
                  <input
                    value={symbol}
                    maxLength={10}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    placeholder="TICKER"
                  />
                </div>
              </div>
              <div className="field">
                <label>description</label>
                <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="optional" />
              </div>

              <div className="field">
                <label>website</label>
                <input
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://…"
                />
              </div>
              <div className="two">
                <div className="field">
                  <label>x / twitter</label>
                  <input
                    value={twitter}
                    onChange={(e) => setTwitter(e.target.value)}
                    placeholder="@handle or url"
                  />
                </div>
                <div className="field">
                  <label>telegram</label>
                  <input
                    value={telegram}
                    onChange={(e) => setTelegram(e.target.value)}
                    placeholder="t.me/…"
                  />
                </div>
              </div>

              <div className="two">
                <div className="field">
                  <label>first buy ({QUOTE_SYMBOL})</label>
                  <input
                    type="number"
                    min={0}
                    value={firstBuy}
                    onChange={(e) => setFirstBuy(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>grad target</label>
                  <input value={`${GRAD_TARGET} ${QUOTE_SYMBOL}`} disabled />
                </div>
              </div>
              <button className="btn green lg" disabled={busy} onClick={launchToken}>
                {busy ? "deploying…" : "deploy"}
              </button>
              {msg && <div className="note">{msg}</div>}
            </div>
          </div>

          <div className="card">
            <h2>cost + fee</h2>
            <p className="sub">Pons-style · no platform create tax</p>

            <div className="preview-box">
              <TokenAvatar
                token={{
                  symbol: (symbol || "TK").toUpperCase(),
                  imageUrl: logoData || placeholderImage(symbol || "TK", 160),
                  imageHue: 160,
                  address: "preview",
                }}
                size={56}
                className="av lg"
              />
              <div>
                <div className="n">{name || "Token name"}</div>
                <div className="m mono">${(symbol || "TICKER").toUpperCase()}</div>
                <SocialLinks
                  token={{
                    address: "x",
                    name: "",
                    symbol: "",
                    creator: "",
                    createdAt: 0,
                    raised: 0,
                    mcap: 0,
                    vol24h: 0,
                    holders: 0,
                    progress: 0,
                    status: "live",
                    price: 0,
                    change24h: 0,
                    description: "",
                    creatorFeesEarned: 0,
                    platformFeesEarned: 0,
                    imageHue: 0,
                    website,
                    twitter,
                    telegram,
                  }}
                />
              </div>
            </div>

            <div className="lines">
              <div className="ln">
                <span>create fee (platform)</span>
                <b className="up">{fmtUsd(CREATE_PLATFORM_FEE_USD)}</b>
              </div>
              <div className="ln">
                <span>network gas est.</span>
                <b>~{fmtUsd(CREATE_GAS_EST_USD)}</b>
              </div>
              <div className="ln">
                <span>first buy</span>
                <b>
                  {fmt(createCost.firstBuy)} {QUOTE_SYMBOL}
                </b>
              </div>
              <div className="ln">
                <span>you pay now</span>
                <b>
                  ~{fmtUsd(createCost.totalWithGas)}{" "}
                  <span className="dim">({fmt(createCost.firstBuy)} + gas)</span>
                </b>
              </div>
              <div className="ln">
                <span>trade fee</span>
                <b>{bpsToPct(TRADE_FEE_BPS)}</b>
              </div>
              <div className="ln">
                <span>creator share</span>
                <b className="up">{shareToPct(CREATOR_SHARE_BPS)}</b>
              </div>
              <div className="ln">
                <span>platform share</span>
                <b>{shareToPct(PLATFORM_SHARE_BPS)}</b>
              </div>
              <div className="ln">
                <span>creator effective</span>
                <b className="up">
                  ~{bpsToPct(Math.round((TRADE_FEE_BPS * CREATOR_SHARE_BPS) / 10_000))}
                </b>
              </div>
            </div>
            <div className="note">
              <b>Biaya create:</b> platform <b>$0</b>. Cuma gas network (~
              <b>{fmtUsd(CREATE_GAS_EST_USD)}</b> di Stable, gas ~1 gwei). First buy opsional — itu modal
              beli, bukan fee. Trade fee tetap 1% · creator 80% / platform 20%.
              <br />
              example volume <b>$10,000</b> → fee <b>$100</b> → creator <b>$80</b> · platform <b>$20</b>
            </div>
          </div>
        </div>
      )}

      {tab === "token" && (
        <section>
          <button className="back" onClick={() => setTab("explore")}>
            ← explore
          </button>
          {!active ? (
            <div className="empty">pick a token</div>
          ) : (
            <div className="grid2">
              <div className="card">
                <div className="head">
                  <TokenAvatar token={active} size={48} className="av lg" />
                  <div style={{ flex: 1 }}>
                    <h2>{active.name}</h2>
                    <div className="meta mono">
                      ${active.symbol} · {shortAddr(active.address, 5)}
                    </div>
                    <SocialLinks token={active} />
                  </div>
                  <span className={`tag ${active.status === "graduated" ? "grad" : "live"}`}>
                    {active.status === "graduated" ? "grad" : "live"}
                  </span>
                </div>

                {active.description && <p className="sub">{active.description}</p>}

                <div className="stats4">
                  <div className="s">
                    <div className="l">price</div>
                    <div className="v">${active.price.toPrecision(4)}</div>
                  </div>
                  <div className="s">
                    <div className="l">mcap</div>
                    <div className="v">{fmtUsd(active.mcap)}</div>
                  </div>
                  <div className="s">
                    <div className="l">vol</div>
                    <div className="v">{fmtUsd(active.vol24h)}</div>
                  </div>
                  <div className="s">
                    <div className="l">holders</div>
                    <div className="v">{active.holders}</div>
                  </div>
                </div>

                <div className="chart" aria-hidden>
                  <svg viewBox="0 0 640 240" preserveAspectRatio="none">
                    <path
                      d={chartPath(active)}
                      fill="rgba(0,200,83,0.12)"
                      stroke="#00c853"
                      strokeWidth="2"
                    />
                  </svg>
                </div>

                <div className="prog" style={{ marginTop: 12 }}>
                  <div className="track">
                    <i style={{ width: `${Math.min(100, active.progress)}%` }} />
                  </div>
                  <div className="cap">
                    curve {fmtUsd(active.raised)} / {fmtUsd(GRAD_TARGET)} ·{" "}
                    {Math.min(100, active.progress).toFixed(1)}%
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="tabs2">
                  <button className={side === "buy" ? "on buy" : ""} onClick={() => setSide("buy")}>
                    buy
                  </button>
                  <button className={side === "sell" ? "on sell" : ""} onClick={() => setSide("sell")}>
                    sell
                  </button>
                </div>
                <div className="field">
                  <label>amount ({QUOTE_SYMBOL})</label>
                  <input
                    type="number"
                    min={0}
                    value={tradeAmt}
                    onChange={(e) => setTradeAmt(e.target.value)}
                  />
                </div>
                <div className="lines" style={{ marginTop: 8 }}>
                  <div className="ln">
                    <span>trade fee ({bpsToPct(TRADE_FEE_BPS)})</span>
                    <b>{fmtUsd(tradePreview.total)}</b>
                  </div>
                  <div className="ln">
                    <span>creator ({shareToPct(CREATOR_SHARE_BPS)})</span>
                    <b className="up">{fmtUsd(tradePreview.creator)}</b>
                  </div>
                  <div className="ln">
                    <span>platform ({shareToPct(PLATFORM_SHARE_BPS)})</span>
                    <b>{fmtUsd(tradePreview.platform)}</b>
                  </div>
                  <div className="ln">
                    <span>creator earned</span>
                    <b className="up">{fmtUsd(active.creatorFeesEarned)}</b>
                  </div>
                  <div className="ln">
                    <span>creator wallet</span>
                    <b className="mono">{shortAddr(active.creator, 4)}</b>
                  </div>
                </div>
                <button
                  className={`btn lg block ${side === "buy" ? "green" : "red"}`}
                  style={{ marginTop: 12 }}
                  onClick={simulateTrade}
                >
                  {side === "buy" ? "buy" : "sell"}
                </button>
                {msg && <div className="note">{msg}</div>}
              </div>
            </div>
          )}
        </section>
      )}

      <footer className="foot">
        <span>
          {APP_NAME} · {CHAIN_NAME} {CHAIN_ID}
        </span>
        <span>
          fee {bpsToPct(TRADE_FEE_BPS)} · creator {shareToPct(CREATOR_SHARE_BPS)} · platform{" "}
          {shareToPct(PLATFORM_SHARE_BPS)} · create $0 · grad {fmtUsd(GRAD_TARGET)}
        </span>
      </footer>
    </div>
  );
}

function chartPath(t: LaunchToken) {
  const pts: string[] = [];
  const n = 32;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 640;
    const wave =
      Math.sin(i * 0.45 + t.imageHue * 0.01) * 16 +
      Math.cos(i * 0.18) * 8 +
      (t.change24h >= 0 ? -i * 1.8 : i * 1.1);
    const y = Math.min(220, Math.max(30, 170 + wave - t.progress * 0.55));
    pts.push(`${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return `${pts.join(" ")} L 640 240 L 0 240 Z`;
}
