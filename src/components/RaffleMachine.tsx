import { useEffect, useRef } from "react";
import type { Option } from "@/lib/raffle-storage";

interface Ball {
  id: string;
  optionId: string;
  label: string;
  color: string;
  dark: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  rot: number;
  av: number;
  isWinner: boolean;
  rising: boolean;
  exiting: boolean;
}

// Retro-sunset palette pulled from the VHS wallpaper — coral, magenta, gold, teal, plum
const BALL_PALETTE: Array<[string, string]> = [
  ["#d94a4a", "#4d1616"], // sunset coral
  ["#d63384", "#3f0f2c"], // neon magenta
  ["#d69a3c", "#3d2a0a"], // amber gold
  ["#2f7a8a", "#0e2830"], // dusk teal
  ["#7a4a9e", "#22143a"], // dusty violet
  ["#e07a5f", "#3f1a10"], // salmon
  ["#4fb08a", "#123324"], // mint
  ["#7a2d5a", "#2a0e1f"], // deep plum
];

// Hard ceiling on simulated bodies so 100+ options never tank the frame rate.
const MAX_BALLS = 120;

interface Props {
  options: Option[];
  spinning: boolean;
  winner: Option | null;
  onSpinComplete: () => void;
  shakeIntensity?: number;
  showStar?: boolean;
  numbered?: boolean;
}

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, outerR: number, fill: string) {
  const innerR = outerR * 0.45;
  const points = 5;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (Math.PI / points) * i - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

export function RaffleMachine({ options, spinning, winner, onSpinComplete, shakeIntensity = 0, showStar = true, numbered = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const ballsRef = useRef<Ball[]>([]);
  const rafRef = useRef<number>(0);
  const optionsRef = useRef<Option[]>(options);
  const stateRef = useRef({ spinning: false, winner: null as Option | null, t: 0, completed: false, zoom: 1 });
  const shakeRef = useRef(0);
  const completeRef = useRef(onSpinComplete);
  const reducedRef = useRef(false);

  useEffect(() => { completeRef.current = onSpinComplete; }, [onSpinComplete]);
  useEffect(() => { reducedRef.current = prefersReducedMotion(); }, []);
  useEffect(() => { shakeRef.current = shakeIntensity; }, [shakeIntensity]);

  // Build balls when options change — sizes adapt to the crowd so nothing overflows.
  useEffect(() => {
    optionsRef.current = options;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || 360, h = rect.height || 360;
    const cx = w / 2, cy = h / 2;
    const chamberR = Math.max(40, Math.min(w, h) / 2 - 16);

    // One body per weight unit, but never more than MAX_BALLS total.
    const totalUnits = options.reduce((s, o) => s + Math.max(1, o.weight), 0);
    const scaleDown = totalUnits > MAX_BALLS ? MAX_BALLS / totalUnits : 1;

    const planned: Array<{ opt: Option; copies: number }> = options.map((opt) => ({
      opt,
      copies: Math.max(1, Math.round(Math.max(1, opt.weight) * scaleDown)),
    }));
    const count = Math.max(1, planned.reduce((s, p) => s + p.copies, 0));

    // Pack ~42% of the chamber area with balls; clamp for readability + stability.
    const baseR = Math.max(6, Math.min(38, Math.sqrt((chamberR * chamberR * 0.42) / count)));

    const entries: Ball[] = [];
    planned.forEach(({ opt, copies }) => {
      for (let c = 0; c < copies; c++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = Math.sqrt(Math.random()) * Math.max(0, chamberR - baseR - 2);
        const [base, dark] = BALL_PALETTE[opt.colorIndex % BALL_PALETTE.length];
        entries.push({
          id: `${opt.id}-${c}`,
          optionId: opt.id,
          label: opt.label,
          color: base,
          dark,
          x: cx + Math.cos(ang) * dist,
          y: cy + Math.sin(ang) * dist,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2,
          r: baseR,
          rot: Math.random() * Math.PI * 2,
          av: (Math.random() - 0.5) * 0.2,
          isWinner: false,
          rising: false,
          exiting: false,
        });
      }
    });
    ballsRef.current = entries;
  }, [options]);

  useEffect(() => {
    const st = stateRef.current;
    st.spinning = spinning;
    st.winner = winner;
    st.completed = false;
    st.zoom = 1;
    if (spinning) {
      st.t = 0;
      ballsRef.current.forEach(b => { b.isWinner = false; b.rising = false; b.exiting = false; });
      if (winner) {
        let candidates = ballsRef.current.filter(b => b.optionId === winner.id);
        // Fallback: if the option somehow has no body, mark any ball so the draw still resolves.
        if (candidates.length === 0) candidates = ballsRef.current;
        const chosen = candidates[Math.floor(Math.random() * candidates.length)];
        if (chosen) chosen.isWinner = true;
      }
    }
  }, [spinning, winner]);

  // Safety net: the draw always resolves even if the winner body gets stuck.
  useEffect(() => {
    if (!spinning) return;
    const id = window.setTimeout(() => {
      const st = stateRef.current;
      if (!st.completed) { st.completed = true; completeRef.current(); }
    }, 9000);
    return () => window.clearTimeout(id);
  }, [spinning]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d", { alpha: true })!;
    // Cap DPR — retina phones otherwise push 3x the pixels for no visual gain here.
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      canvas!.width = Math.max(1, Math.round(rect.width * dpr));
      canvas!.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    let last = performance.now();
    const reduced = reducedRef.current;
    const DURATION = reduced ? 1200 : 4200;

    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);
      const dt = Math.min(34, now - last);
      last = now;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width, h = rect.height;
      if (w < 2 || h < 2) return;
      const cx = w / 2, cy = h / 2;
      const chamberR = Math.max(20, Math.min(w, h) / 2 - 16);

      const st = stateRef.current;
      if (st.spinning) st.t += dt;
      const phase = st.spinning ? Math.min(1, st.t / DURATION) : 0;
      const spinning = st.spinning && phase < 1;
      const arr = ballsRef.current;
      const n = arr.length;

      // Adaptive fidelity: fewer physics substeps when the drum is crowded.
      const steps = reduced ? 1 : n > 60 ? 1 : n > 24 ? 2 : 3;
      const stepScale = 1 / steps;

      const ds = shakeRef.current;
      const spinForce = spinning ? 0.5 + phase * 0.5 : 0.12;
      const drumAng = (now / 1000) * (spinning ? 3.2 + phase * 5 : 0.5);
      const gx = Math.cos(drumAng) * spinForce + (Math.random() - 0.5) * ds * 0.5;
      const gy = Math.sin(drumAng) * spinForce + 0.2 + (Math.random() - 0.5) * ds * 0.5;

      const AIR_DAMP = 0.992;
      const ANG_DAMP = 0.985;
      const WALL_REST = 0.72;
      const WALL_FRICTION = 0.22;
      const BALL_REST = 0.8;
      const BALL_FRICTION = 0.16;
      const turbulence = spinning && !reduced ? 1.0 * (1 - phase * 0.6) : 0;

      // Frame-rate independent factor for the reveal so it never stalls on slow frames.
      const f = Math.max(0.5, Math.min(2.5, dt / 16.67));

      for (let s = 0; s < steps; s++) {
        for (let i = 0; i < n; i++) {
          const b = arr[i];
          if (b.exiting) {
            if (s === 0) {
              b.vy -= 0.45 * f;
              b.x += b.vx * f;
              b.y += b.vy * f;
              b.rot += b.av * f;
            }
            continue;
          }
          if (b.rising) {
            if (s === 0) {
              b.vx *= Math.pow(0.9, f);
              b.vy += (-5.2 - b.vy) * Math.min(1, 0.14 * f);
              b.x += b.vx * f;
              b.y += b.vy * f;
              b.rot += b.av * 0.4 * f;
              const dx0 = b.x - cx, dy0 = b.y - cy;
              const d0 = Math.hypot(dx0, dy0) || 0.0001;
              const lim = chamberR - b.r;
              if (d0 > lim && b.y > cy - chamberR * 0.45) {
                b.x = cx + (dx0 / d0) * lim;
                b.y = cy + (dy0 / d0) * lim;
              }
            }
            continue;
          }


          b.vx += gx * 0.1 * stepScale;
          b.vy += gy * 0.1 * stepScale;
          if (turbulence) {
            b.vx += (Math.random() - 0.5) * turbulence * stepScale;
            b.vy += (Math.random() - 0.5) * turbulence * stepScale;
          }
          b.vx *= Math.pow(AIR_DAMP, stepScale);
          b.vy *= Math.pow(AIR_DAMP, stepScale);
          b.av *= Math.pow(ANG_DAMP, stepScale);
          const maxV = (spinning ? 16 : 8) * (b.r / 24 + 0.5);
          const sp = Math.hypot(b.vx, b.vy);
          if (sp > maxV) { b.vx = (b.vx / sp) * maxV; b.vy = (b.vy / sp) * maxV; }
          b.x += b.vx * stepScale;
          b.y += b.vy * stepScale;
          b.rot += b.av * stepScale;

          // Drum wall — reflection with restitution, tangential friction and spin coupling
          const dx = b.x - cx, dy = b.y - cy;
          const d = Math.hypot(dx, dy) || 0.0001;
          const limit = Math.max(1, chamberR - b.r);
          if (d > limit) {
            const nx = dx / d, ny = dy / d;
            b.x = cx + nx * limit;
            b.y = cy + ny * limit;
            const vn = b.vx * nx + b.vy * ny;
            const tx = -ny, ty = nx;
            let vt = b.vx * tx + b.vy * ty;
            const slip = vt - b.av * b.r;
            const jf = -slip * WALL_FRICTION;
            vt += jf;
            b.av += (jf / b.r) * 1.4;
            const vnNew = -vn * WALL_REST;
            const jitter = (Math.random() - 0.5) * 0.12;
            const cs = Math.cos(jitter), sn = Math.sin(jitter);
            const nvx = vnNew * nx + vt * tx;
            const nvy = vnNew * ny + vt * ty;
            b.vx = nvx * cs - nvy * sn;
            b.vy = nvx * sn + nvy * cs;
          }
        }

        // Broad phase: uniform spatial hash → O(n) instead of O(n²)
        let cell = 0;
        for (let i = 0; i < n; i++) cell = Math.max(cell, arr[i].r);
        cell = Math.max(8, cell * 2);
        const grid = new Map<number, number[]>();
        const cols = Math.ceil(w / cell) + 2;
        for (let i = 0; i < n; i++) {
          const b = arr[i];
          if (b.exiting || b.rising) continue;
          const key = (Math.floor(b.y / cell) + 1) * cols + (Math.floor(b.x / cell) + 1);
          const list = grid.get(key);
          if (list) list.push(i); else grid.set(key, [i]);
        }

        for (let i = 0; i < n; i++) {
          const a = arr[i];
          if (a.exiting || a.rising) continue;
          const gxi = Math.floor(a.x / cell) + 1;
          const gyi = Math.floor(a.y / cell) + 1;
          for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
              const list = grid.get((gyi + oy) * cols + (gxi + ox));
              if (!list) continue;
              for (let k = 0; k < list.length; k++) {
                const j = list[k];
                if (j <= i) continue;
                const b = arr[j];
                const dx = b.x - a.x, dy = b.y - a.y;
                const rs = a.r + b.r;
                const d2 = dx * dx + dy * dy;
                if (d2 >= rs * rs || d2 <= 0.01) continue;
                const d = Math.sqrt(d2);
                const nx = dx / d, ny = dy / d;
                const tx = -ny, ty = nx;
                const overlap = (rs - d) / 2;
                a.x -= nx * overlap; a.y -= ny * overlap;
                b.x += nx * overlap; b.y += ny * overlap;

                const ma = a.r * a.r, mb = b.r * b.r;
                const inv = 1 / (ma + mb);
                const dvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
                if (dvn < 0) {
                  const jn = -(1 + BALL_REST) * dvn * (ma * mb) * inv;
                  a.vx -= (jn * nx) / ma; a.vy -= (jn * ny) / ma;
                  b.vx += (jn * nx) / mb; b.vy += (jn * ny) / mb;
                }
                const dvt = (b.vx - a.vx) * tx + (b.vy - a.vy) * ty + (b.av * b.r + a.av * a.r);
                const jt = -dvt * BALL_FRICTION * (ma * mb) * inv;
                a.vx -= (jt * tx) / ma; a.vy -= (jt * ty) / ma;
                b.vx += (jt * tx) / mb; b.vy += (jt * ty) / mb;
                a.av -= (jt / a.r) * 0.8;
                b.av += (jt / b.r) * 0.8;
              }
            }
          }
        }
      }

      // Winner sequence: gentle rise, then exit through the neck
      let winnerBall: Ball | null = null;
      for (let i = 0; i < n; i++) if (arr[i].isWinner) { winnerBall = arr[i]; break; }

      if (st.spinning && phase >= 1 && winnerBall && !st.completed) {
        if (!winnerBall.rising && !winnerBall.exiting) {
          winnerBall.rising = true;
          winnerBall.av *= 0.3;
        }
        if (winnerBall.rising && winnerBall.y < cy - chamberR * 0.55) {
          winnerBall.rising = false;
          winnerBall.exiting = true;
          winnerBall.vx = (cx - winnerBall.x) * 0.05;
          winnerBall.vy = -9;
        }
        if (winnerBall.exiting && winnerBall.y + winnerBall.r < -24) {
          st.completed = true;
          completeRef.current();
        }
      }

      // Gentle camera zoom during the final beat of the draw
      const targetZoom = reduced ? 1 : st.spinning ? (phase > 0.55 ? 1 + (phase - 0.55) * 0.22 : 1) : 1;
      st.zoom += (targetZoom - st.zoom) * 0.06;

      // ---- draw ----
      ctx.clearRect(0, 0, w, h);
      const shakeAmp = reduced ? 0 : spinning ? 3 + ds * 6 : ds * 5;
      const shakeX = (Math.random() - 0.5) * shakeAmp;
      const shakeY = (Math.random() - 0.5) * shakeAmp;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(st.zoom, st.zoom);
      ctx.translate(-cx + shakeX, -cy + shakeY);

      // outer soft glow
      const glow = ctx.createRadialGradient(cx, cy, chamberR * 0.6, cx, cy, chamberR * 1.15);
      glow.addColorStop(0, "rgba(255,255,255,0)");
      glow.addColorStop(1, "rgba(255,255,255,0.12)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, chamberR * 1.15, 0, Math.PI * 2);
      ctx.fill();

      // glass body
      const grad = ctx.createRadialGradient(cx - chamberR * 0.3, cy - chamberR * 0.4, chamberR * 0.1, cx, cy, chamberR);
      grad.addColorStop(0, "rgba(255,255,255,0.4)");
      grad.addColorStop(0.65, "rgba(255,255,255,0.08)");
      grad.addColorStop(1, "rgba(255,255,255,0.02)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, chamberR, 0, Math.PI * 2);
      ctx.fill();

      // rim
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = "rgba(0,0,0,0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, chamberR - 2, 0, Math.PI * 2);
      ctx.stroke();

      // detail budget — drop the expensive passes when the drum is packed
      const rich = n <= 40;
      const showLabels = arr.length > 0 && arr[0].r >= 20 && n <= 24;

      for (let idx = 0; idx < n; idx++) {
        const b = arr[idx];
        ctx.save();

        if (rich) {
          ctx.beginPath();
          ctx.ellipse(b.x, b.y + b.r * 0.85, b.r * 0.7, b.r * 0.18, 0, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(0,0,0,0.24)";
          ctx.fill();
        }

        const bg = ctx.createRadialGradient(
          b.x - b.r * 0.4, b.y - b.r * 0.45, b.r * 0.05,
          b.x + b.r * 0.15, b.y + b.r * 0.15, b.r * 1.1
        );
        bg.addColorStop(0, "rgba(255,255,255,0.95)");
        bg.addColorStop(0.08, b.color);
        bg.addColorStop(0.55, b.color);
        bg.addColorStop(0.88, b.dark);
        bg.addColorStop(1, "#000");
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = bg;
        ctx.fill();

        if (rich) {
          const rim = ctx.createRadialGradient(b.x, b.y, b.r * 0.75, b.x, b.y, b.r);
          rim.addColorStop(0, "rgba(0,0,0,0)");
          rim.addColorStop(1, "rgba(0,0,0,0.45)");
          ctx.fillStyle = rim;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.stroke();

        // central disc + emblem
        const discR = b.r * 0.5;
        if (discR > 3) {
          ctx.beginPath();
          ctx.arc(b.x, b.y, discR, 0, Math.PI * 2);
          const discGrad = ctx.createRadialGradient(b.x - discR * 0.3, b.y - discR * 0.4, discR * 0.1, b.x, b.y, discR);
          discGrad.addColorStop(0, "#fff");
          discGrad.addColorStop(1, "#e8ddd2");
          ctx.fillStyle = discGrad;
          ctx.fill();

          ctx.save();
          ctx.translate(b.x, b.y);
          ctx.rotate(b.rot);
          if (numbered) {
            ctx.fillStyle = b.dark;
            ctx.font = `800 ${discR * 1.1}px "Space Grotesk", sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(String(idx + 1), 0, 1);
          } else if (showStar) {
            drawStar(ctx, 0, 0, discR * 0.78, b.dark);
          }
          ctx.restore();
        }

        // specular highlight
        const hi = ctx.createRadialGradient(
          b.x - b.r * 0.4, b.y - b.r * 0.5, 0,
          b.x - b.r * 0.4, b.y - b.r * 0.5, b.r * 0.55
        );
        hi.addColorStop(0, "rgba(255,255,255,0.9)");
        hi.addColorStop(0.4, "rgba(255,255,255,0.28)");
        hi.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = hi;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();

        if (showLabels && b.label) {
          ctx.fillStyle = "rgba(255,255,255,0.95)";
          ctx.font = `700 ${Math.max(9, b.r * 0.3)}px "Space Grotesk", sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.shadowColor = "rgba(0,0,0,0.7)";
          ctx.shadowBlur = 4;
          const lbl = b.label.length > 10 ? b.label.slice(0, 9) + "…" : b.label;
          ctx.fillText(lbl, b.x, b.y + b.r + 3);
          ctx.shadowBlur = 0;
        }
        ctx.restore();
      }

      // drum glare
      ctx.beginPath();
      ctx.ellipse(cx - chamberR * 0.32, cy - chamberR * 0.45, chamberR * 0.38, chamberR * 0.14, -0.4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.24)";
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx + chamberR * 0.35, cy - chamberR * 0.15, chamberR * 0.08, chamberR * 0.04, -0.4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.32)";
      ctx.fill();

      ctx.restore();
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [showStar, numbered]);

  return (
    <div ref={containerRef} className="relative aspect-square w-full max-w-md mx-auto">
      <div className="absolute inset-0 rounded-full bg-machine glass-strong shadow-soft" />
      <div className="absolute inset-2 rounded-full border border-white/20" />
      <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-16 h-10 rounded-t-2xl glass-strong border-b-0" />
      <canvas ref={canvasRef} className="relative w-full h-full" />
      <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-3/4 h-8 rounded-2xl bg-foreground/10 backdrop-blur-md" />
    </div>
  );
}

export function StaticBall({ colorIndex, label, size = 56, showLabel = true }: { colorIndex: number; label?: string; size?: number; showLabel?: boolean }) {
  const [base, dark] = BALL_PALETTE[colorIndex % BALL_PALETTE.length];
  const discR = size * 0.25;
  return (
    <div className="inline-flex flex-col items-center gap-1">
      <div
        className="relative rounded-full"
        style={{
          width: size, height: size,
          background: `radial-gradient(circle at 30% 28%, rgba(255,255,255,0.85) 0%, ${base} 14%, ${base} 65%, ${dark} 100%)`,
          boxShadow: `inset 0 -4px 8px rgba(0,0,0,0.35), 0 6px 14px -4px ${dark}`,
        }}
      >
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full grid place-items-center"
          style={{
            width: discR * 2, height: discR * 2,
            background: "radial-gradient(circle at 35% 30%, #fff, #e8ddd2)",
          }}
        >
          <svg viewBox="0 0 24 24" width={discR * 1.6} height={discR * 1.6} fill={dark}>
            <polygon points="12,2 14.6,9 22,9.3 16,14 18.2,21.5 12,17.3 5.8,21.5 8,14 2,9.3 9.4,9" />
          </svg>
        </div>
        <div
          className="absolute rounded-full"
          style={{
            top: "12%", left: "18%",
            width: size * 0.32, height: size * 0.16,
            background: "rgba(255,255,255,0.5)",
            filter: "blur(2px)", transform: "rotate(-25deg)",
          }}
        />
      </div>
      {showLabel && label && (
        <span className="max-w-[7rem] truncate text-[11px] font-semibold text-foreground/80">{label}</span>
      )}
    </div>
  );
}
