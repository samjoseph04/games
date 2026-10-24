(() => {
"use strict";

const ROUND_MS = 30000;
const KEYS = { q: 0, w: 1, e: 2, a: 3, s: 4, d: 5, z: 6, x: 7, c: 8 };

const $ = id => document.getElementById(id);
const ui = { grid: $("grid"), score: $("score"), time: $("time"), best: $("best"), msg: $("msg"), sound: $("sound") };
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

// state: ready | play | paused | over
const G = { state: "ready", score: 0, left: ROUND_MS, spawn: 0, targets: [], best: +store.get("popBest") || 0,
  raf: 0, last: 0, lock: 0, sound: store.get("popSound") !== "0", ctx: null };
const holes = Array.from({ length: 9 }, (_, i) => {
  const b = document.createElement("button");
  b.className = "hole"; b.dataset.i = i; b.setAttribute("aria-label", `Hole ${i + 1}`);
  return b;
});
ui.grid.replaceChildren(...holes);

/* ---------- helpers ---------- */
const life = () => Math.max(520, 1100 - G.score * 14);        // how long a dot stays
const gap = () => Math.max(260, 640 - G.score * 9);            // time between new dots
function beep(f, ms = 60) {
  if (!G.sound) return;
  try {
    const c = G.ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (c.state === "suspended") c.resume();
    const o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
    o.type = "triangle"; o.frequency.value = f;
    g.gain.setValueAtTime(.05, t); g.gain.exponentialRampToValueAtTime(.001, t + ms / 1000);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + ms / 1000);
  } catch { /* audio unavailable */ }
}
function showMsg(title, text, small = "") {
  ui.msg.innerHTML = `<b>${title}</b>${text}${small ? `<small>${small}</small>` : ""}`; ui.msg.style.opacity = 1;
}
const hideMsg = () => { ui.msg.style.opacity = 0; };
function renderHud() {
  ui.score.textContent = G.score; ui.best.textContent = G.best; ui.time.textContent = Math.max(0, Math.ceil(G.left / 1000));
}

/* ---------- game logic ---------- */
function begin() {
  holes.forEach(h => h.classList.remove("on", "hit"));
  Object.assign(G, { state: "play", score: 0, left: ROUND_MS, spawn: 300, targets: [] });
  hideMsg(); renderHud(); startLoop();
}
function popUp() {
  const free = holes.map((_, i) => i).filter(i => !G.targets.some(t => t.i === i));
  if (!free.length) return;
  const i = free[Math.floor(Math.random() * free.length)];
  G.targets.push({ i, ttl: life() }); holes[i].classList.add("on");
}
function hit(i) {
  if (G.state !== "play") return;
  const k = G.targets.findIndex(t => t.i === i);
  if (k < 0) return beep(160, 40);                          // empty hole: no penalty, just a dull tick
  G.targets.splice(k, 1);
  holes[i].classList.remove("on", "hit"); void holes[i].offsetWidth; holes[i].classList.add("hit");
  G.score++; renderHud(); beep(500 + Math.min(G.score, 30) * 18, 60);
}
function finish() {
  G.state = "over"; G.lock = performance.now() + 500; stopLoop();
  holes.forEach(h => h.classList.remove("on"));
  const record = G.score > G.best && G.score > 0;
  if (record) { G.best = G.score; store.set("popBest", G.best); }
  renderHud(); beep(record ? 880 : 300, 300);
  showMsg(`${G.score} popped`, record ? "New best!" : `Best ${G.best}`, "Tap to play again");
}
function update(dt) {
  G.left -= dt;
  if (G.left <= 0) { G.left = 0; return finish(); }
  for (let k = G.targets.length - 1; k >= 0; k--) {
    if ((G.targets[k].ttl -= dt) <= 0) { holes[G.targets[k].i].classList.remove("on"); G.targets.splice(k, 1); }
  }
  if ((G.spawn -= dt) <= 0) { popUp(); G.spawn = gap() * (.7 + Math.random() * .6); }
  const s = Math.ceil(G.left / 1000); if (ui.time.textContent != s) ui.time.textContent = s;
}

/* ---------- loop (one rAF; stopped while paused or over) ---------- */
function tick(now) {
  G.raf = requestAnimationFrame(tick);
  const dt = Math.min(50, now - (G.last || now)); G.last = now;
  update(dt);
}
const startLoop = () => { if (!G.raf) { G.last = 0; G.raf = requestAnimationFrame(tick); } };
const stopLoop = () => { cancelAnimationFrame(G.raf); G.raf = 0; };
function pause() { if (G.state !== "play") return; G.state = "paused"; stopLoop(); showMsg("Paused", "Tap or press P to resume"); }
function resume() { G.state = "play"; hideMsg(); startLoop(); }
function press() {
  if (G.state === "ready" || (G.state === "over" && performance.now() >= G.lock)) begin();
  else if (G.state === "paused") resume();
}

/* ---------- input (registered once) ---------- */
ui.grid.addEventListener("pointerdown", e => { const h = e.target.closest(".hole"); if (h && G.state === "play") { e.preventDefault(); hit(+h.dataset.i); } });
ui.msg.parentElement.addEventListener("pointerdown", e => { if (G.state !== "play" && !e.target.closest(".hole")) press(); });
ui.grid.addEventListener("keydown", e => { if ((e.key === " " || e.key === "Enter") && G.state !== "play") { e.preventDefault(); e.stopPropagation(); press(); } });
addEventListener("keydown", e => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  const k = e.key.toLowerCase();
  if (k in KEYS) hit(KEYS[k]);
  else if (k === "p" || k === "escape") { G.state === "play" ? pause() : G.state === "paused" && resume(); }
  else if ((k === " " || k === "enter") && !e.target.closest?.("button")) { e.preventDefault(); press(); }
});
ui.sound.addEventListener("click", e => {
  G.sound = !G.sound; store.set("popSound", G.sound ? "1" : "0");
  ui.sound.textContent = G.sound ? "Sound on" : "Sound off"; if (e.detail > 0) ui.sound.blur(); beep(440, 80);
});
document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
addEventListener("blur", pause);

ui.sound.textContent = G.sound ? "Sound on" : "Sound off";
renderHud();
})();
