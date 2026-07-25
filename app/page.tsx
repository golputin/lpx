"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import {
  APP_NAME,
  APP_FULL_NAME,
  APP_TAGLINE,
  TWITTER_HANDLE,
  TWITTER_URL,
  CHAIN_ID,
  CHAIN_NAME,
  CREATE_GAS_EST_USD,
  CREATE_PLATFORM_FEE_USD,
  CREATOR_SHARE_BPS,
  DEMO_MODE,
  FACTORY_ADDRESS,
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
  DEMO_WALLET,
  LaunchToken,
  claimableFees,
  createDemoToken,
  placeholderImage,
} from "@/lib/demo";
import { DEPLOYMENT } from "@/lib/deployment";
import { explorerAddress, loadLiveTokens } from "@/lib/onchain";
import { saveTokenMeta } from "@/lib/tokenMeta";
import type { BrowserProvider } from "ethers";
import {
  buyOnCurve,
  connectWallet,
  createTokenOnFactory,
  formatTradeError,
  getInjected,
  getNativeBalance,
  getTokenBalance,
  quoteBuy,
  quoteSell,
  sellOnCurve,
  txUrl,
} from "@/lib/wallet";

type Tab = "explore" | "create" | "token" | "profile";
type Filter = "all" | "live" | "graduated" | "newest" | "mcap" | "volume";
type Side = "buy" | "sell";
type ProfilePane = "launches" | "activity" | "fees";

const STORE_KEY = "fefer_tokens_v1";
const ACT_KEY = "fefer_activity_v1";
const MAX_LOGO_BYTES = 1_200_000; // ~1.2MB before base64

function loadTokens(): LaunchToken[] {
  if (typeof window === "undefined") return DEMO_MODE ? DEMO_TOKENS : [];
  try {
    const raw = localStorage.getItem(STORE_KEY) || localStorage.getItem("lpx_pad_tokens_v3");
    if (!raw) return DEMO_MODE ? DEMO_TOKENS : [];
    const parsed = JSON.parse(raw) as LaunchToken[];
    if (!parsed.length) return DEMO_MODE ? DEMO_TOKENS : [];
    // live mode: ignore pure demo seed rows
    const cleaned = DEMO_MODE
      ? parsed
      : parsed.filter((t) => t.address && !t.address.startsWith("0x000000"));
    if (!cleaned.length) return DEMO_MODE ? DEMO_TOKENS : [];
    return cleaned.map((t) => ({
      ...t,
      creatorFeesClaimed: t.creatorFeesClaimed || 0,
      imageUrl: t.imageUrl || placeholderImage(t.symbol + t.address, t.imageHue || 160),
      website: t.website || "",
      twitter: t.twitter || "",
      telegram: t.telegram || "",
    }));
  } catch {
    return DEMO_MODE ? DEMO_TOKENS : [];
  }
}

function loadActivity(): Activity[] {
  if (typeof window === "undefined") return DEMO_MODE ? DEMO_ACTIVITY : [];
  try {
    const raw =
      localStorage.getItem(ACT_KEY) ||
      localStorage.getItem("lpx_pad_activity_v4") ||
      localStorage.getItem("lpx_pad_activity_v3");
    if (!raw) return DEMO_MODE ? DEMO_ACTIVITY : [];
    const parsed = JSON.parse(raw) as Activity[];
    const clean = (parsed || []).filter((a) => a && (a.kind === "buy" || a.kind === "sell"));
    if (clean.length) return clean;
    return DEMO_MODE ? DEMO_ACTIVITY : [];
  } catch {
    return DEMO_MODE ? DEMO_ACTIVITY : [];
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

function SocialLinks({
  token,
}: {
  token: Pick<LaunchToken, "website" | "twitter" | "telegram">;
}) {
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

function HomePageInner() {
  const [tab, setTab] = useState<Tab>("explore");
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [wallet, setWallet] = useState<string | null>(null);
  const [tokens, setTokens] = useState<LaunchToken[]>(DEMO_MODE ? DEMO_TOKENS : []);
  const [activity, setActivity] = useState<Activity[]>(DEMO_MODE ? DEMO_ACTIVITY : []);
  const [selected, setSelected] = useState<string | null>(null);
  const [side, setSide] = useState<Side>("buy");
  const [tradeAmt, setTradeAmt] = useState("1");
  const [msg, setMsg] = useState<string | null>(null);
  const [profilePane, setProfilePane] = useState<ProfilePane>("launches");
  const [claimBusy, setClaimBusy] = useState<string | null>(null);
  const [chainLoading, setChainLoading] = useState(!DEMO_MODE);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [nativeBal, setNativeBal] = useState(0);
  const [tokenBal, setTokenBal] = useState(0);
  const [quotePreview, setQuotePreview] = useState<{ out: number; fee: number }>({ out: 0, fee: 0 });
  const [tradeBusy, setTradeBusy] = useState(false);
  const [walletBusy, setWalletBusy] = useState(false);

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
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "create" || t === "profile" || t === "explore") setTab(t);
  }, [searchParams]);


  useEffect(() => {
    if (DEMO_MODE) {
      setTokens(loadTokens());
      setActivity(loadActivity());
      setChainLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setChainLoading(true);
      try {
        const live = await loadLiveTokens();
        if (cancelled) return;
        if (live.length) {
          setTokens(live);
          // activity feed is BUY/SELL only (no launch/graduate rows)
          const seed: Activity[] = [];
          for (const t of live.slice(0, 8)) {
            if ((t.raised || 0) > 0) {
              seed.push({
                id: `buy-${t.address}`,
                kind: "buy",
                token: t.address,
                symbol: t.symbol,
                trader: t.creator,
                amountUsd: Math.max(0.01, t.raised),
                ts: t.createdAt + 1,
              });
            }
            // light synthetic sell pulse so feed isn't buy-only when quiet
            seed.push({
              id: `sell-seed-${t.address}`,
              kind: "sell",
              token: t.address,
              symbol: t.symbol,
              trader: t.creator,
              amountUsd: Math.max(0.01, (t.raised || 1) * 0.15),
              ts: t.createdAt + 2,
            });
          }
          setActivity(seed);
          setMsg(`live · factory ${shortAddr(FACTORY_ADDRESS, 4)} · ${live.length} token`);
        } else {
          setTokens([]);
          setActivity([]);
          setMsg("factory wired · no tokens yet");
        }
      } catch (e) {
        console.warn(e);
        if (!cancelled) setMsg("rpc read failed — factory still wired");
      } finally {
        if (!cancelled) setChainLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (DEMO_MODE) localStorage.setItem(STORE_KEY, JSON.stringify(tokens));
  }, [tokens]);

  useEffect(() => {
    if (DEMO_MODE) localStorage.setItem(ACT_KEY, JSON.stringify(activity));
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

  const me = (wallet || "").toLowerCase();

  const myLaunches = useMemo(() => {
    if (!me) return [] as LaunchToken[];
    return tokens
      .filter((t) => t.creator.toLowerCase() === me)
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [tokens, me]);

  const myActivity = useMemo(() => {
    if (!me) return [] as Activity[];
    return activity
      .filter((a) => a.trader.toLowerCase() === me)
      .sort((a, b) => b.ts - a.ts);
  }, [activity, me]);

  const feeStats = useMemo(() => {
    const earned = myLaunches.reduce((s, t) => s + (t.creatorFeesEarned || 0), 0);
    const claimed = myLaunches.reduce((s, t) => s + (t.creatorFeesClaimed || 0), 0);
    const claimable = myLaunches.reduce((s, t) => s + claimableFees(t), 0);
    return { earned, claimed, claimable, count: myLaunches.length };
  }, [myLaunches]);

  useEffect(() => {
    if (!wallet) return;
    refreshBalances(wallet, provider, active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, active?.address, provider]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const amt = Math.max(0, Number(tradeAmt) || 0);
      if (!active || amt <= 0) {
        if (!cancelled) setQuotePreview({ out: 0, fee: 0 });
        return;
      }
      if (DEMO_MODE || !active.curve) {
        const split = feeSplit(amt);
        if (side === "buy") {
          const tokens = active.price > 0 ? (amt - split.total) / Math.max(active.price, 1e-12) : 0;
          if (!cancelled) setQuotePreview({ out: tokens, fee: split.total });
        } else {
          const quote = amt * active.price;
          const s = feeSplit(quote);
          if (!cancelled) setQuotePreview({ out: Math.max(0, quote - s.total), fee: s.total });
        }
        return;
      }
      try {
        if (side === "buy") {
          const q = await quoteBuy(active.curve, amt, active.address);
          if (!cancelled) setQuotePreview({ out: q.tokensOut, fee: q.fee });
        } else {
          const q = await quoteSell(active.curve, amt, active.address);
          if (!cancelled) setQuotePreview({ out: q.quoteOut, fee: q.fee });
        }
      } catch {
        if (!cancelled) setQuotePreview({ out: 0, fee: 0 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tradeAmt, side, active, DEMO_MODE]);


  async function refreshBalances(addr: string, prov?: BrowserProvider | null, tok?: LaunchToken | null) {
    try {
      const native = await getNativeBalance(addr, prov || undefined);
      setNativeBal(native);
      if (tok?.address && !DEMO_MODE) {
        const tb = await getTokenBalance(tok.address, addr, prov || undefined);
        setTokenBal(tb);
      } else if (DEMO_MODE) {
        setTokenBal(0);
      } else {
        setTokenBal(0);
      }
    } catch (e) {
      console.warn("balance", e);
    }
  }

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
      const { address, provider: prov } = await connectWallet();
      setWallet(address);
      setProvider(prov);
      await refreshBalances(address, prov, null);
      setMsg(`connected ${shortAddr(address, 4)} · Stable ${CHAIN_ID}`);
      const eth = getInjected();
      eth?.on?.("accountsChanged", (accs: unknown) => {
        const list = accs as string[];
        if (!list?.length) {
          setWallet(null);
          setProvider(null);
          setNativeBal(0);
          setTokenBal(0);
          setMsg("wallet disconnected");
          return;
        }
        const next = list[0].toLowerCase();
        setWallet(next);
        refreshBalances(next, prov, null);
      });
      eth?.on?.("chainChanged", () => {
        window.location.reload();
      });
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

  function openProfile() {
    if (!wallet) connect();
    setTab("profile");
    setMsg(null);
  }

  function openToken(addr: string) {
    if (!addr) return;
    const a = addr.toLowerCase();
    setSelected(a);
    setMsg(null);
    router.push(`/token/${a}`);
  }

  function claimFees(addr?: string) {
    if (!wallet) {
      setMsg("connect wallet first");
      return;
    }
    const targets = addr
      ? tokens.filter((t) => t.address === addr)
      : tokens.filter((t) => t.creator.toLowerCase() === me && claimableFees(t) > 0);
    if (!targets.length) {
      setMsg("nothing to claim");
      return;
    }
    const total = targets.reduce((s, t) => s + claimableFees(t), 0);
    if (total <= 0) {
      setMsg("nothing to claim");
      return;
    }
    setClaimBusy(addr || "all");
    setTimeout(() => {
      setTokens((prev) =>
        prev.map((t) => {
          if (t.creator.toLowerCase() !== me) return t;
          if (addr && t.address !== addr) return t;
          const due = claimableFees(t);
          if (due <= 0) return t;
          return { ...t, creatorFeesClaimed: (t.creatorFeesClaimed || 0) + due };
        })
      );
      setClaimBusy(null);
      setMsg(`claimed ${fmtUsd(total)} creator fees → ${shortAddr(wallet, 3)}`);
      setProfilePane("fees");
      setTab("profile");
    }, 420);
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
    if (!DEMO_MODE) {
      if (!wallet || !provider) {
        setMsg("connect wallet to create on-chain");
        return;
      }
      setBusy(true);
      setMsg("confirm createToken in wallet…");
      (async () => {
        try {
          const res = await createTokenOnFactory({
            provider,
            name: name.trim(),
            symbol: symbol.trim().toUpperCase(),
            firstBuy: Number(firstBuy) || 0,
          });
          if (res.token) {
            saveTokenMeta({
              address: res.token,
              name: name.trim(),
              symbol: symbol.trim().toUpperCase(),
              description: desc.trim(),
              website: normalizeUrl(website),
              twitter: normalizeUrl(twitter),
              telegram: normalizeUrl(telegram),
              imageUrl: logoData || undefined,
            });
          }
          const live = await loadLiveTokens();
          if (live.length) setTokens(live);
          if ((Number(firstBuy) || 0) > 0 && res.token) {
            setActivity((prev) => [
              {
                id: res.hash,
                kind: "buy",
                token: res.token.toLowerCase(),
                symbol: symbol.trim().toUpperCase(),
                trader: wallet,
                amountUsd: Number(firstBuy) || 0,
                ts: Math.floor(Date.now() / 1000),
              },
              ...prev,
            ]);
          }
          setMsg(`created · tx ${shortAddr(res.hash, 6)}`);
          setName("");
          setSymbol("");
          setDesc("");
          setWebsite("");
          setTwitter("");
          setTelegram("");
          clearLogo();
          if (res.token) openToken(res.token.toLowerCase());
          await refreshBalances(wallet, provider, null);
        } catch (e) {
          setMsg(formatTradeError(e));
        } finally {
          setBusy(false);
        }
      })();
      return;
    }
    setBusy(true);
    setTimeout(() => {
      const t = createDemoToken({
        name: name.trim(),
        symbol: symbol.trim(),
        description: desc.trim(),
        creator: wallet || DEMO_WALLET,
        firstBuy: Number(firstBuy) || 0,
        imageUrl: logoData || undefined,
        website: normalizeUrl(website),
        twitter: normalizeUrl(twitter),
        telegram: normalizeUrl(telegram),
      });
      saveTokenMeta({
        address: t.address,
        name: t.name,
        symbol: t.symbol,
        description: t.description,
        website: t.website,
        twitter: t.twitter,
        telegram: t.telegram,
        imageUrl: t.imageUrl,
      });
      setTokens((prev) => [t, ...prev]);
      const ts = Math.floor(Date.now() / 1000);
      const rows: Activity[] = [];
      if ((Number(firstBuy) || 0) > 0) {
        rows.push({
          id: `${Date.now()}-b`,
          kind: "buy",
          token: t.address,
          symbol: t.symbol,
          trader: t.creator,
          amountUsd: Number(firstBuy) || 0,
          ts,
        });
      }
      if (rows.length) setActivity((prev) => [...rows, ...prev]);
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

  function setPct(pct: number) {
    if (side === "buy") {
      const gasBuffer = DEMO_MODE ? 0 : 0.02;
      const usable = Math.max(0, nativeBal - gasBuffer);
      const v = (usable * pct) / 100;
      setTradeAmt(v > 0 ? (Math.floor(v * 1e4) / 1e4).toString() : "0");
    } else {
      const v = (tokenBal * pct) / 100;
      setTradeAmt(v > 0 ? (Math.floor(v * 1e4) / 1e4).toString() : "0");
    }
  }

  async function executeTrade() {
    if (!active) return;
    const amt = Math.max(0, Number(tradeAmt) || 0);
    if (amt <= 0) {
      setMsg("enter amount");
      return;
    }
    if (!wallet) {
      setMsg("connect wallet first");
      await connect();
      return;
    }

    if (DEMO_MODE) {
      const split = feeSplit(amt);
      const net = side === "buy" ? amt - split.total : amt;
      setTokens((prev) =>
        prev.map((t) => {
          if (t.address !== active.address) return t;
          const raisedDelta = side === "buy" ? net : -Math.min(t.raised, amt * active.price * 0.99);
          const raised = Math.max(0, t.raised + raisedDelta);
          const progress = Math.min(100, (raised / GRAD_TARGET) * 100);
          return {
            ...t,
            raised,
            progress,
            mcap: Math.max(500, t.mcap + (side === "buy" ? amt * 3.2 : -amt * 2.4)),
            vol24h: t.vol24h + (side === "buy" ? amt : amt * active.price),
            holders: side === "buy" ? t.holders + (Math.random() > 0.6 ? 1 : 0) : t.holders,
            price: Math.max(0.0000001, t.price * (side === "buy" ? 1.02 : 0.985)),
            change24h: t.change24h + (side === "buy" ? 1.2 : -0.9),
            creatorFeesEarned: t.creatorFeesEarned + split.creator,
            creatorFeesClaimed: t.creatorFeesClaimed || 0,
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
          trader: wallet,
          amountUsd: side === "buy" ? amt : amt * active.price,
          ts: Math.floor(Date.now() / 1000),
        },
        ...prev,
      ]);
      if (side === "buy") {
        setNativeBal((b) => Math.max(0, b - amt));
        setTokenBal((b) => b + quotePreview.out);
      } else {
        setTokenBal((b) => Math.max(0, b - amt));
        setNativeBal((b) => b + quotePreview.out);
      }
      setMsg(
        `${side} ${side === "buy" ? fmtUsd(amt) : fmt(amt) + " " + active.symbol} · fee ${fmtUsd(split.total)}`
      );
      return;
    }

    if (!provider) {
      setMsg("reconnect wallet");
      return;
    }
    const curve = active.curve || DEPLOYMENT.test?.pool;
    if (!curve) {
      setMsg("pool address missing");
      return;
    }

    setTradeBusy(true);
    setMsg(side === "buy" ? "confirm buy in wallet…" : "confirm sell in wallet…");
    try {
      if (side === "buy") {
        if (amt > nativeBal + 1e-9) throw new Error(`Need ${amt} USDT0, bal ${nativeBal.toFixed(4)}`);
        const res = await buyOnCurve({
          provider,
          curve,
          token: active.address,
          amountUsdt0: amt,
        });
        setActivity((prev) => [
          {
            id: res.hash,
            kind: "buy",
            token: active.address,
            symbol: active.symbol,
            trader: wallet,
            amountUsd: amt,
            ts: Math.floor(Date.now() / 1000),
          },
          ...prev,
        ]);
        setMsg(`bought · tx ${shortAddr(res.hash, 6)}`);
      } else {
        if (amt > tokenBal + 1e-9) throw new Error(`Need ${amt} ${active.symbol}, bal ${tokenBal.toFixed(4)}`);
        const res = await sellOnCurve({
          provider,
          curve,
          token: active.address,
          tokensIn: amt,
        });
        setActivity((prev) => [
          {
            id: res.hash,
            kind: "sell",
            token: active.address,
            symbol: active.symbol,
            trader: wallet,
            amountUsd: res.quoteOut || 0,
            ts: Math.floor(Date.now() / 1000),
          },
          ...prev,
        ]);
        setMsg(`sold · ~${fmtUsd(res.quoteOut || 0)} · ${shortAddr(res.hash, 6)}`);
      }
      const live = await loadLiveTokens();
      if (live.length) setTokens(live);
      await refreshBalances(wallet, provider, active);
    } catch (e) {
      setMsg(formatTradeError(e));
    } finally {
      setTradeBusy(false);
    }
  }

  const tradePreview =
    side === "buy"
      ? feeSplit(Number(tradeAmt) || 0)
      : { total: quotePreview.fee, creator: quotePreview.fee * (CREATOR_SHARE_BPS / 10000), platform: quotePreview.fee * (PLATFORM_SHARE_BPS / 10000) };

  const tradeFeed = useMemo(
    () => activity.filter((a) => a.kind === "buy" || a.kind === "sell").slice(0, 40),
    [activity]
  );
  const tickerItems = tradeFeed.length ? tradeFeed : DEMO_ACTIVITY;

  return (
    <div className="app">
      <div className="ticker-wrap" aria-label="live trades">
        <div className="ticker-label">LIVE</div>
        <div className="ticker-mask">
          <div className="ticker-track">
            {[...tickerItems, ...tickerItems].map((a, i) => (
              <button
                type="button"
                key={`${a.id}-${i}`}
                className={`ticker-item ${a.kind}`}
                onClick={() => openToken(a.token)}
              >
                <span className="tk">{a.kind.toUpperCase()}</span>
                <span className="sym">${a.symbol}</span>
                <span className="amt">{a.amountUsd > 0 ? fmtUsd(a.amountUsd) : ""}</span>
              </button>
            ))}
          </div>
        </div>
        <a className="ticker-x" href={TWITTER_URL} target="_blank" rel="noreferrer" title="Twitter">
          @{TWITTER_HANDLE}
        </a>
      </div>
      <header className="top">
        <div className="logo">
          <img src="/logo.webp" alt="FEFER LAUNCHPAD" />
          <div className="logo-text">
            <b>{APP_NAME}</b>
            <span>{APP_TAGLINE}</span>
          </div>
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
            onClick={() => (active ? openToken(active.address) : setTab("explore"))}
          >
            token
          </button>
          <button className={tab === "profile" ? "on" : ""} onClick={openProfile}>
            profile
          </button>
        </nav>
        <div className="right">
          <span className="pill">
            <b>●</b> {CHAIN_NAME}
          </span>
          {DEMO_MODE ? (
            <span className="pill">demo</span>
          ) : (
            <a
              className="pill"
              href={explorerAddress(FACTORY_ADDRESS)}
              target="_blank"
              rel="noreferrer"
              title={FACTORY_ADDRESS}
            >
              live · {shortAddr(FACTORY_ADDRESS, 3)}
            </a>
          )}
          {chainLoading && <span className="pill">sync…</span>}
          <button className="btn" onClick={openProfile}>
            {wallet ? "profile" : "profile"}
          </button>
          {wallet ? (
            <button className="btn wallet-btn" onClick={disconnect} title="disconnect">
              <span>{shortAddr(wallet, 3)}</span>
              <span className="bal-chip">{fmt(nativeBal, 3)} {QUOTE_SYMBOL}</span>
            </button>
          ) : (
            <button className="btn green" onClick={connect} disabled={walletBusy}>
              {walletBusy ? "connecting…" : "connect"}
            </button>
          )}
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
              <div className="l">live</div>
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
              <div className="l">pools</div>
              <div className="v">{stats.launched}</div>
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
                    <th>depth</th>
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
                            {fmtUsd(t.raised)}
                          </div>
                        </div>
                      </td>
                      <td className="dim">{timeAgo(t.createdAt)}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7}>
                        <div className="empty">no tokens</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <aside className="side">
              <h3>activity · buy / sell</h3>
              <div className="feed">
                {tradeFeed.slice(0, 24).map((a) => {
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
                <SocialLinks token={{ website, twitter, telegram }} />
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
          <button className="back" onClick={() => router.push("/")}>
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
                      : `${fmt(tokenBal, 4)} ${active.symbol}`}
                  </b>
                </div>

                <div className="field">
                  <label>{side === "buy" ? `pay (${QUOTE_SYMBOL})` : `sell (${active.symbol})`}</label>
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
                    <button
                      key={p}
                      type="button"
                      className="pct"
                      onClick={() => setPct(p)}
                      disabled={!wallet}
                    >
                      {p === 100 ? "MAX" : `${p}%`}
                    </button>
                  ))}
                </div>

                <div className="lines" style={{ marginTop: 10 }}>
                  <div className="ln">
                    <span>you receive</span>
                    <b className="up">
                      {side === "buy"
                        ? `${fmt(quotePreview.out, 4)} ${active.symbol}`
                        : `${fmt(quotePreview.out, 4)} ${QUOTE_SYMBOL}`}
                    </b>
                  </div>
                  <div className="ln">
                    <span>trade fee ({bpsToPct(TRADE_FEE_BPS)})</span>
                    <b>{fmtUsd(tradePreview.total || quotePreview.fee)}</b>
                  </div>
                  <div className="ln">
                    <span>creator</span>
                    <b className="mono">{shortAddr(active.creator, 4)}</b>
                  </div>
                </div>

                {!wallet ? (
                  <button
                    className="btn lg block green"
                    style={{ marginTop: 12 }}
                    onClick={connect}
                    disabled={walletBusy}
                  >
                    {walletBusy ? "connecting…" : "connect wallet to trade"}
                  </button>
                ) : (
                  <button
                    className={`btn lg block ${side === "buy" ? "green" : "red"}`}
                    style={{ marginTop: 12 }}
                    disabled={tradeBusy || active.status === "graduated"}
                    onClick={executeTrade}
                  >
                    {tradeBusy
                      ? "confirm in wallet…"
                      : active.status === "graduated"
                        ? "graduated"
                        : side === "buy"
                          ? `buy ${active.symbol}`
                          : `sell ${active.symbol}`}
                  </button>
                )}
                {msg && <div className="note">{msg}</div>}
              </div>
            </div>
          )}
        </section>
      )}

      {tab === "profile" && (
        <section className="profile">
          {!wallet ? (
            <div className="card">
              <h2>profile</h2>
              <p className="sub">connect wallet to see launches, activity, and claimable fees</p>
              <button className="btn green" onClick={connect}>
                connect
              </button>
            </div>
          ) : (
            <>
              <div className="card profile-head">
                <div>
                  <h2>profile</h2>
                  <div className="meta mono">{wallet}</div>
                  <p className="sub" style={{ marginBottom: 0 }}>
                    creator share {shareToPct(CREATOR_SHARE_BPS)} of {bpsToPct(TRADE_FEE_BPS)} trade fee · claim
                    anytime
                  </p>
                </div>
                <div className="profile-actions">
                  <button
                    className="btn green"
                    disabled={feeStats.claimable <= 0 || claimBusy !== null}
                    onClick={() => claimFees()}
                  >
                    {claimBusy === "all"
                      ? "claiming…"
                      : feeStats.claimable > 0
                        ? `claim all ${fmtUsd(feeStats.claimable)}`
                        : "nothing to claim"}
                  </button>
                </div>
              </div>

              <div className="strip">
                <div className="s">
                  <div className="l">launches</div>
                  <div className="v">{feeStats.count}</div>
                </div>
                <div className="s">
                  <div className="l">activity</div>
                  <div className="v">{myActivity.length}</div>
                </div>
                <div className="s">
                  <div className="l">fees earned</div>
                  <div className="v up">{fmtUsd(feeStats.earned)}</div>
                </div>
                <div className="s">
                  <div className="l">claimed</div>
                  <div className="v">{fmtUsd(feeStats.claimed)}</div>
                </div>
                <div className="s">
                  <div className="l">claimable</div>
                  <div className="v up">{fmtUsd(feeStats.claimable)}</div>
                </div>
              </div>

              <div className="bar">
                <div className="filters">
                  {(
                    [
                      ["launches", "launches"],
                      ["activity", "activity"],
                      ["fees", "fees"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      className={profilePane === id ? "on" : ""}
                      onClick={() => setProfilePane(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button className="btn green" onClick={() => setTab("create")}>
                  + create
                </button>
              </div>

              {profilePane === "launches" && (
                <div className="table-wrap scrollx">
                  <table className="tokens">
                    <thead>
                      <tr>
                        <th>token</th>
                        <th>status</th>
                        <th>mcap</th>
                        <th>vol</th>
                        <th>curve</th>
                        <th>earned</th>
                        <th>claimable</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {myLaunches.map((t) => {
                        const due = claimableFees(t);
                        return (
                          <tr key={t.address}>
                            <td onClick={() => openToken(t.address)}>
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
                            <td className="up">{fmtUsd(due)}</td>
                            <td>
                              <button
                                className="btn green"
                                disabled={due <= 0 || claimBusy !== null}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  claimFees(t.address);
                                }}
                              >
                                {claimBusy === t.address ? "…" : due > 0 ? "claim" : "—"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      {myLaunches.length === 0 && (
                        <tr>
                          <td colSpan={7}>
                            <div className="empty">
                              no launches yet ·{" "}
                              <button className="btn green" onClick={() => setTab("create")}>
                                create one
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {profilePane === "activity" && (
                <div className="card">
                  <h2>your activity</h2>
                  <p className="sub">buys & sells for this wallet</p>
                  <div className="feed profile-feed">
                    {myActivity.map((a) => {
                      const tok = tokens.find((t) => t.address === a.token);
                      return (
                        <div className="row" key={a.id} onClick={() => openToken(a.token)}>
                          <div className={`k ${a.kind}`}>{a.kind}</div>
                          <div className="act-main">
                            {tok && <TokenAvatar token={tok} size={22} className="av sm" />}
                            <div>
                              <div>
                                <b>${a.symbol}</b>{" "}
                                <span className="dim mono">{shortAddr(a.token, 3)}</span>
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
                    {myActivity.length === 0 && <div className="empty">no activity for this wallet</div>}
                  </div>
                </div>
              )}

              {profilePane === "fees" && (
                <div className="grid2">
                  <div className="card">
                    <h2>claimable fees</h2>
                    <p className="sub">
                      80% of every 1% trade fee accrues to you as creator. Claim pulls unclaimed balance.
                    </p>
                    <div className="lines">
                      <div className="ln">
                        <span>lifetime earned</span>
                        <b className="up">{fmtUsd(feeStats.earned)}</b>
                      </div>
                      <div className="ln">
                        <span>already claimed</span>
                        <b>{fmtUsd(feeStats.claimed)}</b>
                      </div>
                      <div className="ln">
                        <span>available now</span>
                        <b className="up">{fmtUsd(feeStats.claimable)}</b>
                      </div>
                    </div>
                    <button
                      className="btn green lg block"
                      style={{ marginTop: 12 }}
                      disabled={feeStats.claimable <= 0 || claimBusy !== null}
                      onClick={() => claimFees()}
                    >
                      {claimBusy === "all"
                        ? "claiming…"
                        : feeStats.claimable > 0
                          ? `claim all ${fmtUsd(feeStats.claimable)} ${QUOTE_SYMBOL}`
                          : "no claimable fees"}
                    </button>
                    {msg && <div className="note">{msg}</div>}
                  </div>

                  <div className="card">
                    <h2>per token</h2>
                    <div className="fee-list">
                      {myLaunches.map((t) => {
                        const due = claimableFees(t);
                        return (
                          <div className="fee-row" key={t.address}>
                            <div className="tok" onClick={() => openToken(t.address)}>
                              <TokenAvatar token={t} size={28} />
                              <div>
                                <div className="n">${t.symbol}</div>
                                <div className="m">
                                  earned {fmtUsd(t.creatorFeesEarned)} · claimed{" "}
                                  {fmtUsd(t.creatorFeesClaimed || 0)}
                                </div>
                              </div>
                            </div>
                            <button
                              className="btn green"
                              disabled={due <= 0 || claimBusy !== null}
                              onClick={() => claimFees(t.address)}
                            >
                              {claimBusy === t.address ? "…" : due > 0 ? fmtUsd(due) : "—"}
                            </button>
                          </div>
                        );
                      })}
                      {myLaunches.length === 0 && <div className="empty">launch a token to earn fees</div>}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}

      <footer className="foot">
        <span>
          {APP_FULL_NAME} · {CHAIN_NAME} {CHAIN_ID}
        </span>
        <a href={TWITTER_URL} target="_blank" rel="noreferrer" className="foot-x">
          @{TWITTER_HANDLE}
        </a>
        <span>fee {bpsToPct(TRADE_FEE_BPS)} · Uni V3 · create $0</span>
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


export default function HomePage() {
  return (
    <Suspense fallback={<div className="app"><div className="empty">loading…</div></div>}>
      <HomePageInner />
    </Suspense>
  );
}
