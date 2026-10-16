(() => {
"use strict";

/* ---------- Constants (logical units: 360 x 600, px and ms) ---------- */
const W = 360, H = 600, PW = 72, PH = 10, R = 7, YOU_Y = H - 44, AI_Y = 34, TARGET = 7;
const START_SPEED = .30, HIT_BOOST = .014, MAX_SPEED = .62, SUBSTEP = 4;

const $ = id => document.getElementById(id);
const cv = $("c"), ctx = cv.getContext("2d"), stage = $("stage");
const ui = { ai: $("ai"), you: $("you"), wins: $("wins"), msg: $("msg"), sound: $("sound") };
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

// state: ready | play | paused | over     (serve pause is handled by G.wait inside "play")
const G = { state: "ready", px: W / 2, tx: W / 2, ax: W / 2, aiErr: 0, bx: W / 2, by: H / 2, vx: 0, vy: 0, speed: START_SPEED,
  you: 0, ai: 0, wait: 0, dir: 1, key: 0, raf: 0, last: 0, lock: 0, wins: +store.get("rallyWins") || 0,
  sound: store.get("rallySound") !== "0", ctx: null };
let theme = { ink: "#232b2a", good: "#2fa38f", bad: "#e8665a" };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const aiSpeed = () => .21 + G.you * .012;   // gets a little quicker as you pull ahead

/* ---------- helpers ---------- */
function readTheme() {
  const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
  theme = { ink: v("--ink") || theme.ink, good: v("--good") || theme.good, bad: v("--bad") || theme.bad };
}
function fit() {
  const r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
  cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); draw();
}
function beep(f, ms = 60, type = "triangle") {
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
function renderHud() {
  ui.ai.textContent = G.ai; ui.you.textContent = G.you;
  ui.wins.textContent = G.wins ? `Wins ${G.wins}` : "";
}

/* ---------- game logic ---------- */
function serve(dir) {
  Object.assign(G, { bx: W / 2, by: H / 2, vx: 0, vy: 0, speed: START_SPEED, wait: 700, dir });
}
function launch() {
  const a = (Math.random() * 2 - 1) * .35;
  G.vx = Math.sin(a) * G.speed; G.vy = G.dir * Math.cos(a) * G.speed;
}
function newMatch() {
  Object.assign(G, { you: 0, ai: 0, px: W / 2, tx: W / 2, ax: W / 2, aiErr: 0 });
  serve(Math.random() < .5 ? 1 : -1); renderHud();
}
function bounce(paddleX, dirY) {   // hit offset steers the ball; every hit speeds it up
  const off = clamp((G.bx - paddleX) / (PW / 2 + R), -1, 1);
  G.speed = Math.min(MAX_SPEED, G.speed + HIT_BOOST);
  G.vx = off * G.speed * .85;
  G.vy = dirY * Math.sqrt(G.speed * G.speed - G.vx * G.vx);
  beep(dirY < 0 ? 520 : 400);
}
function point(byYou) {
  if (byYou) G.you++; else G.ai++;
  renderHud(); beep(byYou ? 700 : 200, 160);
  if (G.you >= TARGET || G.ai >= TARGET) return finish();
  serve(byYou ? -1 : 1);          // serve toward whoever just conceded
}
function finish() {
  G.state = "over"; G.lock = performance.now() + 500;
  const won = G.you > G.ai;
  if (won) { G.wins++; store.set("rallyWins", G.wins); renderHud(); }
  beep(won ? 880 : 140, 350, won ? "triangle" : "sawtooth");
  showMsg(won ? "You win" : "AI wins", `${G.you} – ${G.ai}`, "Tap to play again"); G.aiErr = 0;
}
function stepBall(h) {
  G.bx += G.vx * h; G.by += G.vy * h;
  if (G.bx < R) { G.bx = R; G.vx = Math.abs(G.vx); beep(300, 30); }
  if (G.bx > W - R) { G.bx = W - R; G.vx = -Math.abs(G.vx); beep(300, 30); }
  if (G.vy > 0 && G.by + R >= YOU_Y && G.by - R <= YOU_Y + PH && Math.abs(G.bx - G.px) <= PW / 2 + R * .6) {
    G.by = YOU_Y - R; bounce(G.px, -1); G.aiErr = (Math.random() * 2 - 1) * 26;
  } else if (G.vy < 0 && G.by - R <= AI_Y + PH && G.by + R >= AI_Y && Math.abs(G.bx - G.ax) <= PW / 2 + R * .6) {
    G.by = AI_Y + PH + R; bounce(G.ax, 1);
  }
  if (G.by > H + R * 2) return point(false);
  if (G.by < -R * 2) return point(true);
}
function update(dt) {
  if (G.key) G.tx = clamp(G.tx + G.key * .55 * dt, PW / 2, W - PW / 2);
  G.px += (G.tx - G.px) * Math.min(1, dt * .03);
  const target = G.vy < 0 ? G.bx + G.aiErr : W / 2, step = aiSpeed() * dt;
  G.ax = clamp(G.ax + clamp(target - G.ax, -step, step), PW / 2, W - PW / 2);
  if (G.wait > 0) { if ((G.wait -= dt) <= 0) launch(); return; }
  for (let left = dt; left > 0 && G.state === "play" && G.wait <= 0; left -= SUBSTEP) stepBall(Math.min(SUBSTEP, left));
}

/* ---------- rendering ---------- */
function draw() {
  const s = cv.width / W;
  ctx.setTransform(s, 0, 0, s, 0, 0); ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = theme.ink; ctx.globalAlpha = .15; ctx.lineWidth = 2; ctx.setLineDash([8, 10]);
  ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  ctx.fillStyle = theme.ink;
  ctx.globalAlpha = .55; ctx.beginPath(); ctx.roundRect(G.ax - PW / 2, AI_Y, PW, PH, 5); ctx.fill(); ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.roundRect(G.px - PW / 2, YOU_Y, PW, PH, 5); ctx.fill();
  ctx.fillStyle = G.wait > 0 ? theme.good : theme.bad;
  ctx.globalAlpha = G.wait > 0 ? .5 : 1; ctx.beginPath(); ctx.arc(G.bx, G.by, R, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
}

/* ---------- loop (one rAF; stopped while paused) ---------- */
function tick(now) {
  G.raf = requestAnimationFrame(tick);
  const dt = Math.min(40, now - (G.last || now)); G.last = now;
  if (G.state === "play") update(dt);
  draw();
}
const startLoop = () => { if (!G.raf) { G.last = 0; G.raf = requestAnimationFrame(tick); } };
const stopLoop = () => { cancelAnimationFrame(G.raf); G.raf = 0; };

function begin() { newMatch(); G.state = "play"; hideMsg(); }
function pause() { if (G.state !== "play") return; G.state = "paused"; stopLoop(); draw(); showMsg("Paused", "Tap or press P to resume"); }
function resume() { G.state = "play"; hideMsg(); startLoop(); }
function press() {
  if (G.state === "ready" || (G.state === "over" && performance.now() >= G.lock)) begin();
  else if (G.state === "paused") resume();
}

/* ---------- input (registered once) ---------- */
function pointerX(e) {
  const r = cv.getBoundingClientRect();
  G.tx = clamp((e.clientX - r.left) / r.width * W, PW / 2, W - PW / 2);
}
stage.addEventListener("pointermove", pointerX);
stage.addEventListener("pointerdown", e => { if (e.target === ui.sound) return; pointerX(e); press(); });
addEventListener("keydown", e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === "ArrowLeft" || k === "a") { e.preventDefault(); G.key = -1; }
  else if (k === "ArrowRight" || k === "d") { e.preventDefault(); G.key = 1; }
  else if (e.repeat) return;
  else if ((k === " " || k === "Enter") && !e.target.closest?.("button")) { e.preventDefault(); press(); }
  else if (k === "p" || k === "Escape") { G.state === "play" ? pause() : G.state === "paused" && resume(); }
});
addEventListener("keyup", e => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if ((k === "ArrowLeft" || k === "a") && G.key < 0) G.key = 0;
  if ((k === "ArrowRight" || k === "d") && G.key > 0) G.key = 0;
});
ui.sound.addEventListener("click", e => {
  G.sound = !G.sound; store.set("rallySound", G.sound ? "1" : "0");
  ui.sound.textContent = G.sound ? "Sound on" : "Sound off"; if (e.detail > 0) ui.sound.blur(); beep(440, 80);
});
document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
addEventListener("blur", () => { G.key = 0; pause(); });
addEventListener("resize", fit);
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", readTheme);

/* ---------- init ---------- */
ui.sound.textContent = G.sound ? "Sound on" : "Sound off";
readTheme(); fit(); renderHud(); startLoop();
})();
