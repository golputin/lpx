"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CA_PLACEHOLDER,
  CHAIN_ID,
  CHAIN_NAME,
  GAME_NAME,
  LB_KEY,
  MAX_POINTS_BET,
  POINTS_KEY,
  SITE_NAME,
  START_POINTS,
  short,
} from "@/lib/config";

type Phase = "idle" | "running" | "crashed" | "cashed";

type LbRow = {
  name: string;
  bestMult: number;
  points: number;
  wins: number;
  updatedAt: number;
};

function loadPoints() {
  if (typeof window === "undefined") return START_POINTS;
  const n = Number(localStorage.getItem(POINTS_KEY));
  return Number.isFinite(n) && n >= 0 ? n : START_POINTS;
}

function loadLb(): LbRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LB_KEY);
    return raw ? (JSON.parse(raw) as LbRow[]) : [];
  } catch {
    return [];
  }
}

function randName() {
  const a = ["Neon", "Dust", "Stable", "Pulse", "Zero", "Nova", "Grid", "Volt"];
  const b = ["Fox", "Ray", "Pilot", "Pilot", "Runner", "Mint", "Ghost", "Core"];
  return `${a[Math.floor(Math.random() * a.length)]}${b[Math.floor(Math.random() * b.length)]}${Math.floor(
    Math.random() * 90 + 10
  )}`;
}

/** Provably-fun local crash point generator (not for real money). */
function rollCrashPoint() {
  // House-edge style curve for paper points only
  const r = Math.random();
  // ~3% instant rug feel under 1.05x, long tail otherwise
  if (r < 0.03) return 1 + Math.random() * 0.05;
  const u = Math.max(0.0000001, Math.random());
  const raw = 0.97 / (1 - u);
  return Math.min(100, Math.max(1.01, raw));
}

export default function HomePage() {
  const [tab, setTab] = useState<"play" | "board" | "token">("play");
  const [name, setName] = useState("Pilot");
  const [points, setPoints] = useState(START_POINTS);
  const [bet, setBet] = useState(50);
  const [phase, setPhase] = useState<Phase>("idle");
  const [mult, setMult] = useState(1);
  const [crashAt, setCrashAt] = useState(0);
  const [msg, setMsg] = useState("Paper mode · no deposit · points only");
  const [msgKind, setMsgKind] = useState<"ok" | "err" | "muted">("muted");
  const [lb, setLb] = useState<LbRow[]>([]);
  const [lastWin, setLastWin] = useState<number | null>(null);

  const phaseRef = useRef<Phase>("idle");
  const multRef = useRef(1);
  const crashRef = useRef(2);
  const startRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointsRef = useRef<number[]>([]);

  useEffect(() => {
    setPoints(loadPoints());
    setLb(loadLb());
    const saved = localStorage.getItem("lpx_arcade_name");
    setName(saved || randName());
  }, []);

  useEffect(() => {
    localStorage.setItem(POINTS_KEY, String(points));
  }, [points]);

  useEffect(() => {
    localStorage.setItem("lpx_arcade_name", name);
  }, [name]);

  const sortedLb = useMemo(
    () => [...lb].sort((a, b) => b.bestMult - a.bestMult || b.points - a.points).slice(0, 15),
    [lb]
  );

  const stopLoop = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const draw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (c.width !== Math.floor(w * dpr) || c.height !== Math.floor(h * dpr)) {
      c.width = Math.floor(w * dpr);
      c.height = Math.floor(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // baseline
    ctx.strokeStyle = "rgba(148,163,184,0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(12, h - 18);
    ctx.lineTo(w - 12, h - 18);
    ctx.stroke();

    const pts = pointsRef.current;
    if (pts.length < 2) return;

    const maxT = Math.max(pts.length - 1, 1);
    const maxM = Math.max(...pts, 2);

    const path = new Path2D();
    pts.forEach((m, i) => {
      const x = 12 + (i / maxT) * (w - 24);
      const y = h - 18 - ((m - 1) / (maxM - 1 || 1)) * (h - 48);
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    });

    const crashed = phaseRef.current === "crashed";
    const cashed = phaseRef.current === "cashed";
    ctx.lineWidth = 3;
    ctx.strokeStyle = crashed ? "#fb7185" : cashed ? "#34d399" : "#22d3ee";
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 12;
    ctx.stroke(path);
    ctx.shadowBlur = 0;

    // tip dot
    const last = pts[pts.length - 1];
    const x = 12 + ((pts.length - 1) / maxT) * (w - 24);
    const y = h - 18 - ((last - 1) / (maxM - 1 || 1)) * (h - 48);
    ctx.fillStyle = crashed ? "#fb7185" : "#fbbf24";
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }, []);

  const tick = useCallback(() => {
    if (phaseRef.current !== "running") return;
    const t = (performance.now() - startRef.current) / 1000;
    // smooth growth curve
    const next = Math.pow(Math.E, 0.42 * t);
    multRef.current = next;
    setMult(next);
    pointsRef.current.push(next);
    if (pointsRef.current.length > 240) pointsRef.current.shift();
    draw();

    if (next >= crashRef.current) {
      phaseRef.current = "crashed";
      setPhase("crashed");
      setMsg(`Crashed at ${crashRef.current.toFixed(2)}x · bet lost`);
      setMsgKind("err");
      setLastWin(null);
      stopLoop();
      draw();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [draw]);

  function upsertLb(bestMult: number, won: boolean, newPoints: number) {
    setLb((prev) => {
      const copy = [...prev];
      const i = copy.findIndex((x) => x.name === name);
      if (i >= 0) {
        copy[i] = {
          ...copy[i],
          bestMult: Math.max(copy[i].bestMult, bestMult),
          points: newPoints,
          wins: copy[i].wins + (won ? 1 : 0),
          updatedAt: Date.now(),
        };
      } else {
        copy.push({
          name,
          bestMult,
          points: newPoints,
          wins: won ? 1 : 0,
          updatedAt: Date.now(),
        });
      }
      localStorage.setItem(LB_KEY, JSON.stringify(copy));
      return copy;
    });
  }

  function startRound() {
    if (phase === "running") return;
    const b = Math.floor(Number(bet) || 0);
    if (b < 1) {
      setMsg("Min bet 1 point");
      setMsgKind("err");
      return;
    }
    if (b > MAX_POINTS_BET) {
      setMsg(`Max bet ${MAX_POINTS_BET}`);
      setMsgKind("err");
      return;
    }
    if (b > points) {
      setMsg("Not enough points");
      setMsgKind("err");
      return;
    }

    const crash = rollCrashPoint();
    crashRef.current = crash;
    setCrashAt(crash);
    setPoints((p) => p - b);
    setBet(b);
    setLastWin(null);
    pointsRef.current = [1];
    multRef.current = 1;
    setMult(1);
    phaseRef.current = "running";
    setPhase("running");
    setMsg("Running… cash out before crash");
    setMsgKind("muted");
    startRef.current = performance.now();
    stopLoop();
    rafRef.current = requestAnimationFrame(tick);
  }

  function cashOut() {
    if (phaseRef.current !== "running") return;
    const m = multRef.current;
    const b = Math.floor(Number(bet) || 0);
    const payout = Math.floor(b * m);
    phaseRef.current = "cashed";
    setPhase("cashed");
    stopLoop();
    setPoints((p) => {
      const np = p + payout;
      upsertLb(m, true, np);
      return np;
    });
    setLastWin(payout);
    setMsg(`Cashed out at ${m.toFixed(2)}x · +${payout} pts`);
    setMsgKind("ok");
    draw();
  }

  function resetIdle() {
    stopLoop();
    phaseRef.current = "idle";
    setPhase("idle");
    setMult(1);
    pointsRef.current = [];
    draw();
    setMsg("Ready for next round");
    setMsgKind("muted");
  }

  function faucet() {
    if (points >= 50) {
      setMsg("Faucet only when under 50 pts");
      setMsgKind("err");
      return;
    }
    setPoints((p) => p + 500);
    setMsg("+500 points faucet");
    setMsgKind("ok");
  }

  useEffect(() => {
    draw();
    const onResize = () => draw();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      stopLoop();
    };
  }, [draw]);

  // if crashed with no cashout, still record attempt
  useEffect(() => {
    if (phase === "crashed") {
      upsertLb(0, false, points);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const phaseClass =
    phase === "crashed" ? "crashed" : phase === "cashed" ? "cashed" : phase === "running" ? "running" : "";

  return (
    <div className="shell">
      <nav className="nav">
        <div className="brand">
          <img src="/logo.svg" alt="LPX logo" />
          <div>
            <h1>{SITE_NAME}</h1>
            <p>Free play · Stable {CHAIN_ID} · no deposit</p>
          </div>
        </div>
        <div className="nav-links">
          <button className={`chip ${tab === "play" ? "active" : ""}`} onClick={() => setTab("play")}>
            Play
          </button>
          <button className={`chip ${tab === "board" ? "active" : ""}`} onClick={() => setTab("board")}>
            Leaderboard
          </button>
          <button className={`chip ${tab === "token" ? "active" : ""}`} onClick={() => setTab("token")}>
            Token
          </button>
          <button className="chip primary" onClick={() => setTab("play")}>
            {points.toLocaleString()} pts
          </button>
        </div>
      </nav>

      <div className="tabs-mobile">
        <button className={`chip ${tab === "play" ? "active" : ""}`} onClick={() => setTab("play")}>
          Play
        </button>
        <button className={`chip ${tab === "board" ? "active" : ""}`} onClick={() => setTab("board")}>
          Board
        </button>
        <button className={`chip ${tab === "token" ? "active" : ""}`} onClick={() => setTab("token")}>
          Token
        </button>
      </div>

      {tab === "play" && (
        <section className="hero">
          <div className="panel">
            <div className="kicker">
              <span className="dot" /> {GAME_NAME} · paper points
            </div>
            <h2>
              Crash before it dumps.
              <br />
              Cash out on time.
            </h2>
            <p className="lead">
              Free degen arcade for Stable Network. No wallet deposit, no prize pool, no mystery box.
              Just points, nerves, and a public leaderboard. Token page ready for when you launch{" "}
              <b>$LPX</b>.
            </p>
            <div className="stats">
              <div className="stat">
                <div className="l">Your points</div>
                <div className="v">{points.toLocaleString()}</div>
              </div>
              <div className="stat">
                <div className="l">Last win</div>
                <div className="v">{lastWin != null ? `+${lastWin}` : "—"}</div>
              </div>
              <div className="stat">
                <div className="l">Network</div>
                <div className="v">{CHAIN_NAME}</div>
              </div>
            </div>
            <div className="note">
              This is <b>not</b> real-money gambling. Points live in your browser only. Fefer-style
              retention: play free, flex score, launch token later.
            </div>
          </div>

          <div className="panel game-wrap">
            <div className="canvas-box">
              <canvas ref={canvasRef} />
              <div className={`mult-overlay ${phaseClass}`}>
                <div>
                  <div className="x">{mult.toFixed(2)}x</div>
                  <div className="sub">
                    {phase === "idle" && "Press GO to start"}
                    {phase === "running" && "Cash out anytime"}
                    {phase === "crashed" && `Boom @ ${crashAt.toFixed(2)}x`}
                    {phase === "cashed" && "Nice exit"}
                  </div>
                </div>
              </div>
            </div>

            <div className="controls">
              <div className="field">
                <label>Pilot name</label>
                <input value={name} maxLength={18} onChange={(e) => setName(e.target.value || "Pilot")} />
              </div>
              <div className="field">
                <label>Bet (points)</label>
                <input
                  type="number"
                  min={1}
                  max={MAX_POINTS_BET}
                  value={bet}
                  disabled={phase === "running"}
                  onChange={(e) => setBet(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="btn-row">
              {phase !== "running" ? (
                <button className="btn go" onClick={startRound}>
                  GO
                </button>
              ) : (
                <button className="btn cash" onClick={cashOut}>
                  CASH OUT
                </button>
              )}
              {(phase === "crashed" || phase === "cashed") && (
                <button className="btn" onClick={resetIdle}>
                  Next round
                </button>
              )}
              <button className="btn" onClick={faucet} disabled={phase === "running"}>
                Faucet
              </button>
            </div>
            <div className={`msg ${msgKind}`}>{msg}</div>
          </div>
        </section>
      )}

      {tab === "board" && (
        <section className="grid2">
          <div className="panel">
            <div className="kicker">Leaderboard</div>
            <h3 style={{ marginTop: 0 }}>Best cash-out multiplier</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              Stored locally in this browser (demo). Later can move on-chain / server.
            </p>
            <div className="list" style={{ marginTop: 12 }}>
              {sortedLb.length === 0 && <div className="muted">No scores yet — go play.</div>}
              {sortedLb.map((r, i) => (
                <div className="row" key={`${r.name}-${r.updatedAt}`}>
                  <div className="rank">{i + 1}</div>
                  <div>
                    <div style={{ fontWeight: 700 }}>{r.name}</div>
                    <div className="muted" style={{ fontSize: "0.75rem" }}>
                      {r.wins} wins · {r.points.toLocaleString()} pts
                    </div>
                  </div>
                  <div className="gold" style={{ fontWeight: 800 }}>
                    {r.bestMult > 0 ? `${r.bestMult.toFixed(2)}x` : "—"}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="panel">
            <div className="kicker">How to climb</div>
            <ol className="muted" style={{ lineHeight: 1.7, paddingLeft: 18 }}>
              <li>Start with small bets, learn the curve.</li>
              <li>Cash out early more often than you greed.</li>
              <li>Best multiplier is ranked first.</li>
              <li>Faucet only works under 50 pts.</li>
              <li>When $LPX launches, winners become lore.</li>
            </ol>
            <button className="btn go" style={{ marginTop: 12, width: "100%" }} onClick={() => setTab("play")}>
              Back to game
            </button>
          </div>
        </section>
      )}

      {tab === "token" && (
        <section className="grid2">
          <div className="panel token-card">
            <div className="kicker">$LPX</div>
            <h3>Meme terminal for Stable</h3>
            <p>
              LPX is the brand token for this arcade. Site first, culture second, contract when
              you&apos;re ready. No fake CA.
            </p>
            <div className="kv">
              <div>
                <span>Network</span>
                <span className="mono">
                  {CHAIN_NAME} · {CHAIN_ID}
                </span>
              </div>
              <div>
                <span>Contract</span>
                <span className="mono">{short(CA_PLACEHOLDER, 6)}</span>
              </div>
              <div>
                <span>Status</span>
                <span className="gold">TBA</span>
              </div>
              <div>
                <span>Utility (planned)</span>
                <span>skin / badge / season pass</span>
              </div>
            </div>
            <div className="btn-row">
              <button
                className="btn"
                onClick={() => {
                  navigator.clipboard?.writeText(CA_PLACEHOLDER);
                  setMsg("Placeholder CA copied");
                  setMsgKind("muted");
                }}
              >
                Copy CA
              </button>
              <a className="btn go" href="https://dexscreener.com/stable" target="_blank" rel="noreferrer">
                Stable charts
              </a>
            </div>
            <div className="note">
              Replace <code>CA_PLACEHOLDER</code> in <code>lib/config.ts</code> after deploy. Until
              then this page is a clean launch pad — no scam CA spam.
            </div>
          </div>
          <div className="panel">
            <div className="kicker">Why this model</div>
            <p className="muted">
              Like Fefer Arcade: <b>zero prize treasury</b>, free play, score flex, token as culture.
              Unlike Fefer: not a Win98 dino clone — neon crash terminal, one flagship game, ship
              fast.
            </p>
            <div className="kv" style={{ marginTop: 14 }}>
              <div>
                <span>Modal needed</span>
                <span className="good">$0 pool</span>
              </div>
              <div>
                <span>Wallet required</span>
                <span>No (play free)</span>
              </div>
              <div>
                <span>Host</span>
                <span>Vercel free tier</span>
              </div>
            </div>
          </div>
        </section>
      )}

      <footer className="footer">
        <span>{SITE_NAME} · entertainment only · not financial advice</span>
        <span>Stable chain {CHAIN_ID}</span>
      </footer>
    </div>
  );
}
