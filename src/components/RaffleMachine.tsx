import { useEffect, useRef } from "react";
import type { Option } from "@/lib/raffle-storage";

interface Ball {
  id: string;
  label: string;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  isWinner: boolean;
  exiting: boolean;
}

const BALL_COLORS = [
  "var(--ball-1)", "var(--ball-2)", "var(--ball-3)", "var(--ball-4)",
  "var(--ball-5)", "var(--ball-6)", "var(--ball-7)", "var(--ball-8)",
];

function resolveColor(c: string, el: HTMLElement): string {
  const name = c.replace(/var\(|\)/g, "").trim();
  return getComputedStyle(el).getPropertyValue(name).trim() || "#f43f5e";
}

interface Props {
  options: Option[];
  spinning: boolean;
  winner: Option | null;
  onSpinComplete: () => void;
  shakeIntensity?: number;
}

export function RaffleMachine({ options, spinning, winner, onSpinComplete, shakeIntensity = 0 }: Props) {
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
    options.forEach((opt, i) => {
      const copies = Math.max(1, opt.weight);
      for (let c = 0; c < copies; c++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = Math.random() * (chamberR - 40);
        const baseR = Math.max(18, Math.min(34, 130 / Math.sqrt(options.reduce((s, o) => s + o.weight, 0) + 1)));
        ballEntries.push({
          id: `${opt.id}-${c}`,
          label: opt.label,
          color: resolveColor(BALL_COLORS[opt.colorIndex % BALL_COLORS.length], canvas),
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
      // pick winner ball
      if (winner) {
        const candidates = ballsRef.current.filter(b => b.id.startsWith(winner.id + "-"));
        const chosen = candidates[Math.floor(Math.random() * candidates.length)];
        ballsRef.current.forEach(b => b.isWinner = b === chosen);
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

      // shake from device
      const ds = shakeRef.current;
      // tumble force - rotating gravity
      const spinForce = spinning ? 0.6 + phase * 0.4 : 0.15;
      const angle = (now / 1000) * (spinning ? 4 + phase * 6 : 0.6);
      const gx = Math.cos(angle) * spinForce + (Math.random() - 0.5) * ds * 0.5;
      const gy = Math.sin(angle) * spinForce + 0.15 + (Math.random() - 0.5) * ds * 0.5;

      // update physics
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

        // chamber wall
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

      // ball-ball collisions (simple)
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

      // winner exits
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
      // chamber glass
      const shakeX = (Math.random() - 0.5) * (spinning ? 4 + ds * 8 : ds * 6);
      const shakeY = (Math.random() - 0.5) * (spinning ? 4 + ds * 8 : ds * 6);
      ctx.save();
      ctx.translate(shakeX, shakeY);

      // outer ring
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

      // balls
      for (const b of arr) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        const bg = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.1, b.x, b.y, b.r);
        bg.addColorStop(0, "rgba(255,255,255,0.9)");
        bg.addColorStop(0.3, b.color);
        bg.addColorStop(1, b.color);
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.15)";
        ctx.lineWidth = 1;
        ctx.stroke();
        // label
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.font = `600 ${Math.max(9, b.r * 0.5)}px Plus Jakarta Sans, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const lbl = b.label.length > 8 ? b.label.slice(0, 7) + "…" : b.label;
        ctx.fillText(lbl, b.x, b.y);
        ctx.restore();
      }

      // inner glass highlight
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
  }, [onSpinComplete]);

  return (
    <div ref={containerRef} className="relative aspect-square w-full max-w-md mx-auto">
      {/* Machine housing */}
      <div className="absolute inset-0 rounded-full bg-machine glass-strong shadow-soft" />
      <div className="absolute inset-2 rounded-full border border-white/20" />
      {/* exit tube */}
      <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-16 h-10 rounded-t-2xl glass-strong border-b-0" />
      <canvas ref={canvasRef} className="relative w-full h-full" />
      {/* base */}
      <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-3/4 h-8 rounded-2xl bg-foreground/10 backdrop-blur-md" />
    </div>
  );
}
