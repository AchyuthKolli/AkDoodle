// cursor-spark.js
// Lightweight cursor sparkle effect.
// Usage: import { initCursorSpark } from '../utils/cursor-spark'; initCursorSpark();

let mounted = false;
export function initCursorSpark({ particleCount = 8, sparkleColor = "#fef3c7" } = {}) {
  if (mounted) return;
  mounted = true;

  // small, performance-friendly implementation
  const styleEl = document.createElement("style");
  styleEl.id = "cursor-spark-styles";
  styleEl.innerHTML = `
    .__cspark {
      position: fixed;
      pointer-events: none;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      transform: translate(-50%, -50%) scale(1);
      opacity: 0;
      transition: transform 300ms ease-out, opacity 300ms ease-out;
      z-index: 99999999;
      will-change: transform, opacity;
    }
  `;
  document.head.appendChild(styleEl);

  const particles = [];
  for (let i = 0; i < particleCount; i++) {
    const el = document.createElement("div");
    el.className = "__cspark";
    el.style.background = sparkleColor;
    el.style.left = "0px";
    el.style.top = "0px";
    el.style.opacity = "0";
    document.body.appendChild(el);
    particles.push({ el, busy: false });
  }

  let last = { x: 0, y: 0 };
  function spawn(x, y) {
    // find free particle
    const p = particles.find((q) => !q.busy);
    if (!p) return;
    p.busy = true;
    const el = p.el;
    const dx = (Math.random() - 0.5) * 40;
    const dy = (Math.random() - 0.5) * 40;
    const scale = 0.6 + Math.random() * 0.9;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.opacity = "1";
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transform = `translate(${dx * 1.5}px, ${dy * 1.5}px) scale(${scale * 0.2})`;
    }, 20);
    setTimeout(() => {
      p.busy = false;
      el.style.transform = `translate(-50%, -50%) scale(1)`;
      el.style.opacity = "0";
    }, 420);
  }

  let lastMove = 0;
  function onMove(e) {
    const now = Date.now();
    const distance = Math.hypot(e.clientX - last.x, e.clientY - last.y);
    last = { x: e.clientX, y: e.clientY };
    if (distance < 6 && now - lastMove < 30) return; // throttle
    lastMove = now;
    // spawn a few
    for (let i = 0; i < 2; i++) spawn(e.clientX + (Math.random() - 0.5) * 6, e.clientY + (Math.random() - 0.5) * 6);
  }

  window.addEventListener("mousemove", onMove, { passive: true });

  // optionally cleanup on SPA navigation - not required, but helpful:
  const cleanup = () => {
    window.removeEventListener("mousemove", onMove);
    particles.forEach((p) => p.el.remove());
    styleEl.remove();
    mounted = false;
  };

  // expose cleanup for advanced uses
  return { cleanup };
}
