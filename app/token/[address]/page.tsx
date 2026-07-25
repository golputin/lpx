"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BrowserProvider } from "ethers";
import {
  APP_NAME,
  CHAIN_ID,
  CHAIN_NAME,
  CREATOR_SHARE_BPS,
  DEMO_MODE,
  FACTORY_ADDRESS,
  GRAD_TARGET,
  PLATFORM_SHARE_BPS,
  QUOTE_SYMBOL,
  TRADE_FEE_BPS,
  bpsToPct,
  feeSplit,
  fmt,
  fmtUsd,
  normalizeUrl,
  shareToPct,
  shortAddr,
} from "@/lib/config";
import {
  DEMO_TOKENS,
  DEMO_WALLET,
  LaunchToken,
  claimableFees,
  placeholderImage,
} from "@/lib/demo";
import { DEPLOYMENT } from "@/lib/deployment";
import { explorerAddress, loadLiveToken } from "@/lib/onchain";
import {
  buyOnCurve,
  connectWallet,
  formatTradeError,
  getInjected,
  getNativeBalance,
  getTokenBalance,
  quoteBuy,
  quoteSell,
  sellOnCurve,
} from "@/lib/wallet";

type Side = "buy" | "sell";

function isAddr(a: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(a);
}

function TokenAvatar({
  token,
  size = 48,
}: {
  token: Pick<LaunchToken, "symbol" | "imageUrl" | "imageHue" | "address">;
  size?: number;
}) {
  const src = token.imageUrl || placeholderImage(token.symbol + token.address, token.imageHue);
  return (
    <div
      className="av lg"
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

function SocialLinks({ token }: { token: Pick<LaunchToken, "website" | "twitter" | "telegram"> }) {
  const items = [
    { href: normalizeUrl(token.website), label: "web" },
    { href: normalizeUrl(token.twitter), label: "x" },
    { href: normalizeUrl(token.telegram), label: "tg" },
  ].filter((x) => x.href);
  if (!items.length) return null;
  return (
    <div className="socials">
      {items.map((x) => (
        <a key={x.label} href={x.href} target="_blank" rel="noreferrer">
          {x.label}
        </a>
      ))}
    </div>
  );
}

function chartPath(t: LaunchToken) {
  const pts: string[] = [];
  const n = 32;
  let y = 180;
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * 640;
    const wave = Math.sin(i * 0.45 + t.progress * 0.02) * 18;
    const trend = (t.progress / 100) * 90;
    y = 190 - trend - wave - (i / n) * 40 * Math.max(0.2, t.change24h / 30 + 0.5);
    pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return `${pts.join(" ")} L640,240 L0,240 Z`;
}

export default function TokenPage() {
  const params = useParams<{ address: string }>();
  const router = useRouter();
  const raw = String(params?.address || "").toLowerCase();
  const address = isAddr(raw) ? raw : "";

  const [token, setToken] = useState<LaunchToken | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [wallet, setWallet] = useState<string | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [nativeBal, setNativeBal] = useState(0);
  const [tokenBal, setTokenBal] = useState(0);
  const [side, setSide] = useState<Side>("buy");
  const [tradeAmt, setTradeAmt] = useState("1");
  const [quotePreview, setQuotePreview] = useState<{ out: number; fee: number }>({ out: 0, fee: 0 });
  const [tradeBusy, setTradeBusy] = useState(false);
  const [walletBusy, setWalletBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const me = (wallet || "").toLowerCase();

  const refreshToken = useCallback(async () => {
    if (!address) {
      setErr("invalid token address");
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      if (DEMO_MODE) {
        const demo =
          DEMO_TOKENS.find((t) => t.address.toLowerCase() === address) ||
          ({
            ...DEMO_TOKENS[0],
            address,
            name: "Unknown",
            symbol: "???",
          } as LaunchToken);
        setToken(demo);
      } else {
        const t = await loadLiveToken(address);
        if (!t) {
          // still show shell with address so URL works
          setToken({
            address,
            name: "Token",
            symbol: shortAddr(address, 2).replace("…", "").toUpperCase() || "TKN",
            creator: "0x0000000000000000000000000000000000000000",
            curve: DEPLOYMENT.test?.curve,
            createdAt: Math.floor(Date.now() / 1000),
            raised: 0,
            mcap: 0,
            vol24h: 0,
            holders: 0,
            progress: 0,
            status: "live",
            price: 0,
            change24h: 0,
            description: "Token not found in factory registry (yet)",
            creatorFeesEarned: 0,
            creatorFeesClaimed: 0,
            platformFeesEarned: 0,
            imageHue: 160,
            imageUrl: placeholderImage(address, 160),
          });
          setErr("token not indexed on this factory — check address");
        } else {
          setToken(t);
        }
      }
    } catch (e) {
      setErr(formatTradeError(e));
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    refreshToken();
  }, [refreshToken]);

  async function refreshBalances(addr: string, prov?: BrowserProvider | null, tok?: LaunchToken | null) {
    try {
      const native = await getNativeBalance(addr, prov || undefined);
      setNativeBal(native);
      if (tok?.address && !DEMO_MODE) {
        setTokenBal(await getTokenBalance(tok.address, addr, prov || undefined));
      } else if (DEMO_MODE) {
        setTokenBal(side === "sell" ? 25000 : 0);
      } else {
        setTokenBal(0);
      }
    } catch (e) {
      console.warn(e);
    }
  }

  useEffect(() => {
    if (!wallet) return;
    refreshBalances(wallet, provider, token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, token?.address, provider]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const amt = Math.max(0, Number(tradeAmt) || 0);
      if (!token || amt <= 0) {
        if (!cancelled) setQuotePreview({ out: 0, fee: 0 });
        return;
      }
      if (DEMO_MODE || !token.curve) {
        const split = feeSplit(amt);
        if (side === "buy") {
          const tokensOut = token.price > 0 ? (amt - split.total) / Math.max(token.price, 1e-12) : 0;
          if (!cancelled) setQuotePreview({ out: tokensOut, fee: split.total });
        } else {
          const quote = amt * token.price;
          const s = feeSplit(quote);
          if (!cancelled) setQuotePreview({ out: Math.max(0, quote - s.total), fee: s.total });
        }
        return;
      }
      try {
        if (side === "buy") {
          const q = await quoteBuy(token.curve, amt);
          if (!cancelled) setQuotePreview({ out: q.tokensOut, fee: q.fee });
        } else {
          const q = await quoteSell(token.curve, amt);
          if (!cancelled) setQuotePreview({ out: q.quoteOut, fee: q.fee });
        }
      } catch {
        if (!cancelled) setQuotePreview({ out: 0, fee: 0 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tradeAmt, side, token]);

  async function connect() {
    if (DEMO_MODE) {
      setWallet(DEMO_WALLET);
      setNativeBal(12.5);
      setTokenBal(25000);
      setMsg("connected (demo wallet)");
      return;
    }
    setWalletBusy(true);
    try {
      const { address: addr, provider: prov } = await connectWallet();
      setWallet(addr);
      setProvider(prov);
      await refreshBalances(addr, prov, token);
      setMsg(`connected ${shortAddr(addr, 4)} · Stable ${CHAIN_ID}`);
      const eth = getInjected();
      eth?.on?.("accountsChanged", (accs: unknown) => {
        const list = accs as string[];
        if (!list?.length) {
          setWallet(null);
          setProvider(null);
          setNativeBal(0);
          setTokenBal(0);
          return;
        }
        const next = list[0].toLowerCase();
        setWallet(next);
        refreshBalances(next, prov, token);
      });
      eth?.on?.("chainChanged", () => window.location.reload());
    } catch (e) {
      setMsg(formatTradeError(e));
    } finally {
      setWalletBusy(false);
    }
  }

  function disconnect() {
    setWallet(null);
    setProvider(null);
    setNativeBal(0);
    setTokenBal(0);
    setMsg("disconnected");
  }

  function setPct(pct: number) {
    if (side === "buy") {
      const usable = Math.max(0, nativeBal - (DEMO_MODE ? 0 : 0.02));
      const v = (usable * pct) / 100;
      setTradeAmt(v > 0 ? (Math.floor(v * 1e4) / 1e4).toString() : "0");
    } else {
      const v = (tokenBal * pct) / 100;
      setTradeAmt(v > 0 ? (Math.floor(v * 1e4) / 1e4).toString() : "0");
    }
  }

  async function executeTrade() {
    if (!token) return;
    const amt = Math.max(0, Number(tradeAmt) || 0);
    if (amt <= 0) {
      setMsg("enter amount");
      return;
    }
    if (!wallet) {
      await connect();
      return;
    }
    if (DEMO_MODE) {
      const split = feeSplit(side === "buy" ? amt : amt * token.price);
      setMsg(`${side} ok (demo) · fee ${fmtUsd(split.total)}`);
      if (side === "buy") {
        setNativeBal((b) => Math.max(0, b - amt));
        setTokenBal((b) => b + quotePreview.out);
      } else {
        setTokenBal((b) => Math.max(0, b - amt));
        setNativeBal((b) => b + quotePreview.out);
      }
      return;
    }
    if (!provider) {
      setMsg("reconnect wallet");
      return;
    }
    const curve = token.curve || DEPLOYMENT.test?.curve;
    if (!curve) {
      setMsg("curve missing");
      return;
    }
    if (token.status === "graduated") {
      setMsg("graduated — trade on DEX");
      return;
    }
    setTradeBusy(true);
    setMsg(side === "buy" ? "confirm buy in wallet…" : "confirm sell in wallet…");
    try {
      if (side === "buy") {
        const res = await buyOnCurve({ provider, curve, amountUsdt0: amt });
        setMsg(`bought · ${shortAddr(res.hash, 6)}`);
      } else {
        const res = await sellOnCurve({
          provider,
          curve,
          token: token.address,
          tokensIn: amt,
        });
        setMsg(`sold · ~${fmtUsd(res.quoteOut || 0)} · ${shortAddr(res.hash, 6)}`);
      }
      await refreshToken();
      await refreshBalances(wallet, provider, token);
    } catch (e) {
      setMsg(formatTradeError(e));
    } finally {
      setTradeBusy(false);
    }
  }

  const tradePreview =
    side === "buy"
      ? feeSplit(Number(tradeAmt) || 0)
      : {
          total: quotePreview.fee,
          creator: quotePreview.fee * (CREATOR_SHARE_BPS / 10000),
          platform: quotePreview.fee * (PLATFORM_SHARE_BPS / 10000),
        };

  return (
    <div className="app">
      <header className="top">
        <Link href="/" className="logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" />
          {APP_NAME}
          <span>/{CHAIN_ID}</span>
        </Link>
        <nav className="menu">
          <Link href="/" className="nav-link">
            explore
          </Link>
          <Link href="/?tab=create" className="nav-link">
            create
          </Link>
          <span className="nav-link on">token</span>
          <Link href="/?tab=profile" className="nav-link">
            profile
          </Link>
        </nav>
        <div className="right">
          <span className="pill">
            <b>●</b> {CHAIN_NAME}
          </span>
          {!DEMO_MODE && (
            <a className="pill" href={explorerAddress(FACTORY_ADDRESS)} target="_blank" rel="noreferrer">
              live · {shortAddr(FACTORY_ADDRESS, 3)}
            </a>
          )}
          {wallet ? (
            <button className="btn wallet-btn" onClick={disconnect} title="disconnect">
              <span>{shortAddr(wallet, 3)}</span>
              <span className="bal-chip">
                {fmt(nativeBal, 3)} {QUOTE_SYMBOL}
              </span>
            </button>
          ) : (
            <button className="btn green" onClick={connect} disabled={walletBusy}>
              {walletBusy ? "connecting…" : "connect"}
            </button>
          )}
        </div>
      </header>

      <button className="back" onClick={() => router.push("/")}>
        ← explore
      </button>

      {loading && <div className="empty">loading token…</div>}
      {!loading && !token && <div className="empty">token not found</div>}

      {!loading && token && (
        <div className="grid2">
          <div className="card">
            <div className="head">
              <TokenAvatar token={token} size={48} />
              <div style={{ flex: 1 }}>
                <h2>{token.name}</h2>
                <div className="meta mono">
                  ${token.symbol} ·{" "}
                  <a href={explorerAddress(token.address)} target="_blank" rel="noreferrer">
                    {shortAddr(token.address, 5)}
                  </a>
                </div>
                <SocialLinks token={token} />
              </div>
              <span className={`tag ${token.status === "graduated" ? "grad" : "live"}`}>
                {token.status === "graduated" ? "grad" : "live"}
              </span>
            </div>

            {token.description && <p className="sub">{token.description}</p>}
            {err && <div className="note">{err}</div>}

            <div className="stats4">
              <div className="s">
                <div className="l">price</div>
                <div className="v">${token.price > 0 ? token.price.toPrecision(4) : "0"}</div>
              </div>
              <div className="s">
                <div className="l">mcap</div>
                <div className="v">{fmtUsd(token.mcap)}</div>
              </div>
              <div className="s">
                <div className="l">vol</div>
                <div className="v">{fmtUsd(token.vol24h)}</div>
              </div>
              <div className="s">
                <div className="l">holders</div>
                <div className="v">{token.holders}</div>
              </div>
            </div>

            <div className="chart" aria-hidden>
              <svg viewBox="0 0 640 240" preserveAspectRatio="none">
                <path
                  d={chartPath(token)}
                  fill="rgba(0,200,83,0.12)"
                  stroke="#00c853"
                  strokeWidth="2"
                />
              </svg>
            </div>

            <div className="prog" style={{ marginTop: 12 }}>
              <div className="track">
                <i style={{ width: `${Math.min(100, token.progress)}%` }} />
              </div>
              <div className="cap">
                curve {fmtUsd(token.raised)} / {fmtUsd(GRAD_TARGET)} ·{" "}
                {Math.min(100, token.progress).toFixed(2)}%
              </div>
            </div>

            <div className="lines" style={{ marginTop: 12 }}>
              <div className="ln">
                <span>contract</span>
                <b className="mono">
                  <a href={explorerAddress(token.address)} target="_blank" rel="noreferrer">
                    {shortAddr(token.address, 6)}
                  </a>
                </b>
              </div>
              {token.curve && (
                <div className="ln">
                  <span>curve</span>
                  <b className="mono">
                    <a href={explorerAddress(token.curve)} target="_blank" rel="noreferrer">
                      {shortAddr(token.curve, 6)}
                    </a>
                  </b>
                </div>
              )}
              <div className="ln">
                <span>creator</span>
                <b className="mono">{shortAddr(token.creator, 4)}</b>
              </div>
            </div>
          </div>

          <div className="card trade-card">
            <div className="tabs2">
              <button
                className={side === "buy" ? "on buy" : ""}
                onClick={() => {
                  setSide("buy");
                  setTradeAmt("1");
                }}
              >
                buy
              </button>
              <button
                className={side === "sell" ? "on sell" : ""}
                onClick={() => {
                  setSide("sell");
                  setTradeAmt("");
                }}
              >
                sell
              </button>
            </div>

            <div className="bal-row">
              <span>wallet balance</span>
              <b className="mono">
                {side === "buy"
                  ? `${fmt(nativeBal, 4)} ${QUOTE_SYMBOL}`
                  : `${fmt(tokenBal, 4)} ${token.symbol}`}
              </b>
            </div>

            <div className="field">
              <label>{side === "buy" ? `pay (${QUOTE_SYMBOL})` : `sell (${token.symbol})`}</label>
              <input
                type="number"
                min={0}
                step="any"
                value={tradeAmt}
                placeholder="0.0"
                onChange={(e) => setTradeAmt(e.target.value)}
              />
            </div>

            <div className="pct-row">
              {[25, 50, 75, 100].map((p) => (
                <button key={p} type="button" className="pct" onClick={() => setPct(p)} disabled={!wallet}>
                  {p === 100 ? "MAX" : `${p}%`}
                </button>
              ))}
            </div>

            <div className="lines" style={{ marginTop: 10 }}>
              <div className="ln">
                <span>you receive</span>
                <b className="up">
                  {side === "buy"
                    ? `${fmt(quotePreview.out, 4)} ${token.symbol}`
                    : `${fmt(quotePreview.out, 4)} ${QUOTE_SYMBOL}`}
                </b>
              </div>
              <div className="ln">
                <span>trade fee ({bpsToPct(TRADE_FEE_BPS)})</span>
                <b>{fmtUsd(tradePreview.total || quotePreview.fee)}</b>
              </div>
              <div className="ln">
                <span>creator cut ({shareToPct(CREATOR_SHARE_BPS)})</span>
                <b className="up">{fmtUsd(tradePreview.creator)}</b>
              </div>
              <div className="ln">
                <span>platform cut ({shareToPct(PLATFORM_SHARE_BPS)})</span>
                <b>{fmtUsd(tradePreview.platform)}</b>
              </div>
            </div>

            {!wallet ? (
              <button className="btn lg block green" style={{ marginTop: 12 }} onClick={connect} disabled={walletBusy}>
                {walletBusy ? "connecting…" : "connect wallet to trade"}
              </button>
            ) : (
              <button
                className={`btn lg block ${side === "buy" ? "green" : "red"}`}
                style={{ marginTop: 12 }}
                disabled={tradeBusy || token.status === "graduated"}
                onClick={executeTrade}
              >
                {tradeBusy
                  ? "confirm in wallet…"
                  : token.status === "graduated"
                    ? "graduated"
                    : side === "buy"
                      ? `buy ${token.symbol}`
                      : `sell ${token.symbol}`}
              </button>
            )}
            {msg && <div className="note">{msg}</div>}
          </div>
        </div>
      )}

      <footer className="foot">
        <span>
          {APP_NAME} · {CHAIN_NAME} {CHAIN_ID}
        </span>
        <span>
          fee {bpsToPct(TRADE_FEE_BPS)} · creator {shareToPct(CREATOR_SHARE_BPS)} · platform{" "}
          {shareToPct(PLATFORM_SHARE_BPS)} · grad {fmtUsd(GRAD_TARGET)}
        </span>
      </footer>
    </div>
  );
}
