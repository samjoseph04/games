(() => {
"use strict";

const W = 300, H = 500, PY = H - 56, PH = 14, R = 11;
const cv = document.getElementById("c"), ctx = cv.getContext("2d");
const $ = id => document.getElementById(id);
const ui = { score: $("score"), best: $("best"), msg: $("msg"), lives: [...document.querySelectorAll("#lives i")], stage: $("stage") };

const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

// state: ready | play | paused | over
const G = { state: "ready", score: 0, lives: 3, best: +store.get("dropBest") || 0,
  items: [], px: W / 2, tx: W / 2, pw: 68, spawn: 0, pulse: 0, raf: 0, last: 0, lock: 0, dir: 0 };
const keys = { left: false, right: false };
let theme = {};

/* ---------- helpers ---------- */
function readTheme() {
  const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
  theme = { ink: v("--ink"), good: v("--good"), bad: v("--bad") };
}
function fit() {
  const r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
  cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d);
  draw();
}
const fallSpeed = () => Math.min(.12 + G.score * .0018, .34);
const spawnGap = () => Math.max(380, 900 - G.score * 9);
const badChance = () => Math.min(.22 + G.score * .003, .38);

function renderHud() {
  ui.score.textContent = G.score;
  ui.best.textContent = G.best ? "Best " + G.best : "";
  ui.lives.forEach((el, i) => el.classList.toggle("lost", i >= G.lives));
}
function message(title, text, small = "") {
  ui.msg.innerHTML = `<b>${title}</b>${text}${small ? `<small>${small}</small>` : ""}`;
  ui.msg.style.opacity = 1;
}

/* ---------- game logic ---------- */
function reset() {
  Object.assign(G, { score: 0, lives: 3, items: [], px: W / 2, tx: W / 2, spawn: 0, pulse: 0 });
  renderHud();
}
function loseLife() {
  G.lives--; G.pulse = -1; renderHud();
  if (G.lives <= 0) finish();
}
function finish() {
  G.state = "over"; G.lock = performance.now() + 500;
  if (G.score > G.best) { G.best = G.score; store.set("dropBest", G.best); }
  renderHud();
  message(`${G.score} caught`, "Tap to play again");
}
function update(dt) {
  // paddle
  const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  if (dir) G.tx = Math.max(G.pw / 2, Math.min(W - G.pw / 2, G.tx + dir * .5 * dt));
  G.px += (G.tx - G.px) * Math.min(1, dt * .02);
  G.pulse *= Math.pow(.992, dt);

  // spawn
  G.spawn += dt;
  if (G.spawn >= spawnGap()) {
    G.spawn = 0;
    G.items.push({ x: R + Math.random() * (W - 2 * R), y: -R, bad: Math.random() < badChance() });
  }

  // items
  const v = fallSpeed();
  for (let i = G.items.length - 1; i >= 0; i--) {
    const it = G.items[i], prev = it.y;
    it.y += v * dt;
    const crossed = prev + R <= PY && it.y + R >= PY && Math.abs(it.x - G.px) <= G.pw / 2 + R * .6;
    if (crossed) {
      G.items.splice(i, 1);
      if (it.bad) { loseLife(); if (G.state !== "play") return; }
      else { G.score++; G.pulse = 1; renderHud(); }
    } else if (it.y - R > H) {
      G.items.splice(i, 1);
      if (!it.bad) { loseLife(); if (G.state !== "play") return; }
    }
  }
}

/* ---------- drawing ---------- */
function draw() {
  const s = cv.width / W;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.clearRect(0, 0, W, H);
  for (const it of G.items) {
    if (it.bad) { ctx.fillStyle = theme.bad; ctx.beginPath(); ctx.roundRect(it.x - R, it.y - R, R * 2, R * 2, 4); ctx.fill(); }
    else { ctx.fillStyle = theme.good; ctx.beginPath(); ctx.arc(it.x, it.y, R, 0, Math.PI * 2); ctx.fill(); }
  }
  const grow = G.pulse > 0 ? G.pulse * 6 : 0;
  ctx.fillStyle = G.pulse < -.05 ? theme.bad : theme.ink;
  ctx.beginPath(); ctx.roundRect(G.px - G.pw / 2 - grow / 2, PY, G.pw + grow, PH, PH / 2); ctx.fill();
}

/* ---------- loop (exactly one rAF at a time) ---------- */
function tick(now) {
  G.raf = requestAnimationFrame(tick);
  const dt = Math.min(50, now - (G.last || now)); G.last = now;
  if (G.state === "play") update(dt);
  else if (G.state === "ready") { G.px += (G.tx - G.px) * Math.min(1, dt * .02); }
  draw();
}
function startLoop() { if (!G.raf) { G.last = 0; G.raf = requestAnimationFrame(tick); } }
function stopLoop() { cancelAnimationFrame(G.raf); G.raf = 0; }

function begin() { reset(); G.state = "play"; ui.msg.style.opacity = 0; startLoop(); }
function pause() {
  if (G.state !== "play") return;
  G.state = "paused"; stopLoop(); draw(); message("Paused", "Tap or press Space to resume");
}
function resume() { G.state = "play"; ui.msg.style.opacity = 0; startLoop(); }
function press() {
  if (G.state === "ready") begin();
  else if (G.state === "paused") resume();
  else if (G.state === "over" && performance.now() >= G.lock) begin();
}

/* ---------- input (registered once) ---------- */
function pointerX(e) {
  const r = cv.getBoundingClientRect();
  G.tx = Math.max(G.pw / 2, Math.min(W - G.pw / 2, (e.clientX - r.left) / r.width * W));
}
ui.stage.addEventListener("pointermove", pointerX);
ui.stage.addEventListener("pointerdown", e => { pointerX(e); press(); });
addEventListener("keydown", e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === "ArrowLeft" || k === "a") { keys.left = true; e.preventDefault(); }
  else if (k === "ArrowRight" || k === "d") { keys.right = true; e.preventDefault(); }
  else if (e.repeat) return;
  else if (k === " " || k === "Enter") { e.preventDefault(); press(); }
  else if (k === "p" || k === "Escape") { G.state === "play" ? pause() : G.state === "paused" && resume(); }
});
addEventListener("keyup", e => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === "ArrowLeft" || k === "a") keys.left = false;
  else if (k === "ArrowRight" || k === "d") keys.right = false;
});
addEventListener("blur", () => { keys.left = keys.right = false; pause(); });
document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
addEventListener("resize", fit);
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { readTheme(); draw(); });

/* ---------- init ---------- */
readTheme(); renderHud(); fit(); startLoop();
})();
