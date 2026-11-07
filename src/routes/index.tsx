import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Plus, Trash2, X, Volume2, VolumeX, Sun, Moon, BarChart3, Sparkles,
  RotateCcw, Check, Smartphone, Minus, ArrowLeft, Timer, Shuffle, ListOrdered, Share2,
} from "lucide-react";
import { RaffleMachine, StaticBall } from "@/components/RaffleMachine";
import {
  storage, weightedPick, shuffle, CATEGORY_META,
  type Option, type Mode, type Stats, type Category, type RecentDecision,
} from "@/lib/raffle-storage";
import { sfx } from "@/lib/sfx";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Spinit — Let the drum decide for you" },
      { name: "description", content: "Stuck choosing? Drop your options into Spinit's raffle machine, give it a shake, and let chance decide. A playful ritual for escaping decision paralysis." },
      { property: "og:title", content: "Spinit" },
      { property: "og:description", content: "Can't decide? Spin it." },
    ],
  }),
  component: App,
});

type View = "home" | "compose" | "spin" | "winner" | "stats" | "order";

function uid() { return Math.random().toString(36).slice(2, 9); }

function App() {
  const [view, setView] = useState<View>("home");
  const [category, setCategory] = useState<Category>("custom");
  const [options, setOptions] = useState<Option[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<Mode>("free");
  const [sound, setSound] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<Option | null>(null);
  const [feedback, setFeedback] = useState<null | "love" | "fine" | "no">(null);
  const [shake, setShake] = useState(0);
  const [recent, setRecent] = useState<RecentDecision[]>([]);
  const [fullOrder, setFullOrder] = useState<Option[]>([]);
  const isRedraw = useRef(false);
  const colorCounter = useRef(0);
  const hydrated = useRef(false);

  // hydrate once
  useEffect(() => {
    const opts = storage.getOptions();
    setOptions(opts);
    setInput(storage.getInput());
    const cat = storage.getCategory();
    if (cat) setCategory(cat);
    setMode(storage.getMode());
    setSound(storage.getSound());
    setRecent(storage.getRecent());
    const t = storage.getTheme();
    setTheme(t);
    if (typeof document !== "undefined") document.documentElement.classList.toggle("dark", t === "dark");
    colorCounter.current = opts.length;
    hydrated.current = true;
  }, []);

  // persist
  useEffect(() => { if (hydrated.current) storage.setOptions(options); }, [options]);
  useEffect(() => { if (hydrated.current) storage.setInput(input); }, [input]);
  useEffect(() => { if (hydrated.current) storage.setCategory(category); }, [category]);
  useEffect(() => { if (hydrated.current) storage.setMode(mode); }, [mode]);
  useEffect(() => { if (hydrated.current) { storage.setSound(sound); sfx.enabled = sound; } }, [sound]);
  useEffect(() => {
    if (!hydrated.current) return;
    storage.setTheme(theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // Device motion shake — only when on spin view
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, spinning, winner]);

  async function requestMotion() {
    const D = (window as any).DeviceMotionEvent;
    if (D && typeof D.requestPermission === "function") {
      try { await D.requestPermission(); } catch { /* ignore */ }
    }
  }

  function addOption(label?: string) {
    const v = (label ?? input).trim();
    if (!v) return;
    setOptions(o => [...o, { id: uid(), label: v, weight: 1, colorIndex: colorCounter.current++ % 8 }]);
    if (label === undefined) setInput("");
  }
  function removeOption(id: string) { setOptions(o => o.filter(x => x.id !== id)); }
  function bumpWeight(id: string, d: number) {
    setOptions(o => o.map(x => x.id === id ? { ...x, weight: Math.max(1, Math.min(9, x.weight + d)) } : x));
  }
  function clearAll() { setOptions([]); setFullOrder([]); }

  function openCategory(cat: Category) {
    setCategory(cat);
    // Default productivity mode for that category
    if (cat === "productivity") setMode("productivity"); else setMode("free");
    setView("compose");
  }

  function loadTemplate(items: string[]) {
    setOptions(items.map((label) => ({
      id: uid(), label, weight: 1, colorIndex: colorCounter.current++ % 8,
    })));
  }

  function loadRecent(r: RecentDecision) {
    setCategory(r.category);
    setOptions(r.options.map((label) => ({
      id: uid(), label, weight: 1, colorIndex: colorCounter.current++ % 8,
    })));
    setView("compose");
  }

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
    if (!winner) return;
    const s = storage.getStats();
    if (isRedraw.current) s.redraws += 1;
    s.total += 1;
    if (mode === "productivity") s.productivity += 1; else s.free += 1;
    s.picks[winner.label] = (s.picks[winner.label] || 0) + 1;
    storage.setStats(s);
    const rec: RecentDecision = {
      id: uid(), category, winner: winner.label,
      options: options.map(o => o.label), at: Date.now(),
    };
    storage.pushRecent(rec);
    setRecent(storage.getRecent());
    isRedraw.current = false;
  }

  function drawAgain() {
    isRedraw.current = true;
    setWinner(null);
    setFeedback(null);
    setView("spin");
  }

  function pickSecond() {
    if (!winner) return;
    setOptions(o => o.filter(x => x.id !== winner.id));
    setWinner(null);
    setFeedback(null);
    setView("spin");
  }

  function shuffleOrder() {
    setFullOrder(shuffle(options));
    setView("order");
  }

  function goHome() {
    setView("home");
    setWinner(null);
    setSpinning(false);
    setFullOrder([]);
  }

  const totalWeight = options.reduce((s, o) => s + Math.max(1, o.weight), 0);

  return (
    <div className="min-h-screen bg-hero">
      <TopBar
        theme={theme} setTheme={setTheme}
        sound={sound} setSound={setSound}
        onStats={() => setView("stats")}
        onBack={view !== "home" ? goHome : undefined}
      />
      <main className="mx-auto max-w-md px-4 pt-2 pb-[calc(8.5rem+env(safe-area-inset-bottom))] sm:px-5">
        <AnimatePresence mode="wait">
          {view === "home" && (
            <Home key="home" recent={recent} onPickCategory={openCategory} onLoadRecent={loadRecent} />
          )}
          {view === "compose" && (
            <Compose key="compose"
              category={category}
              options={options} input={input} setInput={setInput}
              addOption={addOption} removeOption={removeOption}
              bumpWeight={bumpWeight} clearAll={clearAll}
              mode={mode} setMode={setMode}
              totalWeight={totalWeight}
              onSpin={async () => { await requestMotion(); setView("spin"); }}
              onLoadTemplate={loadTemplate}
              onShuffleOrder={shuffleOrder}
            />
          )}
          {view === "spin" && (
            <Spin key="spin"
              category={category}
              options={options} spinning={spinning} winner={winner}
              onSpin={triggerSpin} onSpinComplete={onSpinComplete}
              shake={shake}
            />
          )}
          {view === "winner" && winner && (
            <Winner key="winner" winner={winner} mode={mode} category={category}
              feedback={feedback} setFeedback={setFeedback}
              onAccept={goHome}
              onRedraw={drawAgain}
              onPickSecond={pickSecond}
              onShuffleOrder={shuffleOrder}
            />
          )}
          {view === "order" && (
            <OrderView key="order" order={fullOrder} onReshuffle={shuffleOrder} onDone={goHome} />
          )}
          {view === "stats" && <StatsView key="stats" onBack={goHome} />}
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
    <div className="sticky top-0 z-10 mx-auto flex max-w-md items-center justify-between px-4 py-3 sm:px-5">
      <button
        onClick={onBack}
        className={`grid h-9 w-9 place-items-center rounded-full glass shadow-soft transition min-[380px]:h-10 min-[380px]:w-10 ${onBack ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        aria-label="Back"
      ><ArrowLeft className="h-4 w-4" /></button>
      <div className="font-display text-lg font-bold tracking-tight">spinit</div>
      <div className="flex gap-1.5 min-[380px]:gap-2">
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
      className="grid h-9 w-9 place-items-center rounded-full glass shadow-soft transition active:scale-95 min-[380px]:h-10 min-[380px]:w-10">
      {children}
    </button>
  );
}

const CATEGORY_ORDER: Category[] = ["food", "clothes", "players", "productivity", "random", "custom"];

function Home({ recent, onPickCategory, onLoadRecent }: {
  recent: RecentDecision[];
  onPickCategory: (c: Category) => void;
  onLoadRecent: (r: RecentDecision) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
      className="space-y-6 pt-2"
    >
      <div className="text-center pt-2">
        <motion.div
          initial={{ scale: 0.4, rotate: -90 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", duration: 1 }}
          className="mx-auto mb-3 w-fit"
        >
          <StaticBall colorIndex={0} size={72} showLabel={false} />
        </motion.div>
        <h1 className="font-display text-4xl font-bold leading-tight">What are you<br />deciding today?</h1>
        <p className="mt-2 text-sm text-muted-foreground">Pick a category — Spinit will pull the answer out of the drum.</p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 min-[380px]:gap-3">
        {CATEGORY_ORDER.map((c, i) => {
          const meta = CATEGORY_META[c];
          return (
            <motion.button
              key={c}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + i * 0.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => onPickCategory(c)}
              className="group relative overflow-hidden rounded-3xl glass-strong p-3.5 text-left shadow-soft transition hover:shadow-glow min-[380px]:p-4"
            >
              <motion.div
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 2.4 + i * 0.2, repeat: Infinity }}
                className="text-2xl min-[380px]:text-3xl"
              >{meta.emoji}</motion.div>
              <p className="mt-2 font-display text-sm font-bold leading-tight min-[380px]:text-base">{meta.label}</p>
              <p className="mt-1 text-[10px] leading-snug text-muted-foreground min-[380px]:text-[11px]">{meta.tagline}</p>
            </motion.button>
          );
        })}
      </div>

      {recent.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Recent decisions</p>
          <ul className="space-y-2">
            {recent.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => onLoadRecent(r)}
                  className="flex w-full items-center gap-3 rounded-2xl glass px-4 py-3 text-left transition active:scale-[0.99]"
                >
                  <span className="text-xl">{CATEGORY_META[r.category].emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{r.winner}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {r.options.length} options · {CATEGORY_META[r.category].label}
                    </p>
                  </div>
                  <RotateCcw className="h-4 w-4 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  );
}

function Compose(props: {
  category: Category;
  options: Option[]; input: string; setInput: (v: string) => void;
  addOption: (label?: string) => void; removeOption: (id: string) => void;
  bumpWeight: (id: string, d: number) => void; clearAll: () => void;
  mode: Mode; setMode: (m: Mode) => void;
  totalWeight: number; onSpin: () => void;
  onLoadTemplate: (items: string[]) => void;
  onShuffleOrder: () => void;
}) {
  const {
    category, options, input, setInput, addOption, removeOption, bumpWeight, clearAll,
    mode, setMode, totalWeight, onSpin, onLoadTemplate, onShuffleOrder,
  } = props;
  const meta = CATEGORY_META[category];
  const placeholder = useMemo(() => {
    const ex = meta.templates[0]?.items ?? [];
    return ex[Math.floor(Math.random() * Math.max(1, ex.length))] ?? "Type anything";
  }, [meta]);

  const isPlayers = category === "players";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    addOption();
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
      className="space-y-4 min-[380px]:space-y-5"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {meta.emoji} {meta.label}
        </p>
        <h2 className="font-display text-3xl font-bold leading-tight">
          {isPlayers ? "Add your players" : "Your options"}
        </h2>
        <p className="text-sm text-muted-foreground">{meta.tagline}</p>
      </div>

      {/* Form prevents page refresh on Enter */}
      <form onSubmit={handleSubmit} className="glass rounded-3xl p-2 shadow-soft">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={isPlayers ? "Player name…" : `e.g. ${placeholder}`}
            className="flex-1 bg-transparent px-3 py-3 text-base outline-none placeholder:text-muted-foreground/80 min-[380px]:px-4"
            maxLength={40}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="grid h-11 w-11 place-items-center rounded-2xl bg-primary text-primary-foreground transition active:scale-95 disabled:opacity-40"
            aria-label="Add option"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </form>

      {/* Templates */}
      {meta.templates.length > 0 && meta.templates[0].items.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Quick templates</p>
          <div className="chip-rail -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 pr-8">
            {meta.templates.map((t) => (
              <button
                key={t.name}
                onClick={() => onLoadTemplate(t.items)}
                className="shrink-0 snap-start rounded-full glass-strong px-4 py-2 text-xs font-semibold shadow-soft active:scale-95"
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <AnimatePresence mode="popLayout">
        {options.length === 0 && (
          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground"
          >
            Your {isPlayers ? "players" : "options"} will appear here as colorful balls
          </motion.p>
        )}
      </AnimatePresence>

      {/* Visual balls — list scrolls, machine stays fixed */}
      <div className="flex max-h-[42vh] flex-wrap items-end gap-x-3 gap-y-4 overflow-y-auto overscroll-contain pr-1">

        <AnimatePresence>
          {options.map((o, i) => {
            const pct = Math.round((Math.max(1, o.weight) / totalWeight) * 100);
            return (
              <motion.div
                key={o.id}
                layout
                initial={{ scale: 0, opacity: 0 }}
                animate={{
                  scale: 1, opacity: 1,
                  y: [0, -3, 0],
                }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{
                  type: "spring", stiffness: 400, damping: 25,
                  y: { duration: 2 + (i % 3) * 0.3, repeat: Infinity, ease: "easeInOut", delay: i * 0.1 },
                }}
                className="group relative flex flex-col items-center"
              >
                <button
                  onClick={() => removeOption(o.id)}
                  className="absolute -right-1 -top-1 z-10 grid h-5 w-5 place-items-center rounded-full bg-destructive text-destructive-foreground opacity-0 shadow-soft transition group-hover:opacity-100"
                  aria-label="Remove"
                >
                  <X className="h-3 w-3" />
                </button>
                <StaticBall colorIndex={o.colorIndex} label={o.label} size={64} />
                {!isPlayers && (
                  <div className="mt-1.5 flex items-center gap-0.5 rounded-full bg-background/80 px-1 py-0.5 text-[11px] tabular-nums">
                    <button
                      onClick={() => bumpWeight(o.id, -1)}
                      className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground transition active:scale-90 hover:bg-foreground/5"
                      aria-label="Decrease weight"
                    ><Minus className="h-2.5 w-2.5" /></button>
                    <span className="w-8 text-center font-bold">{pct}%</span>
                    <button
                      onClick={() => bumpWeight(o.id, 1)}
                      className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground transition active:scale-90 hover:bg-foreground/5"
                      aria-label="Increase weight"
                    ><Plus className="h-2.5 w-2.5" /></button>
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {options.length > 0 && (
        <button onClick={clearAll} className="-mx-3 inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs text-muted-foreground hover:text-destructive">
          <Trash2 className="h-3 w-3" /> Clear all
        </button>
      )}

      {/* Mode toggle (only for non-players, non-productivity-locked) */}
      {!isPlayers && category !== "productivity" && (
        <div className="pt-2">
          <p className="mb-2 text-sm font-semibold">Mode</p>
          <div className="grid grid-cols-2 gap-2">
            <ModePick label="Free Choice" desc="Everyday picks" active={mode === "free"} onClick={() => setMode("free")} emoji="🎲" />
            <ModePick label="Productivity" desc="25-min commit" active={mode === "productivity"} onClick={() => setMode("productivity")} emoji="🎯" />
          </div>
        </div>
      )}

      <div className="sticky bottom-4 space-y-2">
        {isPlayers && options.length >= 2 && (
          <button
            onClick={onShuffleOrder}
            className="w-full rounded-full glass-strong py-3 text-sm font-semibold shadow-soft active:scale-95"
          >
            <span className="inline-flex items-center gap-2"><ListOrdered className="h-4 w-4" /> Generate full random order</span>
          </button>
        )}
        <button
          onClick={onSpin}
          disabled={options.length < 2}
          className="w-full rounded-full bg-primary py-4 text-base font-semibold text-primary-foreground shadow-glow transition active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
        >
          {options.length < 2
            ? `Add ${2 - options.length} more ${isPlayers ? "player" : "option"}${options.length === 1 ? "" : "s"}`
            : meta.cta + " →"}
        </button>
      </div>
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

function Spin({ category, options, spinning, winner, onSpin, onSpinComplete, shake }: {
  category: Category;
  options: Option[]; spinning: boolean; winner: Option | null;
  onSpin: () => void; onSpinComplete: () => void; shake: number;
}) {
  const isPlayers = category === "players";
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
      className="flex flex-col items-center gap-6 pt-4 min-[380px]:gap-8 min-[380px]:pt-6"
    >
      <div className="text-center">
        <p className="text-sm uppercase tracking-widest text-muted-foreground">{spinning ? "Drawing…" : "Ready"}</p>
        <h2 className="font-display text-2xl font-bold">{spinning ? "Hold your breath" : isPlayers ? "Who plays first?" : "Shake or spin"}</h2>
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

function Winner({ winner, mode, category, feedback, setFeedback, onAccept, onRedraw, onPickSecond, onShuffleOrder }: {
  winner: Option; mode: Mode; category: Category;
  feedback: null | "love" | "fine" | "no"; setFeedback: (f: "love" | "fine" | "no") => void;
  onAccept: () => void; onRedraw: () => void;
  onPickSecond: () => void; onShuffleOrder: () => void;
}) {
  const isPlayers = category === "players";
  const isProductivity = mode === "productivity" || category === "productivity";
  const [shared, setShared] = useState(false);

  async function share() {
    const text = isPlayers
      ? `${winner.label} plays first! — decided with spinit`
      : `spinit picked: ${winner.label}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "spinit", text });
      } else {
        await navigator.clipboard.writeText(text);
        setShared(true);
        setTimeout(() => setShared(false), 1800);
      }
    } catch { /* user dismissed */ }
  }

  const spring = { type: "spring" as const, stiffness: 220, damping: 24 };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
      transition={spring}
      className="relative flex min-h-[70vh] flex-col justify-center space-y-5 pt-4 text-center min-[380px]:space-y-7 min-[380px]:pt-6"
    >
      <Confetti />

      <div className="space-y-5">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          {isPlayers ? "Goes first" : "Your decision"}
        </p>
        <motion.div
          initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ ...spring, delay: 0.05 }}
          className="mx-auto w-fit"
        >
          <StaticBall colorIndex={winner.colorIndex} size={152} showLabel={false} />
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.15 }}
          className="font-display text-4xl font-bold leading-tight"
        >
          {winner.label}{isPlayers ? " plays first!" : ""}
        </motion.h1>
      </div>

      {isProductivity && <ProductivityTimer />}

      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.25 }}
        className="space-y-2"
      >
        <button onClick={onAccept}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary py-4 text-base font-semibold text-primary-foreground shadow-glow transition active:scale-[0.98]">
          <Check className="h-4 w-4" /> Accept
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onRedraw}
            className="inline-flex items-center justify-center gap-2 rounded-full glass-strong py-3.5 text-sm font-semibold shadow-soft transition active:scale-[0.98]">
            <RotateCcw className="h-4 w-4" /> Draw again
          </button>
          <button onClick={share}
            className="inline-flex items-center justify-center gap-2 rounded-full glass-strong py-3.5 text-sm font-semibold shadow-soft transition active:scale-[0.98]">
            <Share2 className="h-4 w-4" /> {shared ? "Copied" : "Share result"}
          </button>
        </div>
        {isPlayers && (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={onPickSecond}
              className="inline-flex items-center justify-center gap-2 rounded-full glass py-3 text-sm font-semibold transition active:scale-[0.98]">
              <Sparkles className="h-4 w-4" /> Choose 2nd
            </button>
            <button onClick={onShuffleOrder}
              className="inline-flex items-center justify-center gap-2 rounded-full glass py-3 text-sm font-semibold transition active:scale-[0.98]">
              <Shuffle className="h-4 w-4" /> Full order
            </button>
          </div>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
        className="space-y-2"
      >
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground">How does it feel?</p>
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
    </motion.div>
  );
}


function ProductivityTimer() {
  const [running, setRunning] = useState(false);
  const [secs, setSecs] = useState(25 * 60);
  useEffect(() => {
    if (!running) return;
    const i = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(i);
  }, [running]);
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
      className="mx-auto max-w-xs rounded-2xl glass p-4"
    >
      <p className="text-sm font-semibold">Focus on this for 25 minutes.</p>
      <p className="mt-2 font-display text-4xl font-bold tabular-nums">{mm}:{ss}</p>
      <div className="mt-3 flex gap-2">
        <button onClick={() => setRunning(r => !r)}
          className="flex-1 rounded-full bg-primary py-2 text-sm font-semibold text-primary-foreground active:scale-95">
          <span className="inline-flex items-center gap-1"><Timer className="h-3.5 w-3.5" /> {running ? "Pause" : "Start"}</span>
        </button>
        <button onClick={() => { setRunning(false); setSecs(25 * 60); }}
          className="rounded-full glass-strong px-4 py-2 text-sm font-semibold active:scale-95">Reset</button>
      </div>
    </motion.div>
  );
}

function OrderView({ order, onReshuffle, onDone }: { order: Option[]; onReshuffle: () => void; onDone: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
      className="space-y-5 pt-2"
    >
      <div className="text-center">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">🎮 Player order</p>
        <h2 className="font-display text-3xl font-bold">Full random order</h2>
      </div>
      <ul className="space-y-2">
        {order.map((o, i) => (
          <motion.li
            key={o.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08 }}
            className="flex items-center gap-3 rounded-2xl glass-strong p-3 shadow-soft"
          >
            <span className="font-display text-2xl font-bold tabular-nums w-8 text-center">{i + 1}</span>
            <StaticBall colorIndex={o.colorIndex} size={44} showLabel={false} />
            <span className="font-semibold">{o.label}</span>
          </motion.li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-2 pt-2">
        <button onClick={onReshuffle}
          className="inline-flex items-center justify-center gap-2 rounded-full glass-strong py-4 text-sm font-semibold shadow-soft active:scale-95">
          <Shuffle className="h-4 w-4" /> Reshuffle
        </button>
        <button onClick={onDone}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-primary py-4 text-sm font-semibold text-primary-foreground shadow-glow active:scale-95">
          <Check className="h-4 w-4" /> Done
        </button>
      </div>
    </motion.div>
  );
}

function Feel({ emoji, label, active, onClick }: { emoji: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-2 transition active:scale-95 min-[380px]:px-4 ${active ? "bg-primary text-primary-foreground shadow-soft" : "glass"}`}>
      <span className="text-2xl">{emoji}</span>
      <span className="text-[11px] font-medium">{label}</span>
    </button>
  );
}

function Confetti() {
  const reduced = typeof window !== "undefined"
    && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const pieces = useMemo(() => Array.from({ length: 12 }, () => ({
    left: 8 + Math.random() * 84,
    delay: Math.random() * 0.7,
    color: Math.floor(Math.random() * 8) + 1,
    size: 5 + Math.random() * 5,
  })), []);
  if (reduced) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p, i) => (
        <span key={i}
          className="absolute bottom-0 animate-confetti opacity-70"
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
      <div className="grid grid-cols-2 gap-2.5 min-[380px]:gap-3">
        <Stat big label="Total draws" value={stats.total} />
        <Stat big label="Redraws" value={stats.redraws} />
        <Stat label="Productivity" value={stats.productivity} />
        <Stat label="Free choice" value={stats.free} />
      </div>
      <div className="glass rounded-3xl p-4 shadow-soft min-[380px]:p-5">
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
    <div className="glass rounded-3xl p-4 shadow-soft min-[380px]:p-5">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display font-bold tabular-nums ${big ? "text-4xl" : "text-2xl"}`}>{value}</p>
    </div>
  );
}
