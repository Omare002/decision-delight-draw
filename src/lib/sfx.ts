// Simple WebAudio-based sound effects, no assets needed.
let ctx: AudioContext | null = null;

function getCtx() {
  if (typeof window === "undefined") return null;
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  return ctx;
}

export const sfx = {
  enabled: false,
  bounce() {
    if (!this.enabled) return;
    const c = getCtx(); if (!c) return;
    const o = c.createOscillator(); const g = c.createGain();
    o.frequency.value = 200 + Math.random() * 400;
    o.type = "triangle";
    g.gain.value = 0.05;
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.08);
    o.connect(g); g.connect(c.destination);
    o.start(); o.stop(c.currentTime + 0.08);
  },
  spin() {
    if (!this.enabled) return;
    const c = getCtx(); if (!c) return;
    const o = c.createOscillator(); const g = c.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(80, c.currentTime);
    o.frequency.linearRampToValueAtTime(300, c.currentTime + 4);
    g.gain.value = 0.04;
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 4.5);
    o.connect(g); g.connect(c.destination);
    o.start(); o.stop(c.currentTime + 4.5);
  },
  win() {
    if (!this.enabled) return;
    const c = getCtx(); if (!c) return;
    [523, 659, 784, 1047].forEach((f, i) => {
      const o = c.createOscillator(); const g = c.createGain();
      o.frequency.value = f; o.type = "sine";
      g.gain.value = 0;
      g.gain.linearRampToValueAtTime(0.15, c.currentTime + 0.05 + i * 0.1);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.6 + i * 0.1);
      o.connect(g); g.connect(c.destination);
      o.start(c.currentTime + i * 0.1); o.stop(c.currentTime + 0.7 + i * 0.1);
    });
  },
};
