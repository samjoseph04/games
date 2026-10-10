(() => {
"use strict";

/* ---------- Constants (logical units: 360 x 600, px and ms) ---------- */
const W = 360, H = 600, GY = H - 50;
const BX = 100, R = 12, GRAV = .0016, FLAP = -.5;
const PW = 56, SPACING = 210;

const $ = id => document.getElementById(id);
const cv = $("c"), ctx = cv.getContext("2d"), stage = $("stage");
const ui = { score: $("score"), best: $("best"), msg: $("msg"), sound: $("sound") };
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

// state: ready | play | paused | over
const G = { state: "ready", y: H * .42, vy: 0, t: 0, score: 0, best: +store.get("glideBest") || 0,
  pipes: [], raf: 0, last: 0, lock: 0, sound: store.get("glideSound") !== "0", ctx: null, hit: false };
let theme = { ink: "#232b2a", good: "#2fa38f", bad: "#e8665a" };

/* ---------- helpers ---------- */
const speed = () => Math.min(.16 + G.score * .0035, .27);
const gap = () => Math.max(118, 160 - G.score * 1.5);
function readTheme() {
  const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
  theme = { ink: v("--ink") || theme.ink, good: v("--good") || theme.good, bad: v("--bad") || theme.bad };
}
function fit() {
  const r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
  cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d);
}
function beep(f, ms = 90, type = "triangle") {
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
function renderHud() { ui.score.textContent = G.score; ui.best.textContent = G.best ? "Best " + G.best : ""; }

/* ---------- game logic ---------- */
function reset() {
  Object.assign(G, { y: H * .42, vy: 0, t: 0, score: 0, pipes: [], hit: false });
  renderHud();
}
function flap() { G.vy = FLAP; beep(520, 70); }
function addPipe() {
  const prev = G.pipes[G.pipes.length - 1], g = gap();
  const lo = 90 + g / 2, hi = GY - 90 - g / 2;
  const base = prev ? prev.gy : (lo + hi) / 2;
  const gy = Math.max(lo, Math.min(hi, base + (Math.random() * 2 - 1) * 150));   // limit the jump so gaps stay reachable
  G.pipes.push({ x: W + 20, gy, gap: g, passed: false });
}
function die() {
  G.state = "over"; G.hit = true; G.lock = performance.now() + 500;
  if (G.score > G.best) { G.best = G.score; store.set("glideBest", G.best); }
  renderHud(); beep(140, 300, "sawtooth");
  showMsg(`${G.score} ${G.score === 1 ? "gap" : "gaps"}`, G.score && G.score >= G.best ? "New best!" : `Best ${G.best}`, "Tap to try again");
}
function update(dt) {
  G.t += dt;
  G.vy += GRAV * dt; G.y += G.vy * dt;
  if (G.y < R) { G.y = R; G.vy = 0; }
  if (G.y + R >= GY) { G.y = GY - R; return die(); }

  const last = G.pipes[G.pipes.length - 1];
  if (!last || last.x < W - SPACING) addPipe();
  const v = speed() * dt;
  for (const p of G.pipes) {
    p.x -= v;
    if (Math.abs(BX - (p.x + PW / 2)) < PW / 2 + R - 2 && (G.y - R + 2 < p.gy - p.gap / 2 || G.y + R - 2 > p.gy + p.gap / 2)) return die();
    if (!p.passed && p.x + PW < BX - R) { p.passed = true; G.score++; renderHud(); beep(760, 80); }
  }
  if (G.pipes[0] && G.pipes[0].x + PW < -10) G.pipes.shift();
}

/* ---------- rendering ---------- */
function draw() {
  const s = cv.width / W;
  ctx.setTransform(s, 0, 0, s, 0, 0); ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = theme.good;
  for (const p of G.pipes) {
    const top = p.gy - p.gap / 2, bot = p.gy + p.gap / 2;
    ctx.beginPath(); ctx.roundRect(p.x, -20, PW, top + 20, [0, 0, 12, 12]); ctx.fill();
    ctx.beginPath(); ctx.roundRect(p.x, bot, PW, GY - bot, [12, 12, 0, 0]); ctx.fill();
  }
  ctx.strokeStyle = theme.ink; ctx.globalAlpha = .3; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, GY); ctx.lineTo(W, GY); ctx.stroke(); ctx.globalAlpha = 1;
  const bob = G.state === "ready" ? Math.sin(G.t * .004) * 8 : 0;
  ctx.fillStyle = G.hit ? theme.bad : theme.ink;
  ctx.beginPath(); ctx.arc(BX, G.y + bob, R, 0, Math.PI * 2); ctx.fill();
}

/* ---------- loop (one rAF; stopped while paused) ---------- */
function tick(now) {
  G.raf = requestAnimationFrame(tick);
  const dt = Math.min(40, now - (G.last || now)); G.last = now;
  if (G.state === "play") update(dt);
  else if (G.state === "ready") G.t += dt;
  draw();
}
function startLoop() { if (!G.raf) { G.last = 0; G.raf = requestAnimationFrame(tick); } }
function stopLoop() { cancelAnimationFrame(G.raf); G.raf = 0; }

function pause() {
  if (G.state !== "play") return;
  G.state = "paused"; stopLoop(); showMsg("Paused", "Tap or press P to resume");
}
function resume() { G.state = "play"; ui.msg.style.opacity = 0; startLoop(); }
function action() {
  if (G.state === "ready") { reset(); G.state = "play"; ui.msg.style.opacity = 0; flap(); }
  else if (G.state === "play") flap();
  else if (G.state === "paused") resume();
  else if (G.state === "over" && performance.now() >= G.lock) { reset(); G.state = "play"; ui.msg.style.opacity = 0; flap(); }
}

/* ---------- input (registered once) ---------- */
stage.addEventListener("pointerdown", e => { if (e.target === ui.sound) return; e.preventDefault(); action(); });
addEventListener("keydown", e => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if ([" ", "ArrowUp", "w", "Enter"].includes(k) && !e.target.closest?.("button")) { e.preventDefault(); action(); }
  else if (k === "p" || k === "Escape") { G.state === "play" ? pause() : G.state === "paused" && resume(); }
});
ui.sound.addEventListener("click", e => {
  G.sound = !G.sound; store.set("glideSound", G.sound ? "1" : "0");
  ui.sound.textContent = G.sound ? "Sound on" : "Sound off"; if (e.detail > 0) ui.sound.blur(); beep(440, 80);
});
document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
addEventListener("blur", pause);
addEventListener("resize", fit);
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", readTheme);

/* ---------- init ---------- */
ui.sound.textContent = G.sound ? "Sound on" : "Sound off";
readTheme(); fit(); renderHud(); startLoop();
})();
