import React, { useEffect, useRef } from "react";
import { User, Gamepad2, ChevronRight } from "lucide-react";
import { useAuth } from "../auth/AuthContext";

/**
 * Home — Akadoodle (final)
 * - Place your custom logo image at: /public/assets/logo.png (or /public/assets/logo.svg)
 *   I recommend: client/public/assets/logo.png
 * - This component adds:
 *   1) hover magnet pull effect on cards (class cursor-magnet-zone)
 *   2) neon card shine + slow floating
 *   3) shooting stars in canvas (periodic)
 *   4) enhanced logo glow animation
 *   5) page-entry zoom + fade animation for logo & cards
 */

function LogoConfetti() {
  const pieces = [
    { t: 6, l: 4, rot: -12, c: "#fde047", del: "0s" },
    { t: 2, l: 48, rot: 22, c: "#f472b6", del: "0.2s" },
    { t: 78, l: 8, rot: 8, c: "#22d3ee", del: "0.4s" },
    { t: 70, l: 92, rot: -18, c: "#fde047", del: "0.1s" },
    { t: 40, l: -2, rot: 35, c: "#a78bfa", del: "0.55s" },
    { t: 12, l: 88, rot: -25, c: "#22d3ee", del: "0.3s" },
    { t: 88, l: 72, rot: 14, c: "#f472b6", del: "0.65s" },
    { t: 52, l: 96, rot: -8, c: "#4ade80", del: "0.5s" },
    { t: 24, l: 22, rot: 40, c: "#fde047", del: "0.75s" },
    { t: 62, l: 40, rot: -32, c: "#22d3ee", del: "0.15s" },
  ];
  return (
    <div className="ak-live-confetti" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={`cf-${i}`}
          className="ak-confetti-wrap"
          style={{
            top: `${p.t}%`,
            left: `${p.l}%`,
            transform: `rotate(${p.rot}deg)`,
          }}
        >
          <span className="ak-confetti-piece" style={{ background: p.c, animationDelay: p.del }} />
        </span>
      ))}
    </div>
  );
}

/** Stylized pad + cord (closer to brand art than emoji). */
function BrandGamepadIcon() {
  return (
    <svg className="ak-live-gamepad-svg" viewBox="0 0 52 44" aria-hidden>
      <path
        className="ak-pad-cord"
        d="M44 2 Q52 6 46 14 Q40 22 38 28"
        fill="none"
        stroke="rgba(248,250,252,0.85)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <g className="ak-pad-body" transform="translate(4,14)">
        <rect x="0" y="4" width="40" height="24" rx="10" fill="#f8fafc" stroke="rgba(15,23,42,0.12)" strokeWidth="1" />
        <rect x="6" y="12" width="11" height="8" rx="2" fill="#cbd5e1" />
        <line x1="8.5" y1="14" x2="8.5" y2="18" stroke="#64748b" strokeWidth="1.2" />
        <line x1="11.5" y1="16" x2="15.5" y2="16" stroke="#64748b" strokeWidth="1.2" />
        <circle cx="30" cy="14" r="2.2" fill="#facc15" />
        <circle cx="34" cy="18" r="2.2" fill="#22d3ee" />
        <circle cx="26" cy="18" r="2.2" fill="#f87171" />
        <circle cx="30" cy="22" r="2.2" fill="#4ade80" />
        <circle cx="20" cy="22" r="2.5" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="0.6" />
        <path d="M18.5 20.5 Q20 22 21.5 20.5" fill="none" stroke="#64748b" strokeWidth="0.9" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function AnimatedBrandLogo() {
  return (
    <div className="ak-live-logo" aria-label="AK doodle">
      <LogoConfetti />
      <div className="ak-live-mark animate-logo-pop">
        <span className="ak-live-ak" aria-hidden>
          <span className="ak-live-ak-a">A</span>
          <span className="ak-live-ak-k">K</span>
        </span>
        <span className="ak-live-doodle" aria-hidden>
          <span className="ak-live-d-stem">d</span>
          <span className="ak-live-eye-o ak-live-eye-o-first">
            <span className="ak-live-eye-dot" />
          </span>
          <span className="ak-live-eye-o ak-live-eye-o-second ak-live-eye-squint">
            <span className="ak-live-eye-wink-line" />
          </span>
          <span className="ak-live-d-stem">d</span>
          le
        </span>
        <span className="ak-live-gamepad" aria-hidden>
          <BrandGamepadIcon />
        </span>
      </div>
    </div>
  );
}

/** Hero strip inside each game card: lively background + clear title (Home only). */
function GameCardHero({ gameId, title }) {
  const safe = String(title || "Game");

  if (gameId === "rummy") {
    const suits = [
      { ch: "♠", c: "ak-suit-dark", l: 6, t: 10, delay: "0s", dur: "7s" },
      { ch: "♥", c: "ak-suit-red", l: 78, t: 8, delay: "0.4s", dur: "8.5s" },
      { ch: "♦", c: "ak-suit-red", l: 22, t: 62, delay: "1.1s", dur: "6.5s" },
      { ch: "♣", c: "ak-suit-dark", l: 88, t: 55, delay: "0.2s", dur: "9s" },
      { ch: "♠", c: "ak-suit-dark", l: 44, t: 22, delay: "0.8s", dur: "7.5s" },
      { ch: "♥", c: "ak-suit-red", l: 12, t: 48, delay: "1.4s", dur: "8s" },
      { ch: "♦", c: "ak-suit-red", l: 62, t: 38, delay: "0.6s", dur: "6.8s" },
      { ch: "♣", c: "ak-suit-dark", l: 34, t: 72, delay: "1.9s", dur: "7.2s" },
    ];
    const dust = [12, 28, 55, 70, 85, 40, 92, 18];
    return (
      <div className="ak-card-hero ak-card-hero--rummy">
        <div className="ak-card-hero-bg" aria-hidden>
          {dust.map((x, i) => (
            <span
              key={`dust-${i}`}
              className="ak-card-particle"
              style={{ left: `${x}%`, top: `${15 + (i % 4) * 22}%`, animationDelay: `${i * 0.35}s` }}
            />
          ))}
          {suits.map((s, i) => (
            <span
              key={`suit-${i}`}
              className={`ak-card-suit ${s.c}`}
              style={{ left: `${s.l}%`, top: `${s.t}%`, animationDelay: s.delay, animationDuration: s.dur }}
            >
              {s.ch}
            </span>
          ))}
        </div>
        <div className="ak-card-hero-title ak-card-hero-title--rummy">{safe}</div>
      </div>
    );
  }

  if (gameId === "uno") {
    const orbs = [
      { bg: "linear-gradient(135deg,#ef4444,#b91c1c)", l: 10, t: 18, d: "0s" },
      { bg: "linear-gradient(135deg,#eab308,#ca8a04)", l: 72, t: 12, d: "0.3s" },
      { bg: "linear-gradient(135deg,#22c55e,#15803d)", l: 18, t: 58, d: "0.6s" },
      { bg: "linear-gradient(135deg,#3b82f6,#1d4ed8)", l: 80, t: 52, d: "0.9s" },
      { bg: "linear-gradient(135deg,#a855f7,#6d28d9)", l: 48, t: 8, d: "0.15s" },
      { bg: "linear-gradient(135deg,#f97316,#c2410c)", l: 52, t: 68, d: "1.1s" },
    ];
    return (
      <div className="ak-card-hero ak-card-hero--uno">
        <div className="ak-card-hero-bg" aria-hidden>
          {orbs.map((o, i) => (
            <span
              key={`orb-${i}`}
              className="ak-card-uno-orb"
              style={{ left: `${o.l}%`, top: `${o.t}%`, background: o.bg, animationDelay: o.d }}
            />
          ))}
          <span className="ak-card-uno-wild" style={{ animationDelay: "0.5s" }} />
        </div>
        <div className="ak-card-hero-title ak-card-hero-title--uno">{safe}</div>
      </div>
    );
  }

  if (gameId === "teenpatti") {
    return (
      <div className="ak-card-hero ak-card-hero--teenpatti">
        <div className="ak-card-hero-bg" aria-hidden>
          <span className="ak-card-tp-glow" />
          {[0, 1, 2].map((i) => (
            <span key={`tp-card-${i}`} className={`ak-card-tp-fan ak-card-tp-fan--${i}`} />
          ))}
          {[20, 45, 75, 33, 88].map((x, i) => (
            <span key={`tp-spark-${i}`} className="ak-card-spark" style={{ left: `${x}%`, animationDelay: `${i * 0.4}s` }} />
          ))}
        </div>
        <div className="ak-card-hero-title ak-card-hero-title--teenpatti">{safe}</div>
      </div>
    );
  }

  return (
    <div className="ak-card-hero ak-card-hero--rummy">
      <div className="ak-card-hero-title ak-card-hero-title--rummy">{safe}</div>
    </div>
  );
}

export default function Home() {
  const { user, login } = useAuth();
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Cursor spark effect
    import("../utils/cursor-spark")
      .then((mod) => {
        if (mod.initCursorSpark) mod.initCursorSpark();
        else if (mod.default) mod.default();
      })
      .catch(() => { });

    const canvas = canvasRef.current;
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);

    // stars
    const stars = Array.from({ length: 160 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.2 + 0.2,
      dx: (Math.random() - 0.5) * 0.3,
      dy: (Math.random() - 0.5) * 0.3,
      alpha: 0.25 + Math.random() * 0.75,
    }));

    // shooting star state
    let lastShooting = performance.now();
    function spawnShooting() {
      return {
        x: Math.random() * w,
        y: Math.random() * h * 0.5,
        vx: -6 - Math.random() * 6,
        vy: 2 + Math.random() * 3,
        life: 0,
        maxLife: 60 + Math.floor(Math.random() * 50),
      };
    }
    const shooting = [];

    function draw() {
      ctx.clearRect(0, 0, w, h);

      // gradient background
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#021226");
      g.addColorStop(0.4, "#05203a");
      g.addColorStop(1, "#08182a");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // nebula blobs
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = "#2b6cff";
      ctx.beginPath();
      ctx.ellipse(w * 0.15, h * 0.25, w * 0.35, h * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#a23bff";
      ctx.beginPath();
      ctx.ellipse(w * 0.78, h * 0.7, w * 0.32, h * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // stars
      for (const s of stars) {
        ctx.beginPath();
        ctx.fillStyle = `rgba(255,255,255,${s.alpha})`;
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();

        s.x += s.dx; s.y += s.dy;
        if (s.x < -10) s.x = w + 10; if (s.x > w + 10) s.x = -10;
        if (s.y < -10) s.y = h + 10; if (s.y > h + 10) s.y = -10;
      }

      // shooting stars (spawn occasionally)
      const now = performance.now();
      if (now - lastShooting > 8000 + Math.random() * 8000) {
        shooting.push(spawnShooting());
        lastShooting = now;
      }

      for (let i = shooting.length - 1; i >= 0; i--) {
        const s = shooting[i];
        // trail
        ctx.beginPath();
        const trailLen = 30;
        for (let t = 0; t < trailLen; t++) {
          const tx = s.x - s.vx * (t / 2);
          const ty = s.y - s.vy * (t / 2);
          const a = 1 - t / trailLen;
          ctx.fillStyle = `rgba(255,255,255,${a * 0.9})`;
          ctx.fillRect(tx, ty, 2, 1);
        }

        // head
        ctx.fillStyle = "rgba(255,255,255,1)";
        ctx.fillRect(s.x, s.y, 3, 1);

        s.x += s.vx / 2; s.y += s.vy / 2; s.life++;
        if (s.life > s.maxLife) shooting.splice(i, 1);
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    draw();

    const resize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; };
    window.addEventListener("resize", resize);

    return () => { window.removeEventListener("resize", resize); if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  // SPA navigation helper
  function goTo(to) {
    try {
      if (typeof window !== "undefined" && typeof window.__AKADOODLE_NAVIGATE === "function") { window.__AKADOODLE_NAVIGATE(to); return; }
    } catch (e) { }
    if (typeof window !== "undefined") window.location.href = to;
  }

  // magnet + hover effects
  useEffect(() => {
    if (typeof window === "undefined") return;

    let mouse = { x: 0, y: 0 };
    const zone = document.querySelector(".cursor-magnet-zone");
    if (!zone) return;

    function onMove(e) {
      mouse.x = e.clientX; mouse.y = e.clientY;

      const cards = Array.from(zone.querySelectorAll(".group-card"));
      for (const el of cards) {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = mouse.x - cx;
        const dy = mouse.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // magnet: if cursor within 220px, pull gently
        const max = 220;
        if (dist < max) {
          const strength = (1 - dist / max) * 18; // px
          const tx = (dx / dist) * strength;
          const ty = (dy / dist) * strength;
          el.style.transform = `translate(${tx}px, ${ty}px) scale(1.03)`;
          el.style.boxShadow = `0 10px 30px rgba(67, 255, 155, ${0.06 + (1 - dist / max) * 0.2})`;
        } else {
          // slowly reset
          el.style.transform = "translate(0,0) scale(1)";
          el.style.boxShadow = "none";
        }
      }
    }

    function onLeave() {
      const cards = Array.from(zone.querySelectorAll(".group-card"));
      for (const el of cards) { el.style.transform = "translate(0,0) scale(1)"; el.style.boxShadow = "none"; }
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", onLeave);

    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseleave", onLeave); };
  }, []);

  // games meta
  const games = [
    { id: "rummy", name: "Rummy", description: "Classic 13‑card strategy game", image: "/assets/games/rummy_glow.png", to: "/rummy/home" },
    { id: "uno", name: "UNO", description: "Fast-paced card chaos!", image: "/assets/games/uno_glow.png", to: "/uno/home" },
    { id: "teenpatti", name: "Teen Patti", description: "3‑card poker action", image: "/assets/games/teenpatti_glow.png", to: "/teenpatti/home" },
  ];

  return (
    <div className="relative min-h-screen text-white select-none overflow-hidden">
      <canvas ref={canvasRef} id="ak-galaxy-bg" className="fixed inset-0 -z-10" />
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-[min(42vh,420px)] -z-[5] opacity-90"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 85% 70% at 50% -10%, rgba(56,189,248,0.14), transparent 55%), radial-gradient(ellipse 60% 50% at 80% 20%, rgba(168,85,247,0.08), transparent 50%)",
        }}
      />

      {/* Inline styles for animations & card effects (keeps one-file) */}
      <style>{`
        @keyframes logo-pop { 0% { transform: scale(.7) translateY(-8px); opacity:0 } 60% { transform: scale(1.06); opacity:1 } 100% { transform: scale(1) } }
        @keyframes eye-move { 0%{transform:translateX(0)}50%{transform:translateX(2px)}100%{transform:translateX(0)} }
        @keyframes blink { 0%,90%{transform:scaleY(1)}95%{transform:scaleY(0.1)}100%{transform:scaleY(1)} }
        @keyframes smile { from{opacity:0; transform: translateY(-6px)} to{opacity:1; transform:none} }
        .animate-logo-pop { animation: logo-pop 700ms cubic-bezier(.2,.9,.3,1) both }
        .animate-eye-move { animation: eye-move 2100ms infinite ease-in-out }
        .animate-blink { animation: blink 3500ms infinite linear }
        .animate-smile { animation: smile 500ms ease both }

        /* entry for cards */
        .entry-card { transform: translateY(18px) scale(.98); opacity:0; transition: all 600ms cubic-bezier(.2,.9,.3,1); }
        .entry-card.show { transform: translateY(0) scale(1); opacity:1; }

        /* floating + neon shine */
        .group-card { transition: transform 240ms ease, box-shadow 240ms ease; will-change: transform; }
        .group-card .card-img { transform-origin: center; transition: transform 800ms ease; }
        .group-card:hover .card-img { transform: translateY(-6px) scale(1.06); filter: drop-shadow(0 8px 28px rgba(65,255,139,0.12)); }
        .group-card::before { content:""; position:absolute; inset:0; background: linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01)); border-radius:16px; pointer-events:none; }

        /* neon border pulse */
        .group-card:hover { box-shadow: 0 8px 30px rgba(65,255,139,0.06); }

        /* live logo — AK + doodle as one attached mark (+ confetti like brand art) */
        .ak-live-logo { position: relative; display: inline-block; }
        .ak-live-confetti {
          pointer-events: none;
          position: absolute;
          inset: -10px -18px -12px -18px;
          z-index: 0;
        }
        .ak-confetti-wrap {
          position: absolute;
          width: 4px;
          height: 11px;
          transform-origin: center center;
        }
        .ak-confetti-piece {
          display: block;
          width: 3px;
          height: 9px;
          margin: 0 auto;
          border-radius: 1px;
          opacity: 0.88;
          animation: ak-confetti-drift 3.8s ease-in-out infinite;
          box-shadow: 0 0 6px rgba(255,255,255,0.25);
        }
        @keyframes ak-confetti-drift {
          0%, 100% { transform: translateY(0); opacity: 0.72; }
          50% { transform: translateY(-5px); opacity: 1; }
        }
        .ak-live-mark {
          position: relative;
          z-index: 1;
          display: inline-flex;
          align-items: flex-end;
          gap: 3px;
          padding: 4px 18px 9px 14px;
          border-radius: 18px;
          background: linear-gradient(155deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.04) 40%, rgba(15,23,42,0.45) 100%);
          border: 1px solid rgba(255,255,255,0.14);
          box-shadow:
            0 0 0 1px rgba(0,0,0,0.25) inset,
            0 18px 50px rgba(0,0,0,0.4),
            0 0 40px rgba(34,211,238,0.1);
          backdrop-filter: blur(12px);
        }
        .ak-live-ak {
          display: inline-flex;
          align-items: flex-end;
          gap: 0.02em;
          line-height: 1;
          letter-spacing: 0.02em;
          filter: drop-shadow(0 0 10px rgba(57,240,255,.22));
          animation: hue-shift 8s linear infinite;
        }
        .ak-live-ak-a, .ak-live-ak-k {
          font-family: "Nunito", "Baloo 2", "Arial Rounded MT Bold", "Segoe UI", sans-serif;
          font-size: 2.55rem;
          font-weight: 900;
          line-height: 1;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }
        .ak-live-ak-a {
          background: linear-gradient(165deg, #fbcfe8 0%, #e879f9 38%, #22d3ee 88%);
        }
        .ak-live-ak-k {
          background: linear-gradient(165deg, #fde047 0%, #86efac 42%, #2dd4bf 90%);
        }
        .ak-live-doodle {
          --eye-nudge: -0.08em;
          position: relative;
          display: inline-flex;
          align-items: flex-end;
          gap: 0.5px;
          font-family: "Nunito", "Baloo 2", "Arial Rounded MT Bold", "Segoe UI", sans-serif;
          font-size: 2.55rem;
          font-weight: 900;
          line-height: 1.05;
          color: #f8fafc;
          letter-spacing: 0.01em;
          text-shadow: 0 0 8px rgba(255,255,255,.14);
          animation: float-soft 3.6s ease-in-out infinite;
        }
        /* small square above each “d” stem (brand doodle) */
        .ak-live-d-stem {
          position: relative;
          display: inline-block;
        }
        .ak-live-d-stem::before {
          content: "";
          position: absolute;
          left: 0.08em;
          top: -0.12em;
          width: 0.11em;
          height: 0.11em;
          background: rgba(248, 250, 252, 0.95);
          border-radius: 1px;
          box-shadow: 0 0 6px rgba(255,255,255,0.25);
        }
        .ak-live-eye-o {
          width: 0.56em;
          height: 0.56em;
          border-radius: 999px;
          border: 2px solid rgba(248, 250, 252, 0.98);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin: 0 0.5px;
          /* Nudge up so rings optically line up with “d” bowls (flex-end sits them a hair low) */
          transform: translateY(var(--eye-nudge));
          transform-origin: center center;
        }
        .ak-live-eye-o-first {
          animation: eye-wink-left 3.6s ease-in-out infinite;
        }
        .ak-live-eye-squint {
          align-items: flex-end;
          justify-content: center;
          animation: eye-squint-breathe 5.5s ease-in-out infinite;
          animation-delay: 200ms;
        }
        .ak-live-eye-dot {
          width: 0.17em;
          height: 0.17em;
          border-radius: 999px;
          background: #f8fafc;
          animation: eye-look 2.8s ease-in-out infinite;
        }
        .ak-live-eye-wink-line {
          display: block;
          width: 62%;
          height: 0.2em;
          min-height: 3px;
          border-radius: 999px;
          background: #0f172a;
          margin-bottom: 0.14em;
          transform: rotate(-5deg);
          box-shadow: 0 1px 0 rgba(255,255,255,0.25);
        }
        .ak-live-gamepad {
          position: absolute;
          right: -0.55rem;
          top: -0.62rem;
          width: 2.05rem;
          height: 1.72rem;
          filter: drop-shadow(0 2px 10px rgba(0,0,0,0.45)) drop-shadow(0 0 8px rgba(255,255,255,.18));
          animation: bob 2s ease-in-out infinite;
        }
        .ak-live-gamepad-svg {
          width: 100%;
          height: 100%;
          display: block;
          transform: rotate(-8deg);
        }
        /* first “d” optically aligned with eye row */
        .ak-live-doodle > .ak-live-d-stem:first-of-type {
          transform: translateY(0.04em);
          display: inline-block;
        }

        /* —— game card heroes (lively backgrounds) —— */
        .ak-card-hero {
          position: relative;
          width: 100%;
          min-height: 8.25rem;
          padding: 0.45rem 0.75rem 0.55rem;
          border-radius: 0.6rem;
          overflow: visible;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(ellipse 90% 80% at 50% 100%, rgba(15,23,42,0.85), rgba(30,41,59,0.4));
        }
        .ak-card-hero-bg {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
          border-radius: inherit;
        }
        .ak-card-hero-title {
          position: relative;
          z-index: 2;
          display: inline-block;
          max-width: 100%;
          font-family: "Nunito", "Baloo 2", "Segoe UI", sans-serif;
          font-size: 1.85rem;
          font-weight: 900;
          letter-spacing: 0.04em;
          line-height: 1.22;
          text-align: center;
          padding: 0.12em 1.15rem 0.22em 1rem;
          box-sizing: border-box;
          text-shadow: 0 2px 24px rgba(0,0,0,0.55), 0 0 40px rgba(255,255,255,0.12);
        }
        .ak-card-hero-title--rummy {
          color: #f8fafc;
          background: linear-gradient(185deg, #fff 0%, #bae6fd 45%, #7dd3fc 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          /* filter + clip:text can clip descenders (e.g. “y” in Rummy); use shadow glow instead */
          text-shadow:
            0 2px 20px rgba(0,0,0,0.65),
            0 0 28px rgba(56,189,248,0.45),
            0 0 2px rgba(125,211,252,0.35);
        }
        .ak-card-hero-title--uno {
          color: #fef08a;
          background: linear-gradient(180deg, #fef9c3 0%, #fde047 40%, #facc15 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          text-shadow:
            0 2px 20px rgba(0,0,0,0.6),
            0 0 26px rgba(250,204,21,0.5);
        }
        .ak-card-hero-title--teenpatti {
          color: #ffedd5;
          background: linear-gradient(180deg, #fff7ed 0%, #fdba74 35%, #ea580c 95%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          text-shadow:
            0 2px 20px rgba(0,0,0,0.6),
            0 0 28px rgba(251,146,60,0.45);
        }
        .ak-card-hero--rummy .ak-card-hero-bg {
          background: radial-gradient(circle at 30% 20%, rgba(34,197,94,0.12), transparent 45%),
            radial-gradient(circle at 80% 70%, rgba(59,130,246,0.14), transparent 50%);
        }
        .ak-card-particle {
          position: absolute;
          width: 3px;
          height: 3px;
          border-radius: 999px;
          background: rgba(255,255,255,0.5);
          box-shadow: 0 0 8px rgba(255,255,255,0.4);
          animation: ak-particle-rise 4.5s ease-in-out infinite;
        }
        .ak-card-suit {
          position: absolute;
          font-family: Georgia, "Times New Roman", serif;
          font-size: clamp(1.15rem, 3.8vw, 1.55rem);
          font-weight: 700;
          line-height: 1;
          opacity: 0.32;
          animation: ak-suit-float 7s ease-in-out infinite;
          text-shadow: 0 0 12px rgba(0,0,0,0.5);
        }
        .ak-suit-red { color: #f87171; }
        .ak-suit-dark { color: #cbd5e1; }
        @keyframes ak-suit-float {
          0%, 100% { transform: translate3d(0,0,0) rotate(-8deg) scale(1); opacity: 0.26; }
          50% { transform: translate3d(6px,-10px,0) rotate(10deg) scale(1.06); opacity: 0.48; }
        }
        @keyframes ak-particle-rise {
          0%, 100% { transform: translateY(0) scale(1); opacity: 0.12; }
          50% { transform: translateY(-14px) scale(1.2); opacity: 0.42; }
        }

        .ak-card-hero--uno .ak-card-hero-bg {
          background: radial-gradient(circle at 20% 50%, rgba(239,68,68,0.15), transparent 40%),
            radial-gradient(circle at 85% 30%, rgba(59,130,246,0.15), transparent 42%);
        }
        .ak-card-uno-orb {
          position: absolute;
          width: clamp(26px, 9vw, 34px);
          height: clamp(26px, 9vw, 34px);
          border-radius: 999px;
          opacity: 0.55;
          animation: ak-uno-drift 5s ease-in-out infinite;
          box-shadow: 0 4px 16px rgba(0,0,0,0.35);
        }
        .ak-card-uno-wild {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 42px;
          height: 42px;
          margin: -21px 0 0 -21px;
          border-radius: 10px;
          opacity: 0.22;
          transform: rotate(12deg);
          background: conic-gradient(from 90deg, #ef4444, #eab308, #22c55e, #3b82f6, #a855f7, #ef4444);
          animation: ak-wild-spin 14s linear infinite;
          filter: blur(0.3px);
        }
        @keyframes ak-uno-drift {
          0%, 100% { transform: translate(0,0) scale(1); }
          50% { transform: translate(-8px, 12px) scale(1.12); }
        }
        @keyframes ak-wild-spin {
          to { transform: rotate(372deg); }
        }

        .ak-card-hero--teenpatti .ak-card-hero-bg {
          background: radial-gradient(circle at 50% 0%, rgba(251,191,36,0.2), transparent 55%),
            radial-gradient(circle at 10% 80%, rgba(234,88,12,0.12), transparent 45%);
        }
        .ak-card-tp-glow {
          position: absolute;
          inset: 20% 15%;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(251,191,36,0.25), transparent 70%);
          animation: ak-tp-pulse 3s ease-in-out infinite;
        }
        .ak-card-tp-fan {
          position: absolute;
          width: 22px;
          height: 34px;
          border-radius: 4px;
          border: 1px solid rgba(255,255,255,0.35);
          background: linear-gradient(165deg, rgba(255,250,240,0.95), rgba(254,243,199,0.5));
          box-shadow: 0 4px 12px rgba(0,0,0,0.35);
          left: 50%;
          top: 50%;
          margin-top: -10px;
          opacity: 0.35;
          animation: ak-tp-fan-glow 3.2s ease-in-out infinite;
        }
        .ak-card-tp-fan--0 { transform: translate(-38px, 4px) rotate(-14deg); animation-delay: 0s; }
        .ak-card-tp-fan--1 { transform: translate(-11px, -2px) rotate(-2deg); animation-delay: 0.15s; }
        .ak-card-tp-fan--2 { transform: translate(16px, 4px) rotate(12deg); animation-delay: 0.3s; }
        .ak-card-spark {
          position: absolute;
          bottom: 18%;
          width: 4px;
          height: 4px;
          border-radius: 999px;
          background: #fde68a;
          box-shadow: 0 0 10px #fbbf24;
          animation: ak-spark 2.8s ease-in-out infinite;
          opacity: 0;
        }
        @keyframes ak-tp-pulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 0.85; transform: scale(1.05); }
        }
        @keyframes ak-tp-fan-glow {
          0%, 100% { opacity: 0.3; filter: brightness(1); }
          50% { opacity: 0.52; filter: brightness(1.15); }
        }
        @keyframes ak-spark {
          0%, 100% { opacity: 0; transform: translateY(0); }
          30% { opacity: 0.9; }
          60% { opacity: 0; transform: translateY(-28px); }
        }

        @keyframes hue-shift { from { filter: hue-rotate(0deg) drop-shadow(0 0 12px rgba(57,240,255,.25)); } to { filter: hue-rotate(360deg) drop-shadow(0 0 12px rgba(57,240,255,.25)); } }
        @keyframes float-soft { 0%,100%{ transform: translateY(0)} 50%{ transform: translateY(-2px)} }
        @keyframes bob { 0%,100%{ transform: translateY(0)} 50%{ transform: translateY(-3px)} }
        @keyframes eye-look {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-1px); }
          50% { transform: translateX(1px); }
          75% { transform: translateX(0); }
        }
        @keyframes eye-wink-left {
          0%, 38%, 44%, 72%, 100% { transform: translateY(var(--eye-nudge)) scaleY(1); }
          41% { transform: translateY(var(--eye-nudge)) scaleY(0.08); }
        }
        @keyframes eye-squint-breathe {
          0%, 100% { transform: translateY(var(--eye-nudge)) scale(1); }
          48% { transform: translateY(var(--eye-nudge)) scale(1, 0.92); }
          52% { transform: translateY(var(--eye-nudge)) scale(1); }
        }
        /* responsive tweaks */
        @media (max-width:768px){ .group-card { margin: 6px 0 } }
        @media (max-width:640px){
          .ak-live-ak-a, .ak-live-ak-k, .ak-live-doodle { font-size: 2.08rem; }
          .ak-live-doodle { --eye-nudge: -0.06em; }
          .ak-card-hero { min-height: 7.35rem; padding: 0.35rem 0.5rem 0.5rem; }
          .ak-card-hero-title { font-size: 1.55rem; padding: 0.1em 0.85rem 0.2em 0.75rem; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ak-card-suit, .ak-card-uno-orb, .ak-card-particle, .ak-card-uno-wild, .ak-card-spark, .ak-card-tp-glow, .ak-card-tp-fan,
          .ak-confetti-piece {
            animation: none !important;
          }
        }
      `}</style>

      {/* HEADER */}
      <div className="flex items-center justify-between px-6 pt-6 mb-10 relative z-10">
        <div className="flex items-center gap-3 text-4xl sm:text-5xl font-black select-none relative drop-shadow-[0_4px_24px_rgba(0,0,0,0.35)]">
          <AnimatedBrandLogo />
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <button onClick={() => goTo("/profile")} className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl border border-white/10 transition-all backdrop-blur-md">
              <img
                src={user.profileImageUrl || user.picture || user.photoUrl}
                className="w-6 h-6 rounded-full border border-white/30"
                alt="user"
              />
              <span className="text-sm font-medium text-white">{user.displayName?.split(" ")[0]}</span>
            </button>
          ) : (
            <button onClick={() => login()} className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-90 px-5 py-2 rounded-xl text-white font-bold shadow-lg shadow-blue-500/20 transition-all">
              <User className="w-5 h-5" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>

      <h2 className="text-2xl sm:text-3xl font-bold px-6 mb-3 flex items-center gap-2.5 tracking-tight relative z-10 text-white">
        <Gamepad2 className="w-6 h-6 sm:w-7 sm:h-7 text-emerald-400 shrink-0 drop-shadow-[0_0_12px_rgba(52,211,153,0.45)]" strokeWidth={2.25} />
        <span className="bg-gradient-to-b from-white via-white to-white/75 bg-clip-text text-transparent drop-shadow-[0_2px_16px_rgba(0,0,0,0.35)]">
          Choose Your Game
        </span>
      </h2>
      <div className="max-w-6xl mx-auto px-6 mb-6 relative z-10" aria-hidden>
        <div className="h-px w-full bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 px-6 pb-20 cursor-magnet-zone max-w-6xl mx-auto relative z-10" role="list">
        {games.map((game, idx) => (
          <div
            key={game.id}
            role="button"
            tabIndex={0}
            onClick={() => goTo(game.to)}
            onKeyDown={(e) => e.key === "Enter" && goTo(game.to)}
            className={`relative group-card entry-card ${idx < 6 ? 'show' : ''} bg-white/[0.07] border border-white/15 hover:border-white/25 rounded-2xl p-4 transition-all cursor-pointer backdrop-blur-md max-w-[320px] w-full mx-auto shadow-lg shadow-black/20`}
            style={{ overflow: 'visible', transitionDelay: `${idx * 70}ms` }}
          >
            <div className="absolute inset-0 opacity-0 group-hover:opacity-30 bg-gradient-to-br from-green-400 to-blue-400 rounded-2xl blur-xl transition-all" />

            <div className="w-full rounded-lg mb-3 overflow-visible relative ring-1 ring-white/10 shadow-inner shadow-black/20">
              <GameCardHero gameId={game.id} title={game.name} />
            </div>

            <h3 className="sr-only">{game.name}</h3>
            <p className="text-xs text-white/70 mb-2 leading-relaxed">{game.description}</p>

            <div className="flex items-center text-green-400 font-medium drop-shadow">Play Now <ChevronRight className="w-4 h-4 ml-1" /></div>
          </div>
        ))}
      </div>

      <div className="mt-10 text-center text-white/40 text-xs pb-6">© {new Date().getFullYear()} Akadoodle Gaming • All Rights Reserved</div>
    </div>
  );
}
