export type Mode = "productivity" | "free";
export type Category = "food" | "clothes" | "players" | "productivity" | "random" | "custom";

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

export interface RecentDecision {
  id: string;
  category: Category;
  winner: string;
  options: string[];
  at: number;
}

const KEY_OPTIONS = "spinit:options";
const KEY_INPUT = "spinit:input";
const KEY_CATEGORY = "spinit:category";
const KEY_MODE = "spinit:mode";
const KEY_STATS = "spinit:stats";
const KEY_SOUND = "spinit:sound";
const KEY_THEME = "spinit:theme";
const KEY_RECENT = "spinit:recent";

const defaultStats: Stats = { total: 0, redraws: 0, productivity: 0, free: 0, picks: {} };

function safeGet<T>(k: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
function safeSet(k: string, v: unknown) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
}

export const storage = {
  getOptions(): Option[] { return safeGet<Option[]>(KEY_OPTIONS, []); },
  setOptions(o: Option[]) { safeSet(KEY_OPTIONS, o); },
  getInput(): string { return safeGet<string>(KEY_INPUT, ""); },
  setInput(v: string) { safeSet(KEY_INPUT, v); },
  getCategory(): Category | null { return safeGet<Category | null>(KEY_CATEGORY, null); },
  setCategory(c: Category | null) { safeSet(KEY_CATEGORY, c); },
  getMode(): Mode {
    if (typeof window === "undefined") return "free";
    return (localStorage.getItem(KEY_MODE) as Mode) || "free";
  },
  setMode(m: Mode) { if (typeof window !== "undefined") localStorage.setItem(KEY_MODE, m); },
  getStats(): Stats { return { ...defaultStats, ...safeGet<Partial<Stats>>(KEY_STATS, {}) }; },
  setStats(s: Stats) { safeSet(KEY_STATS, s); },
  getSound(): boolean {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(KEY_SOUND) === "1";
  },
  setSound(v: boolean) { if (typeof window !== "undefined") localStorage.setItem(KEY_SOUND, v ? "1" : "0"); },
  getTheme(): "light" | "dark" {
    if (typeof window === "undefined") return "light";
    return (localStorage.getItem(KEY_THEME) as "light" | "dark") ||
      (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  },
  setTheme(t: "light" | "dark") { if (typeof window !== "undefined") localStorage.setItem(KEY_THEME, t); },
  getRecent(): RecentDecision[] { return safeGet<RecentDecision[]>(KEY_RECENT, []); },
  pushRecent(r: RecentDecision) {
    const list = [r, ...safeGet<RecentDecision[]>(KEY_RECENT, [])].slice(0, 6);
    safeSet(KEY_RECENT, list);
  },
  clearRecent() { safeSet(KEY_RECENT, []); },
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

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const CATEGORY_META: Record<Category, {
  label: string; emoji: string; tagline: string; cta: string;
  templates: { name: string; items: string[] }[];
}> = {
  food: {
    label: "Food", emoji: "🍕", tagline: "What's on the menu tonight?", cta: "Start Food Draw",
    templates: [
      { name: "Breakfast", items: ["Pancakes", "Omelette", "Cereal", "Avocado toast", "Smoothie"] },
      { name: "Lunch", items: ["Salad", "Sandwich", "Pasta", "Rice bowl"] },
      { name: "Dinner", items: ["Pizza", "Burger", "Shawarma", "Fried Rice", "Sushi"] },
      { name: "Fast Food", items: ["Pizza", "Burger", "Tacos", "Fried chicken"] },
      { name: "Restaurants", items: ["Italian", "Japanese", "Mexican", "Indian", "Thai"] },
      { name: "Desserts", items: ["Ice cream", "Cake", "Brownies", "Donuts", "Cookies"] },
    ],
  },
  clothes: {
    label: "Clothes", emoji: "👕", tagline: "Outfit picker — let the drum dress you.", cta: "Start Outfit Draw",
    templates: [
      { name: "Outfit", items: ["Blue Hoodie", "Black Shirt", "White Tee", "Denim Jacket"] },
      { name: "Shoes", items: ["Sneakers", "Boots", "Loafers", "Sandals"] },
      { name: "Jacket", items: ["Denim", "Leather", "Bomber", "Trench"] },
      { name: "Accessories", items: ["Watch", "Cap", "Sunglasses", "Necklace"] },
    ],
  },
  players: {
    label: "Who Plays First?", emoji: "🎮", tagline: "Board games, FIFA, cards — settle it fair.", cta: "Pick First Player",
    templates: [
      { name: "Players", items: ["David", "Sarah", "James", "Emma"] },
      { name: "Teams", items: ["Team Red", "Team Blue"] },
      { name: "Roles", items: ["Attacker", "Defender", "Support", "Scout"] },
      { name: "Who Starts?", items: ["Player 1", "Player 2", "Player 3", "Player 4"] },
    ],
  },
  productivity: {
    label: "Productivity", emoji: "✅", tagline: "Pick one task. Focus 25 minutes.", cta: "Pick My Task",
    templates: [
      { name: "Homework", items: ["Math", "Essay", "Reading", "Notes"] },
      { name: "Study", items: ["Flashcards", "Practice problems", "Re-read chapter", "Watch lecture"] },
      { name: "Work", items: ["Emails", "Deep work", "Code review", "Planning"] },
      { name: "Cleaning", items: ["Dishes", "Laundry", "Tidy room", "Vacuum", "Trash"] },
      { name: "Exercise", items: ["Run", "Yoga", "Push-ups", "Stretch", "Walk"] },
    ],
  },
  random: {
    label: "Random Choice", emoji: "🎲", tagline: "Anything you're torn between.", cta: "Start the Draw",
    templates: [
      { name: "Vacation", items: ["Beach", "Mountains", "City trip", "Road trip"] },
      { name: "Weekend", items: ["Stay in", "Hike", "Brunch", "Museum", "Friends over"] },
      { name: "Movies", items: ["Comedy", "Thriller", "Drama", "Documentary", "Animation"] },
      { name: "Date ideas", items: ["Picnic", "Cinema", "Cooking class", "Mini golf"] },
    ],
  },
  custom: {
    label: "Custom Decision", emoji: "✨", tagline: "Blank canvas — type absolutely anything.", cta: "Start the Draw",
    templates: [
      { name: "Blank", items: [] },
    ],
  },
};
