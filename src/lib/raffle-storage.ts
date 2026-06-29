export type Mode = "productivity" | "free";

export interface Option {
  id: string;
  label: string;
  weight: number;
  colorIndex: number;
}

export interface Stats {
  total: number;
  redraws: number;
  productivity: number;
  free: number;
  picks: Record<string, number>;
}

const KEY_OPTIONS = "rd:options";
const KEY_MODE = "rd:mode";
const KEY_STATS = "rd:stats";
const KEY_SOUND = "rd:sound";
const KEY_THEME = "rd:theme";

const defaultStats: Stats = { total: 0, redraws: 0, productivity: 0, free: 0, picks: {} };

export const storage = {
  getOptions(): Option[] {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(KEY_OPTIONS) || "[]"); } catch { return []; }
  },
  setOptions(o: Option[]) { localStorage.setItem(KEY_OPTIONS, JSON.stringify(o)); },
  getMode(): Mode {
    if (typeof window === "undefined") return "free";
    return (localStorage.getItem(KEY_MODE) as Mode) || "free";
  },
  setMode(m: Mode) { localStorage.setItem(KEY_MODE, m); },
  getStats(): Stats {
    if (typeof window === "undefined") return defaultStats;
    try { return { ...defaultStats, ...JSON.parse(localStorage.getItem(KEY_STATS) || "{}") }; } catch { return defaultStats; }
  },
  setStats(s: Stats) { localStorage.setItem(KEY_STATS, JSON.stringify(s)); },
  getSound(): boolean {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(KEY_SOUND) === "1";
  },
  setSound(v: boolean) { localStorage.setItem(KEY_SOUND, v ? "1" : "0"); },
  getTheme(): "light" | "dark" {
    if (typeof window === "undefined") return "light";
    return (localStorage.getItem(KEY_THEME) as "light" | "dark") ||
      (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  },
  setTheme(t: "light" | "dark") { localStorage.setItem(KEY_THEME, t); },
};

export function weightedPick(options: Option[]): Option {
  const total = options.reduce((s, o) => s + Math.max(1, o.weight), 0);
  let r = Math.random() * total;
  for (const o of options) {
    r -= Math.max(1, o.weight);
    if (r <= 0) return o;
  }
  return options[options.length - 1];
}
