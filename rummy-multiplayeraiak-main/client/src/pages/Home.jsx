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

function AnimatedBrandLogo() {
  return (
    <div className="ak-live-logo animate-logo-pop" aria-label="AK doodle">
      <span className="ak-live-ak">AK</span>
      <span className="ak-live-doodle" aria-hidden>
        d
        <span className="ak-live-eye-o">
          <span className="ak-live-eye-dot" />
        </span>
        <span className="ak-live-eye-o ak-live-eye-o-second">
          <span className="ak-live-eye-dot" />
        </span>
        dle
      </span>
      <span className="ak-live-gamepad" aria-hidden>
        <span className="ak-live-pad-body">🎮</span>
      </span>
    </div>
  );
}

function AnimatedGameWord({ label }) {
  const chars = String(label || "").split("");
  return (
    <div className="ak-game-word" aria-label={label}>
      {chars.map((ch, i) => (
        <span
          key={`${label}-${i}-${ch}`}
          className="ak-game-word-char"
          style={{ animationDelay: `${i * 90}ms` }}
        >
          {ch}
        </span>
      ))}
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

        /* live logo */
        .ak-live-logo { position: relative; display:flex; align-items:flex-end; gap:10px; }
        .ak-live-ak {
          font-size: 2.4rem;
          font-weight: 900;
          line-height: 1;
          background: linear-gradient(90deg, #ff2ea6 0%, #ffd54a 35%, #6eff58 70%, #26f5ff 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          filter: drop-shadow(0 0 12px rgba(57,240,255,.25));
          animation: hue-shift 8s linear infinite;
        }
        .ak-live-doodle {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 1px;
          font-size: 2.4rem;
          font-weight: 900;
          line-height: 1;
          color: #f8fafc;
          letter-spacing: .3px;
          text-shadow: 0 0 10px rgba(255,255,255,.16);
          animation: float-soft 3.6s ease-in-out infinite;
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
          transform: translateY(-0.03em);
          animation: eye-blink 4s ease-in-out infinite;
          transform-origin: center center;
        }
        .ak-live-eye-o-second {
          animation-delay: 180ms;
        }
        .ak-live-eye-dot {
          width: 0.17em;
          height: 0.17em;
          border-radius: 999px;
          background: #f8fafc;
          animation: eye-look 2.8s ease-in-out infinite;
        }
        .ak-live-gamepad {
          position: absolute;
          right: -0.38rem;
          top: -0.52rem;
          font-size: 1.05rem;
          filter: drop-shadow(0 0 8px rgba(255,255,255,.2));
          animation: bob 2s ease-in-out infinite;
        }
        .ak-live-pad-body {
          display: inline-block;
          transform: rotate(-6deg);
        }

        /* live game word in cards */
        .ak-game-word { display:flex; align-items:center; justify-content:center; gap:2px; user-select:none; }
        .ak-game-word-char {
          display:inline-block;
          font-size: 2rem;
          font-weight: 900;
          line-height: 1;
          letter-spacing: .4px;
          background: linear-gradient(180deg, #7cf9ff 0%, #5ea5ff 35%, #e879f9 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          text-shadow: 0 0 12px rgba(126, 249, 255, 0.18);
          animation: char-pop 2.4s ease-in-out infinite;
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
        @keyframes eye-blink {
          0%, 44%, 48%, 100% { transform: translateY(-0.03em) scaleY(1); }
          46% { transform: translateY(-0.03em) scaleY(0.12); }
        }
        @keyframes char-pop { 0%,100%{ transform: translateY(0) scale(1)} 25%{ transform: translateY(-3px) scale(1.04)} 50%{ transform: translateY(0) scale(1)} }

        /* responsive tweaks */
        @media (max-width:768px){ .group-card { margin: 6px 0 } }
        @media (max-width:640px){
          .ak-live-ak, .ak-live-doodle { font-size: 2rem; }
          .ak-game-word-char { font-size: 1.7rem; }
        }
      `}</style>

      {/* HEADER */}
      <div className="flex items-center justify-between px-6 pt-6 mb-10">
        <div className="flex items-center gap-3 text-4xl sm:text-5xl font-black select-none relative">
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

      <h2 className="text-2xl sm:text-3xl font-bold px-6 mb-4 flex items-center gap-2 drop-shadow-lg">
        <Gamepad2 className="w-6 h-6 text-green-400" />
        Choose Your Game
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 px-6 pb-20 cursor-magnet-zone max-w-6xl mx-auto" role="list">
        {games.map((game, idx) => (
          <div
            key={game.id}
            role="button"
            tabIndex={0}
            onClick={() => goTo(game.to)}
            onKeyDown={(e) => e.key === "Enter" && goTo(game.to)}
            className={`relative group-card entry-card ${idx < 6 ? 'show' : ''} bg-white/5 border border-white/10 rounded-2xl p-4 transition-all cursor-pointer backdrop-blur-sm max-w-[320px] w-full mx-auto`}
            style={{ overflow: 'hidden' }}
          >
            <div className="absolute inset-0 opacity-0 group-hover:opacity-30 bg-gradient-to-br from-green-400 to-blue-400 rounded-2xl blur-xl transition-all" />

            <div className="w-full h-32 rounded-lg mb-3 flex items-center justify-center overflow-hidden relative">
              <AnimatedGameWord label={game.name} />

              {/* subtle floating */}
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
            </div>

            <h3 className="text-lg font-semibold mb-1 drop-shadow-md">{game.name}</h3>
            <p className="text-xs text-white/70 mb-2">{game.description}</p>

            <div className="flex items-center text-green-400 font-medium drop-shadow">Play Now <ChevronRight className="w-4 h-4 ml-1" /></div>
          </div>
        ))}
      </div>

      <div className="mt-10 text-center text-white/40 text-xs pb-6">© {new Date().getFullYear()} Akadoodle Gaming • All Rights Reserved</div>
    </div>
  );
}
