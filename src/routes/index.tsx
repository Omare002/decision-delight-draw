import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Trash2, X, Volume2, VolumeX, Sun, Moon, BarChart3, Sparkles, RotateCcw, Check, Smartphone, Minus, ArrowLeft } from "lucide-react";
import { RaffleMachine } from "@/components/RaffleMachine";
import { storage, weightedPick, type Option, type Mode, type Stats } from "@/lib/raffle-storage";
import { sfx } from "@/lib/sfx";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Raffle Decision — Let chance decide for you" },
      { name: "description", content: "Stuck between options? Drop them into the raffle machine, spin, and let fate pick. A playful ritual for escaping decision paralysis." },
      { property: "og:title", content: "Raffle Decision" },
      { property: "og:description", content: "Can't decide? Let chance decide for you." },
    ],
  }),
  component: App,
});

type View = "hero" | "compose" | "spin" | "winner" | "stats";

const PROMPTS = ["Study German", "Clean room", "Watch a movie", "Go for a walk", "Read a book", "Cook something new"];

function uid() { return Math.random().toString(36).slice(2, 9); }

function App() {
  const [view, setView] = useState<View>("hero");
  const [options, setOptions] = useState<Option[]>([]);
  const [mode, setMode] = useState<Mode>("free");
  const [input, setInput] = useState("");
  const [sound, setSound] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<Option | null>(null);
  const [feedback, setFeedback] = useState<null | "love" | "fine" | "no">(null);
  const [shake, setShake] = useState(0);
  const isRedraw = useRef(false);
  const colorCounter = useRef(0);

  // hydrate
  useEffect(() => {
    setOptions(storage.getOptions());
    setMode(storage.getMode());
    setSound(storage.getSound());
    const t = storage.getTheme();
    setTheme(t);
    document.documentElement.classList.toggle("dark", t === "dark");
  }, []);

  useEffect(() => { storage.setOptions(options); }, [options]);
  useEffect(() => { storage.setMode(mode); }, [mode]);
  useEffect(() => { storage.setSound(sound); sfx.enabled = sound; }, [sound]);
  useEffect(() => {
    storage.setTheme(theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // Device motion shake detection
  useEffect(() => {
    if (view !== "spin") return;
    let lastShake = 0;
    let last = { x: 0, y: 0, z: 0 };
    function handler(e: DeviceMotionEvent) {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x == null) return;
      const dx = (a.x ?? 0) - last.x;
      const dy = (a.y ?? 0) - last.y;
      const dz = (a.z ?? 0) - last.z;
      const mag = Math.hypot(dx, dy, dz);
      last = { x: a.x ?? 0, y: a.y ?? 0, z: a.z ?? 0 };
      setShake(Math.min(1, mag / 30));
      if (mag > 25 && Date.now() - lastShake > 1500 && !spinning && !winner) {
        lastShake = Date.now();
        triggerSpin();
      }
    }
    window.addEventListener("devicemotion", handler);
    return () => window.removeEventListener("devicemotion", handler);
  }, [view, spinning, winner]);

  async function requestMotion() {
    const D = (window as any).DeviceMotionEvent;
    if (D && typeof D.requestPermission === "function") {
      try { await D.requestPermission(); } catch {}
    }
  }

  function addOption() {
    const v = input.trim();
    if (!v) return;
    setOptions(o => [...o, { id: uid(), label: v, weight: 1, colorIndex: colorCounter.current++ % 8 }]);
    setInput("");
  }
  function removeOption(id: string) { setOptions(o => o.filter(x => x.id !== id)); }
  function bumpWeight(id: string, d: number) {
    setOptions(o => o.map(x => x.id === id ? { ...x, weight: Math.max(1, Math.min(9, x.weight + d)) } : x));
  }
  function clearAll() { setOptions([]); }

  function triggerSpin() {
    if (options.length < 2 || spinning) return;
    const w = weightedPick(options);
    setWinner(w);
    setSpinning(true);
    sfx.spin();
  }

  function onSpinComplete() {
    setSpinning(false);
    sfx.win();
    setTimeout(() => setView("winner"), 400);
    // record stats
    if (!winner) return;
    const s = storage.getStats();
    if (isRedraw.current) s.redraws += 1;
    s.total += 1;
    if (mode === "productivity") s.productivity += 1; else s.free += 1;
    s.picks[winner.label] = (s.picks[winner.label] || 0) + 1;
    storage.setStats(s);
    isRedraw.current = false;
  }

  function drawAgain() {
    isRedraw.current = true;
    setWinner(null);
    setFeedback(null);
    setView("spin");
  }

  const totalWeight = options.reduce((s, o) => s + Math.max(1, o.weight), 0);

  return (
    <div className="min-h-screen bg-hero">
      <TopBar
        theme={theme} setTheme={setTheme}
        sound={sound} setSound={setSound}
        onStats={() => setView("stats")}
        onBack={view !== "hero" ? () => { setView("hero"); setWinner(null); setSpinning(false); } : undefined}
      />
      <main className="mx-auto max-w-md px-5 pb-20 pt-2">
        <AnimatePresence mode="wait">
          {view === "hero" && <Hero key="hero" onStart={() => setView("compose")} />}
          {view === "compose" && (
            <Compose key="compose"
              options={options} input={input} setInput={setInput}
              addOption={addOption} removeOption={removeOption}
              bumpWeight={bumpWeight} clearAll={clearAll}
              mode={mode} setMode={setMode}
              totalWeight={totalWeight}
              onSpin={async () => { await requestMotion(); setView("spin"); }}
            />
          )}
          {view === "spin" && (
            <Spin key="spin"
              options={options} spinning={spinning} winner={winner}
              onSpin={triggerSpin} onSpinComplete={onSpinComplete}
              shake={shake}
            />
          )}
          {view === "winner" && winner && (
            <Winner key="winner" winner={winner} mode={mode}
              feedback={feedback} setFeedback={setFeedback}
              onAccept={() => setView("hero")}
              onRedraw={drawAgain}
            />
          )}
          {view === "stats" && <StatsView key="stats" onBack={() => setView("hero")} />}
        </AnimatePresence>
      </main>
    </div>
  );
}

function TopBar({ theme, setTheme, sound, setSound, onStats, onBack }: {
  theme: "light" | "dark"; setTheme: (t: "light" | "dark") => void;
  sound: boolean; setSound: (v: boolean) => void;
  onStats: () => void; onBack?: () => void;
}) {
  return (
    <div className="sticky top-0 z-10 mx-auto flex max-w-md items-center justify-between px-5 py-4">
      <button
        onClick={onBack}
        className={`grid h-10 w-10 place-items-center rounded-full glass shadow-soft transition ${onBack ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        aria-label="Back"
      ><ArrowLeft className="h-4 w-4" /></button>
      <div className="flex gap-2">
        <IconBtn onClick={onStats} label="Stats"><BarChart3 className="h-4 w-4" /></IconBtn>
        <IconBtn onClick={() => setSound(!sound)} label={sound ? "Mute" : "Unmute"}>
          {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </IconBtn>
        <IconBtn onClick={() => setTheme(theme === "dark" ? "light" : "dark")} label="Theme">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </IconBtn>
      </div>
    </div>
  );
}

function IconBtn({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} aria-label={label}
      className="grid h-10 w-10 place-items-center rounded-full glass shadow-soft transition active:scale-95">
      {children}
    </button>
  );
}

function Hero({ onStart }: { onStart: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
      className="flex flex-col items-center pt-10 text-center"
    >
      <motion.div
        initial={{ scale: 0.5, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", duration: 1.2 }}
        className="relative mb-8"
      >
        <div className="absolute inset-0 rounded-full bg-primary/30 blur-3xl" />
        <div className="relative grid h-44 w-44 place-items-center rounded-full bg-machine glass-strong shadow-glow">
          <div className="grid grid-cols-2 gap-2">
            {[1,2,3,4].map(i => (
              <motion.div key={i}
                animate={{ y: [0, -6, 0], x: [0, i % 2 ? 4 : -4, 0] }}
                transition={{ duration: 1.5 + i * 0.2, repeat: Infinity, delay: i * 0.1 }}
                className="h-10 w-10 rounded-full"
                style={{ background: `radial-gradient(circle at 30% 30%, white, var(--ball-${i}))` }}
              />
            ))}
          </div>
        </div>
      </motion.div>
      <h1 className="font-display text-5xl font-bold leading-none">Raffle<br/>Decision</h1>
      <p className="mt-4 max-w-xs text-base text-muted-foreground">
        Can't decide? Drop your options in the drum and let chance pull one out.
      </p>
      <button
        onClick={onStart}
        className="mt-10 inline-flex items-center gap-2 rounded-full bg-primary px-8 py-4 text-base font-semibold text-primary-foreground shadow-glow transition active:scale-95"
      >
        <Sparkles className="h-4 w-4" /> Start Drawing
      </button>
      <p className="mt-4 text-xs text-muted-foreground/70">No account · Saved on your device</p>
    </motion.div>
  );
}

function Compose(props: {
  options: Option[]; input: string; setInput: (v: string) => void;
  addOption: () => void; removeOption: (id: string) => void;
  bumpWeight: (id: string, d: number) => void; clearAll: () => void;
  mode: Mode; setMode: (m: Mode) => void;
  totalWeight: number; onSpin: () => void;
}) {
  const { options, input, setInput, addOption, removeOption, bumpWeight, clearAll, mode, setMode, totalWeight, onSpin } = props;
  const placeholder = useMemo(() => PROMPTS[Math.floor(Math.random() * PROMPTS.length)], []);
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
      className="space-y-5"
    >
      <div>
        <h2 className="font-display text-3xl font-bold">Your options</h2>
        <p className="text-sm text-muted-foreground">Add at least two. Weight them for higher chances.</p>
      </div>

      <div className="glass rounded-3xl p-2 shadow-soft">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addOption()}
            placeholder={`e.g. ${placeholder}`}
            className="flex-1 bg-transparent px-4 py-3 text-base outline-none placeholder:text-muted-foreground/60"
            maxLength={40}
          />
          <button onClick={addOption}
            disabled={!input.trim()}
            className="grid h-11 w-11 place-items-center rounded-2xl bg-primary text-primary-foreground transition active:scale-95 disabled:opacity-40">
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </div>

      <AnimatePresence mode="popLayout">
        {options.length === 0 && (
          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="rounded-2xl border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground"
          >
            Your options will appear here as colorful balls
          </motion.p>
        )}
      </AnimatePresence>

      <div className="flex flex-wrap gap-2">
        <AnimatePresence>
          {options.map((o) => {
            const pct = Math.round((Math.max(1, o.weight) / totalWeight) * 100);
            return (
              <motion.div key={o.id}
                layout
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="group flex items-center gap-2 rounded-full glass-strong px-1 py-1 pl-3 shadow-soft"
              >
                <span className="h-3 w-3 rounded-full" style={{ background: `var(--ball-${(o.colorIndex % 8) + 1})` }} />
                <span className="max-w-[10rem] truncate text-sm font-medium">{o.label}</span>
                <span className="text-[10px] tabular-nums text-muted-foreground">{pct}%</span>
                <div className="flex items-center rounded-full bg-background/50">
                  <button onClick={() => bumpWeight(o.id, -1)} className="grid h-7 w-7 place-items-center text-muted-foreground active:scale-90"><Minus className="h-3 w-3" /></button>
                  <span className="w-4 text-center text-xs font-bold tabular-nums">{o.weight}</span>
                  <button onClick={() => bumpWeight(o.id, 1)} className="grid h-7 w-7 place-items-center text-muted-foreground active:scale-90"><Plus className="h-3 w-3" /></button>
                </div>
                <button onClick={() => removeOption(o.id)} className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:text-destructive active:scale-90">
                  <X className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {options.length > 0 && (
        <button onClick={clearAll} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive">
          <Trash2 className="h-3 w-3" /> Clear all
        </button>
      )}

      <div className="pt-2">
        <p className="mb-2 text-sm font-semibold">Mode</p>
        <div className="grid grid-cols-2 gap-2">
          <ModePick label="Free Choice" desc="Everyday picks" active={mode === "free"} onClick={() => setMode("free")} emoji="🎲" />
          <ModePick label="Productivity" desc="25-min commit" active={mode === "productivity"} onClick={() => setMode("productivity")} emoji="🎯" />
        </div>
      </div>

      <button
        onClick={onSpin}
        disabled={options.length < 2}
        className="sticky bottom-4 w-full rounded-full bg-primary py-4 text-base font-semibold text-primary-foreground shadow-glow transition active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
      >
        {options.length < 2 ? `Add ${2 - options.length} more option${options.length === 1 ? "" : "s"}` : "Load the machine →"}
      </button>
    </motion.div>
  );
}

function ModePick({ label, desc, active, onClick, emoji }: { label: string; desc: string; active: boolean; onClick: () => void; emoji: string }) {
  return (
    <button onClick={onClick}
      className={`rounded-2xl p-3 text-left transition ${active ? "bg-primary text-primary-foreground shadow-soft" : "glass"}`}>
      <div className="text-lg">{emoji}</div>
      <div className="text-sm font-semibold">{label}</div>
      <div className={`text-[11px] ${active ? "opacity-80" : "text-muted-foreground"}`}>{desc}</div>
    </button>
  );
}

function Spin({ options, spinning, winner, onSpin, onSpinComplete, shake }: {
  options: Option[]; spinning: boolean; winner: Option | null;
  onSpin: () => void; onSpinComplete: () => void; shake: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
      className="flex flex-col items-center gap-8 pt-6"
    >
      <div className="text-center">
        <p className="text-sm uppercase tracking-widest text-muted-foreground">{spinning ? "Drawing…" : "Ready"}</p>
        <h2 className="font-display text-2xl font-bold">{spinning ? "Hold your breath" : "Shake or spin"}</h2>
      </div>
      <RaffleMachine
        options={options}
        spinning={spinning}
        winner={winner}
        onSpinComplete={onSpinComplete}
        shakeIntensity={shake}
      />
      <button
        onClick={onSpin}
        disabled={spinning}
        className="inline-flex items-center gap-2 rounded-full bg-primary px-10 py-4 text-base font-semibold text-primary-foreground shadow-glow transition active:scale-95 disabled:opacity-60"
      >
        <Sparkles className="h-4 w-4" /> {spinning ? "Spinning…" : "Spin Machine"}
      </button>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Smartphone className="h-3 w-3" /> Or shake your phone
      </p>
    </motion.div>
  );
}

function Winner({ winner, mode, feedback, setFeedback, onAccept, onRedraw }: {
  winner: Option; mode: Mode;
  feedback: null | "love" | "fine" | "no"; setFeedback: (f: "love" | "fine" | "no") => void;
  onAccept: () => void; onRedraw: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className="relative space-y-6 pt-8 text-center"
    >
      <Confetti />
      <p className="text-sm uppercase tracking-widest text-muted-foreground">🎉 Your decision</p>
      <motion.div
        initial={{ scale: 0 }} animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
        className="mx-auto"
      >
        <div className="mx-auto grid h-32 w-32 place-items-center rounded-full shadow-glow"
          style={{ background: `radial-gradient(circle at 30% 30%, white, var(--ball-${(winner.colorIndex % 8) + 1}))` }}
        />
      </motion.div>
      <h1 className="font-display text-4xl font-bold leading-tight">{winner.label}</h1>

      {mode === "productivity" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="mx-auto max-w-xs rounded-2xl glass p-4 text-sm">
          <span className="font-semibold">Commit for 25 minutes</span> before drawing again. Set a timer and go.
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
        className="space-y-3 pt-2"
      >
        <p className="text-sm text-muted-foreground">How do you feel about this result?</p>
        <div className="flex justify-center gap-2">
          <Feel emoji="😍" label="Love it" active={feedback === "love"} onClick={() => setFeedback("love")} />
          <Feel emoji="😐" label="Fine" active={feedback === "fine"} onClick={() => setFeedback("fine")} />
          <Feel emoji="😩" label="Not it" active={feedback === "no"} onClick={() => setFeedback("no")} />
        </div>
        <AnimatePresence>
          {feedback === "no" && (
            <motion.p
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              className="mx-auto max-w-xs text-sm italic text-muted-foreground"
            >
              Interesting… maybe your heart already knew what it preferred.
            </motion.p>
          )}
          {feedback === "love" && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm italic text-muted-foreground">
              The drum has spoken. Go enjoy it.
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>

      <div className="grid grid-cols-2 gap-2 pt-2">
        <button onClick={onRedraw}
          className="inline-flex items-center justify-center gap-2 rounded-full glass-strong py-4 text-sm font-semibold shadow-soft active:scale-95">
          <RotateCcw className="h-4 w-4" /> Draw again
        </button>
        <button onClick={onAccept}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-primary py-4 text-sm font-semibold text-primary-foreground shadow-glow active:scale-95">
          <Check className="h-4 w-4" /> Accept
        </button>
      </div>
    </motion.div>
  );
}

function Feel({ emoji, label, active, onClick }: { emoji: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-2xl px-4 py-2 transition active:scale-95 ${active ? "bg-primary text-primary-foreground shadow-soft" : "glass"}`}>
      <span className="text-2xl">{emoji}</span>
      <span className="text-[11px] font-medium">{label}</span>
    </button>
  );
}

function Confetti() {
  const pieces = useMemo(() => Array.from({ length: 24 }, () => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    color: Math.floor(Math.random() * 8) + 1,
    size: 6 + Math.random() * 8,
  })), []);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p, i) => (
        <span key={i}
          className="absolute bottom-0 animate-confetti"
          style={{
            left: `${p.left}%`,
            width: p.size, height: p.size,
            background: `var(--ball-${p.color})`,
            borderRadius: i % 2 ? "50%" : "2px",
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

function StatsView({ onBack }: { onBack: () => void }) {
  const [stats, setStats] = useState<Stats>({ total: 0, redraws: 0, productivity: 0, free: 0, picks: {} });
  useEffect(() => { setStats(storage.getStats()); }, []);
  const top = Object.entries(stats.picks).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const mostPicked = top[0]?.[0] ?? "—";

  function reset() {
    if (!confirm("Reset all stats?")) return;
    storage.setStats({ total: 0, redraws: 0, productivity: 0, free: 0, picks: {} });
    setStats({ total: 0, redraws: 0, productivity: 0, free: 0, picks: {} });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
      className="space-y-5 pt-2"
    >
      <h2 className="font-display text-3xl font-bold">Your stats</h2>
      <div className="grid grid-cols-2 gap-3">
        <Stat big label="Total draws" value={stats.total} />
        <Stat big label="Redraws" value={stats.redraws} />
        <Stat label="Productivity" value={stats.productivity} />
        <Stat label="Free choice" value={stats.free} />
      </div>
      <div className="glass rounded-3xl p-5 shadow-soft">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Most picked</p>
        <p className="mt-1 font-display text-2xl font-bold truncate">{mostPicked}</p>
        {top.length > 0 && (
          <ul className="mt-4 space-y-2">
            {top.map(([label, n], i) => {
              const max = top[0][1];
              return (
                <li key={label} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="truncate">{i + 1}. {label}</span>
                    <span className="tabular-nums text-muted-foreground">{n}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(n / max) * 100}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="flex gap-2">
        <button onClick={onBack} className="flex-1 rounded-full glass-strong py-3 text-sm font-semibold active:scale-95">Back</button>
        <button onClick={reset} className="flex-1 rounded-full bg-destructive/10 py-3 text-sm font-semibold text-destructive active:scale-95">Reset</button>
      </div>
    </motion.div>
  );
}

function Stat({ label, value, big }: { label: string; value: number; big?: boolean }) {
  return (
    <div className="glass rounded-3xl p-5 shadow-soft">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display font-bold tabular-nums ${big ? "text-4xl" : "text-2xl"}`}>{value}</p>
    </div>
  );
}
