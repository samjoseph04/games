(() => {
"use strict";

const N = 20, CELL = 20, SIZE = N * CELL, SWIPE = 22;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const KEYS = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right" };

const $ = id => document.getElementById(id);
const cv = $("c"), ctx = cv.getContext("2d"), stage = $("stage");
const ui = { score: $("score"), best: $("best"), msg: $("msg"), sound: $("sound") };
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

// state: ready | play | paused | over | won
const G = { state: "ready", snake: [], dir: [1, 0], queue: [], food: [0, 0], acc: 0, score: 0, best: +store.get("slitherBest") || 0,
  raf: 0, last: 0, lock: 0, sound: store.get("slitherSound") !== "0", ctx: null };
let theme = { ink: "#232b2a", good: "#2fa38f", bad: "#e8665a" };
const stepMs = () => Math.max(70, 140 - G.score * 2.5);

/* ---------- helpers ---------- */
function readTheme() {
  const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
  theme = { ink: v("--ink") || theme.ink, good: v("--good") || theme.good, bad: v("--bad") || theme.bad };
}
function fit() {
  const r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
  cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); draw();
}
function beep(f, ms = 80, type = "triangle") {
  if (!G.sound) return;
  try {
    const c = G.ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (c.state === "suspended") c.resume();
    const o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(.05, t); g.gain.exponentialRampToValueAtTime(.001, t + ms / 1000);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + ms / 1000);
  } catch { /* audio unavailable */ }
}
function showMsg(title, text, small = "") {
  ui.msg.innerHTML = `<b>${title}</b>${text}${small ? `<small>${small}</small>` : ""}`; ui.msg.style.opacity = 1;
}
const hideMsg = () => { ui.msg.style.opacity = 0; };
function renderHud() { ui.score.textContent = G.score; ui.best.textContent = G.best; }

/* ---------- game logic ---------- */
function placeFood() {
  const free = [];
  for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) if (!G.snake.some(s => s[0] === x && s[1] === y)) free.push([x, y]);
  if (!free.length) return false;
  G.food = free[Math.floor(Math.random() * free.length)]; return true;
}
function reset() {
  const m = N >> 1;
  Object.assign(G, { snake: [[m, m], [m - 1, m], [m - 2, m]], dir: [1, 0], queue: [], acc: 0, score: 0 });
  placeFood(); renderHud();
}
function turn(name) {
  const d = DIRS[name], ref = G.queue[G.queue.length - 1] || G.dir;
  if ((d[0] === -ref[0] && d[1] === -ref[1]) || (d[0] === ref[0] && d[1] === ref[1])) return;   // no reversing, no repeats
  if (G.queue.length < 2) G.queue.push(d);
}
function end(kind) {
  G.state = kind; G.lock = performance.now() + 400;
  if (G.score > G.best) { G.best = G.score; store.set("slitherBest", G.best); }
  renderHud(); draw();
  if (kind === "won") { beep(880, 300); showMsg("Perfect!", `Board filled · ${G.score}`, "Tap to play again"); }
  else { beep(140, 300, "sawtooth"); showMsg(`${G.score} eaten`, G.score && G.score >= G.best ? "New best!" : `Best ${G.best}`, "Tap to play again"); }
}
function step() {
  if (G.queue.length) G.dir = G.queue.shift();
  const h = G.snake[0], nx = h[0] + G.dir[0], ny = h[1] + G.dir[1];
  const eat = nx === G.food[0] && ny === G.food[1];
  const body = eat ? G.snake : G.snake.slice(0, -1);       // the tail cell is free when the snake isn't growing
  if (nx < 0 || ny < 0 || nx >= N || ny >= N || body.some(s => s[0] === nx && s[1] === ny)) return end("over");
  G.snake.unshift([nx, ny]);
  if (eat) {
    G.score++; renderHud(); beep(600 + Math.min(G.score, 20) * 12, 70);
    if (!placeFood()) return end("won");
  } else G.snake.pop();
}

/* ---------- rendering ---------- */
function draw() {
  const s = cv.width / SIZE;
  ctx.setTransform(s, 0, 0, s, 0, 0); ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = theme.ink; ctx.globalAlpha = .08;
  for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) { ctx.beginPath(); ctx.arc(x * CELL + CELL / 2, y * CELL + CELL / 2, 1.2, 0, 6.3); ctx.fill(); }
  ctx.globalAlpha = 1;
  ctx.fillStyle = theme.bad; ctx.beginPath(); ctx.arc(G.food[0] * CELL + CELL / 2, G.food[1] * CELL + CELL / 2, CELL * .32, 0, 6.3); ctx.fill();
  const n = G.snake.length;
  G.snake.forEach((p, i) => {
    ctx.globalAlpha = i === 0 ? 1 : Math.max(.45, 1 - i / (n + 6));
    ctx.fillStyle = i === 0 && G.state === "over" ? theme.bad : theme.good;
    ctx.beginPath(); ctx.roundRect(p[0] * CELL + 1.5, p[1] * CELL + 1.5, CELL - 3, CELL - 3, i === 0 ? 7 : 5); ctx.fill();
  });
  ctx.globalAlpha = 1;
}

/* ---------- loop (one rAF; stopped while paused) ---------- */
function tick(now) {
  G.raf = requestAnimationFrame(tick);
  const dt = Math.min(100, now - (G.last || now)); G.last = now;
  if (G.state === "play") {
    G.acc += dt;
    while (G.state === "play" && G.acc >= stepMs()) { G.acc -= stepMs(); step(); }
    draw();
  }
}
const startLoop = () => { if (!G.raf) { G.last = 0; G.raf = requestAnimationFrame(tick); } };
const stopLoop = () => { cancelAnimationFrame(G.raf); G.raf = 0; };

function begin() { reset(); G.state = "play"; hideMsg(); draw(); startLoop(); }
function pause() { if (G.state !== "play") return; G.state = "paused"; stopLoop(); showMsg("Paused", "Tap or press P to resume"); }
function resume() { G.state = "play"; hideMsg(); startLoop(); }
function press() {
  if (G.state === "ready") begin();
  else if (G.state === "paused") resume();
  else if ((G.state === "over" || G.state === "won") && performance.now() >= G.lock) begin();
}

/* ---------- input (registered once) ---------- */
addEventListener("keydown", e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key, d = KEYS[k];
  if (d) { e.preventDefault(); if (G.state === "ready") begin(); if (G.state === "play" && !e.repeat) turn(d); }
  else if (e.repeat) return;
  else if ((k === " " || k === "Enter") && !e.target.closest?.("button")) { e.preventDefault(); press(); }
  else if (k === "p" || k === "Escape") { G.state === "play" ? pause() : G.state === "paused" && resume(); }
});
let anchor = null;
stage.addEventListener("pointerdown", e => { anchor = { x: e.clientX, y: e.clientY, moved: false }; });
stage.addEventListener("pointermove", e => {
  if (!anchor || G.state !== "play") return;
  const dx = e.clientX - anchor.x, dy = e.clientY - anchor.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE) return;
  turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
  anchor = { x: e.clientX, y: e.clientY, moved: true };
});
stage.addEventListener("pointerup", () => { if (anchor && !anchor.moved) press(); anchor = null; });
stage.addEventListener("pointercancel", () => { anchor = null; });
ui.sound.addEventListener("click", e => {
  G.sound = !G.sound; store.set("slitherSound", G.sound ? "1" : "0");
  ui.sound.textContent = G.sound ? "Sound on" : "Sound off"; if (e.detail > 0) ui.sound.blur(); beep(440, 80);
});
document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
addEventListener("blur", pause);
addEventListener("resize", fit);
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { readTheme(); draw(); });

/* ---------- init ---------- */
ui.sound.textContent = G.sound ? "Sound on" : "Sound off";
readTheme(); reset(); fit();
})();
