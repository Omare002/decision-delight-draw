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
  rot: number;    // rotation angle (radians)
  av: number;     // angular velocity (rad/s scaled per frame)
  isWinner: boolean;
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
          rot: Math.random() * Math.PI * 2,
          av: (Math.random() - 0.5) * 0.2,
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
      const chamberR = Math.max(20, Math.min(w, h) / 2 - 16);

      const st = stateRef.current;
      if (st.spinning) st.t += dt;
      const phase = st.spinning ? Math.min(1, st.t / DURATION) : 0;
      const spinning = st.spinning && phase < 1;

      const ds = shakeRef.current;
      const spinForce = spinning ? 0.55 + phase * 0.55 : 0.14;
      const drumAng = (now / 1000) * (spinning ? 3.5 + phase * 6 : 0.5);
      const gx = Math.cos(drumAng) * spinForce + (Math.random() - 0.5) * ds * 0.5;
      const gy = Math.sin(drumAng) * spinForce + 0.18 + (Math.random() - 0.5) * ds * 0.5;

      const AIR_DAMP = 0.992;
      const ANG_DAMP = 0.985;
      const WALL_REST = 0.78;
      const WALL_FRICTION = 0.22;
      const BALL_REST = 0.86;
      const BALL_FRICTION = 0.18;

      for (const b of ballsRef.current) {
        if (b.exiting) {
          b.vy -= 0.5;
          b.x += b.vx;
          b.y += b.vy;
          b.rot += b.av;
          continue;
        }
        b.vx += gx * 0.1;
        b.vy += gy * 0.1;
        if (spinning) {
          const k = 1.2 * (1 - phase * 0.6);
          b.vx += (Math.random() - 0.5) * k;
          b.vy += (Math.random() - 0.5) * k;
        }
        b.vx *= AIR_DAMP;
        b.vy *= AIR_DAMP;
        b.av *= ANG_DAMP;
        const maxV = spinning ? 17 : 8;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > maxV) { b.vx = b.vx / sp * maxV; b.vy = b.vy / sp * maxV; }
        b.x += b.vx;
        b.y += b.vy;
        b.rot += b.av;

        // Drum wall — normal reflection w/ restitution + tangential friction + spin coupling
        const dx = b.x - cx, dy = b.y - cy;
        const d = Math.hypot(dx, dy) || 0.0001;
        const limit = chamberR - b.r;
        if (d > limit) {
          const nx = dx / d, ny = dy / d;
          b.x = cx + nx * limit;
          b.y = cy + ny * limit;
          const vn = b.vx * nx + b.vy * ny;
          const tx = -ny, ty = nx;
          let vt = b.vx * tx + b.vy * ty;
          const surfaceV = b.av * b.r;
          const slip = vt - surfaceV;
          const jf = -slip * WALL_FRICTION;
          vt += jf;
          b.av += (jf / b.r) * 1.4;
          const vnNew = -vn * WALL_REST;
          const jitter = (Math.random() - 0.5) * 0.14;
          const cs = Math.cos(jitter), sn = Math.sin(jitter);
          const nvx = vnNew * nx + vt * tx;
          const nvy = vnNew * ny + vt * ty;
          b.vx = nvx * cs - nvy * sn;
          b.vy = nvx * sn + nvy * cs;
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
            // Tangential friction couples spin between the two balls
            const contactSurfA = -a.av * a.r;
            const contactSurfB =  b.av * b.r;
            const dvt = (b.vx - a.vx) * tx + (b.vy - a.vy) * ty + (contactSurfB - contactSurfA);
            const jt = -dvt * BALL_FRICTION * (ma * mb) * inv;
            a.vx -= (jt * tx) / ma; a.vy -= (jt * ty) / ma;
            b.vx += (jt * tx) / mb; b.vy += (jt * ty) / mb;
            a.av -= (jt / a.r) * 0.9;
            b.av += (jt / b.r) * 0.9;

            // Tiny asymmetric deflection so impacts feel varied
            const jitter = (Math.random() - 0.5) * 0.09;
            const cs = Math.cos(jitter), sn = Math.sin(jitter);
            const rax = a.vx, ray = a.vy;
            a.vx = rax * cs - ray * sn; a.vy = rax * sn + ray * cs;
            const rbx = b.vx, rby = b.vy;
            b.vx = rbx * cs + rby * sn; b.vy = -rbx * sn + rby * cs;
          }
        }
      }

      if (st.spinning && phase >= 1 && !st.completed) {
        const wb = arr.find(b => b.isWinner);
        if (wb && !wb.exiting) {
          wb.exiting = true;
          wb.vx = 0;
          wb.vy = -14;
          wb.av = (Math.random() - 0.5) * 0.4;
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

      // glass drum — outer soft glow
      const glow = ctx.createRadialGradient(cx, cy, chamberR * 0.6, cx, cy, chamberR * 1.15);
      glow.addColorStop(0, "rgba(255,255,255,0.0)");
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

      // balls — glossy 3D spheres
      arr.forEach((b, idx) => {
        ctx.save();

        // contact shadow under ball
        ctx.beginPath();
        ctx.ellipse(b.x, b.y + b.r * 0.85, b.r * 0.7, b.r * 0.18, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0,0,0,0.28)";
        ctx.filter = "blur(4px)";
        ctx.fill();
        ctx.filter = "none";

        // main sphere with deep radial shading
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

        // rim / terminator darkening (Fresnel-ish)
        const rim = ctx.createRadialGradient(b.x, b.y, b.r * 0.75, b.x, b.y, b.r);
        rim.addColorStop(0, "rgba(0,0,0,0)");
        rim.addColorStop(1, "rgba(0,0,0,0.45)");
        ctx.fillStyle = rim;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();

        // rim light bottom-right (reflected environment)
        ctx.save();
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.clip();
        const rimLight = ctx.createRadialGradient(
          b.x + b.r * 0.65, b.y + b.r * 0.6, b.r * 0.05,
          b.x + b.r * 0.4, b.y + b.r * 0.35, b.r * 0.9
        );
        rimLight.addColorStop(0, "rgba(255,255,255,0.35)");
        rimLight.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = rimLight;
        ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
        ctx.restore();

        // subtle outer ring
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
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
        ctx.strokeStyle = "rgba(0,0,0,0.2)";
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // star or number — rotated with the ball's angular position (visible spin)
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


        // primary specular highlight (bright top-left)
        const hi = ctx.createRadialGradient(
          b.x - b.r * 0.4, b.y - b.r * 0.5, 0,
          b.x - b.r * 0.4, b.y - b.r * 0.5, b.r * 0.55
        );
        hi.addColorStop(0, "rgba(255,255,255,0.95)");
        hi.addColorStop(0.4, "rgba(255,255,255,0.3)");
        hi.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = hi;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();

        // tiny pinpoint spec
        ctx.beginPath();
        ctx.arc(b.x - b.r * 0.42, b.y - b.r * 0.5, b.r * 0.09, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.fill();

        // label below the ball
        if (b.label) {
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
      });

      // drum top glare
      ctx.beginPath();
      ctx.ellipse(cx - chamberR * 0.32, cy - chamberR * 0.45, chamberR * 0.38, chamberR * 0.14, -0.4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.fill();

      // secondary small glare
      ctx.beginPath();
      ctx.ellipse(cx + chamberR * 0.35, cy - chamberR * 0.15, chamberR * 0.08, chamberR * 0.04, -0.4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
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
