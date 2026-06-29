import { useEffect, useRef } from "react";
import type { Option } from "@/lib/raffle-storage";

interface Ball {
  id: string;
  label: string;
  color: string;
  dark: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  isWinner: boolean;
  exiting: boolean;
}

// Rich, glossy colors inspired by the maroon dragon-ball reference.
// Each entry: [base color, deeper shadow color]
const BALL_PALETTE: Array<[string, string]> = [
  ["#7a1f2b", "#3a0d14"], // maroon (reference)
  ["#1f4d7a", "#0d1f3a"], // deep blue
  ["#2d6a3f", "#0f2f1c"], // forest green
  ["#7a5a1f", "#3a2a0d"], // amber bronze
  ["#5a1f7a", "#28103a"], // royal violet
  ["#7a1f5a", "#3a0d28"], // berry
  ["#1f6a7a", "#0d2a3a"], // teal
  ["#7a4a1f", "#3a200d"], // burnt orange
];

interface Props {
  options: Option[];
  spinning: boolean;
  winner: Option | null;
  onSpinComplete: () => void;
  shakeIntensity?: number;
  showStar?: boolean;
  numbered?: boolean;
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
  const stateRef = useRef({ spinning: false, winner: null as Option | null, t: 0, completed: false });
  const shakeRef = useRef(0);

  // Build balls when options change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    const cx = w / 2, cy = h / 2;
    const chamberR = Math.min(w, h) / 2 - 16;

    const ballEntries: Ball[] = [];
    options.forEach((opt) => {
      const copies = Math.max(1, opt.weight);
      for (let c = 0; c < copies; c++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = Math.random() * (chamberR - 40);
        const totalCount = options.reduce((s, o) => s + Math.max(1, o.weight), 0);
        const baseR = Math.max(22, Math.min(40, 150 / Math.sqrt(totalCount + 1)));
        const [base, dark] = BALL_PALETTE[opt.colorIndex % BALL_PALETTE.length];
        ballEntries.push({
          id: `${opt.id}-${c}`,
          label: opt.label,
          color: base,
          dark,
          x: cx + Math.cos(ang) * dist,
          y: cy + Math.sin(ang) * dist,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2,
          r: baseR,
          isWinner: false,
          exiting: false,
        });
      }
    });
    ballsRef.current = ballEntries;
  }, [options]);

  useEffect(() => {
    stateRef.current.spinning = spinning;
    stateRef.current.winner = winner;
    stateRef.current.completed = false;
    if (spinning) {
      stateRef.current.t = 0;
      if (winner) {
        const candidates = ballsRef.current.filter(b => b.id.startsWith(winner.id + "-"));
        const chosen = candidates[Math.floor(Math.random() * candidates.length)];
        ballsRef.current.forEach(b => { b.isWinner = b === chosen; });
      }
    }
  }, [spinning, winner]);

  useEffect(() => { shakeRef.current = shakeIntensity; }, [shakeIntensity]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      canvas!.width = rect.width * dpr;
      canvas!.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    let last = performance.now();
    const DURATION = 4800;

    const tick = (now: number) => {
      const dt = Math.min(40, now - last);
      last = now;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width, h = rect.height;
      const cx = w / 2, cy = h / 2;
      const chamberR = Math.min(w, h) / 2 - 16;

      const st = stateRef.current;
      if (st.spinning) st.t += dt;
      const phase = st.spinning ? Math.min(1, st.t / DURATION) : 0;
      const spinning = st.spinning && phase < 1;

      const ds = shakeRef.current;
      const spinForce = spinning ? 0.6 + phase * 0.4 : 0.15;
      const angle = (now / 1000) * (spinning ? 4 + phase * 6 : 0.6);
      const gx = Math.cos(angle) * spinForce + (Math.random() - 0.5) * ds * 0.5;
      const gy = Math.sin(angle) * spinForce + 0.15 + (Math.random() - 0.5) * ds * 0.5;

      for (const b of ballsRef.current) {
        if (b.exiting) {
          b.vy -= 0.5;
          b.x += b.vx;
          b.y += b.vy;
          continue;
        }
        b.vx += gx * 0.1;
        b.vy += gy * 0.1;
        if (spinning) {
          b.vx += (Math.random() - 0.5) * 1.2;
          b.vy += (Math.random() - 0.5) * 1.2;
        }
        b.vx *= 0.985;
        b.vy *= 0.985;
        const maxV = spinning ? 16 : 8;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > maxV) { b.vx = b.vx / sp * maxV; b.vy = b.vy / sp * maxV; }
        b.x += b.vx;
        b.y += b.vy;

        const dx = b.x - cx, dy = b.y - cy;
        const d = Math.hypot(dx, dy);
        const limit = chamberR - b.r;
        if (d > limit) {
          const nx = dx / d, ny = dy / d;
          b.x = cx + nx * limit;
          b.y = cy + ny * limit;
          const dot = b.vx * nx + b.vy * ny;
          b.vx -= 2 * dot * nx * 0.85;
          b.vy -= 2 * dot * ny * 0.85;
        }
      }

      const arr = ballsRef.current;
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const a = arr[i], b = arr[j];
          if (a.exiting || b.exiting) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const d2 = dx * dx + dy * dy;
          const rs = a.r + b.r;
          if (d2 < rs * rs && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const nx = dx / d, ny = dy / d;
            const overlap = (rs - d) / 2;
            a.x -= nx * overlap; a.y -= ny * overlap;
            b.x += nx * overlap; b.y += ny * overlap;
            const dvx = b.vx - a.vx, dvy = b.vy - a.vy;
            const p = dvx * nx + dvy * ny;
            if (p < 0) {
              a.vx += p * nx; a.vy += p * ny;
              b.vx -= p * nx; b.vy -= p * ny;
            }
          }
        }
      }

      if (st.spinning && phase >= 1 && !st.completed) {
        const wb = arr.find(b => b.isWinner);
        if (wb && !wb.exiting) {
          wb.exiting = true;
          wb.vx = 0;
          wb.vy = -14;
          wb.r *= 1.4;
        }
        if (wb && wb.y + wb.r < -20) {
          st.completed = true;
          onSpinComplete();
        }
      }

      // draw
      ctx.clearRect(0, 0, w, h);
      const shakeX = (Math.random() - 0.5) * (spinning ? 4 + ds * 8 : ds * 6);
      const shakeY = (Math.random() - 0.5) * (spinning ? 4 + ds * 8 : ds * 6);
      ctx.save();
      ctx.translate(shakeX, shakeY);

      const grad = ctx.createRadialGradient(cx, cy - chamberR * 0.4, chamberR * 0.2, cx, cy, chamberR);
      grad.addColorStop(0, "rgba(255,255,255,0.35)");
      grad.addColorStop(1, "rgba(255,255,255,0.05)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, chamberR, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 4;
      ctx.stroke();

      // balls — glossy dragon-ball style
      arr.forEach((b, idx) => {
        ctx.save();
        // sphere body with radial gradient
        const bg = ctx.createRadialGradient(b.x - b.r * 0.45, b.y - b.r * 0.5, b.r * 0.05, b.x, b.y, b.r);
        bg.addColorStop(0, "rgba(255,255,255,0.85)");
        bg.addColorStop(0.12, b.color);
        bg.addColorStop(0.7, b.color);
        bg.addColorStop(1, b.dark);
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = bg;
        ctx.fill();

        // subtle outer ring
        ctx.strokeStyle = "rgba(0,0,0,0.25)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // central white disc
        const discR = b.r * 0.5;
        ctx.beginPath();
        ctx.arc(b.x, b.y, discR, 0, Math.PI * 2);
        const discGrad = ctx.createRadialGradient(b.x - discR * 0.3, b.y - discR * 0.4, discR * 0.1, b.x, b.y, discR);
        discGrad.addColorStop(0, "#fff");
        discGrad.addColorStop(1, "#e8ddd2");
        ctx.fillStyle = discGrad;
        ctx.fill();

        // star or number, or label fallback
        if (numbered) {
          ctx.fillStyle = b.dark;
          ctx.font = `800 ${discR * 1.1}px Plus Jakarta Sans, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(idx + 1), b.x, b.y + 1);
        } else if (showStar) {
          drawStar(ctx, b.x, b.y, discR * 0.78, b.dark);
        }

        // top-left highlight for gloss
        ctx.beginPath();
        ctx.ellipse(b.x - b.r * 0.35, b.y - b.r * 0.45, b.r * 0.3, b.r * 0.15, -0.5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.fill();

        // label below the ball
        if (b.label) {
          ctx.fillStyle = "rgba(255,255,255,0.95)";
          ctx.font = `700 ${Math.max(9, b.r * 0.3)}px Plus Jakarta Sans, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.shadowColor = "rgba(0,0,0,0.6)";
          ctx.shadowBlur = 4;
          const lbl = b.label.length > 10 ? b.label.slice(0, 9) + "…" : b.label;
          ctx.fillText(lbl, b.x, b.y + b.r + 2);
          ctx.shadowBlur = 0;
        }
        ctx.restore();
      });

      ctx.beginPath();
      ctx.ellipse(cx - chamberR * 0.3, cy - chamberR * 0.4, chamberR * 0.35, chamberR * 0.18, -0.4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fill();

      ctx.restore();

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [onSpinComplete, showStar, numbered]);

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
