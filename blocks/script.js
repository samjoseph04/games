(() => {
"use strict";

/* ---------- Constants ---------- */
const COLS = 10, ROWS = 20, LOCK_MS = 320, MAX_RESETS = 10, KICKS = [0, -1, 1, -2, 2];
const SHAPES = {
  I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], O: [[1,1],[1,1]],
  T: [[0,1,0],[1,1,1],[0,0,0]], S: [[0,1,1],[1,1,0],[0,0,0]], Z: [[1,1,0],[0,1,1],[0,0,0]],
  J: [[1,0,0],[1,1,1],[0,0,0]], L: [[0,0,1],[1,1,1],[0,0,0]],
};
const COLORS = { I: "#43c7e0", O: "#f0c24a", T: "#9b7be8", S: "#5fc27a", Z: "#e8665a", J: "#5a8fe0", L: "#f0a63a" };
const LINE_POINTS = [0, 100, 300, 500, 800];

const $ = id => document.getElementById(id);
const cv = $("board"), ctx = cv.getContext("2d"), nv = $("next"), nctx = nv.getContext("2d");
const ui = { score: $("score"), lines: $("lines"), level: $("level"), best: $("best"), msg: $("msg"), well: $("well"), sound: $("sound") };
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

// state: ready | play | paused | over
const G = { state: "ready", board: [], piece: null, next: "T", bag: [], score: 0, lines: 0, level: 1,
  best: +store.get("blocksBest") || 0, acc: 0, lockMs: 0, resets: 0, soft: false, raf: 0, last: 0, lock: 0,
  sound: store.get("blocksSound") !== "0", ctx: null };
let ink = "#232b2a";
const gravity = () => Math.max(70, 800 * Math.pow(.85, G.level - 1));

/* ---------- helpers ---------- */
function readTheme() { ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || ink; }
function fit() {
  const d = Math.min(devicePixelRatio || 1, 2), r = cv.getBoundingClientRect();
  cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); draw();
}
function beep(f, ms = 60, type = "triangle") {
  if (!G.sound) return;
  try {
    const c = G.ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (c.state === "suspended") c.resume();
    const o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(.04, t); g.gain.exponentialRampToValueAtTime(.001, t + ms / 1000);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + ms / 1000);
  } catch { /* audio unavailable */ }
}
function showMsg(title, text, small = "") {
  ui.msg.innerHTML = `<b>${title}</b>${text}${small ? `<small>${small}</small>` : ""}`; ui.msg.style.opacity = 1;
}
const hideMsg = () => { ui.msg.style.opacity = 0; };
function renderHud() {
  ui.score.textContent = G.score; ui.lines.textContent = G.lines; ui.level.textContent = G.level; ui.best.textContent = G.best;
}

/* ---------- pieces ---------- */
const rotate = (m, dir) => m.map((_, r) => m.map((__, c) => dir > 0 ? m[m.length - 1 - c][r] : m[c][m.length - 1 - r]));
function draw7() {
  if (!G.bag.length) { G.bag = Object.keys(SHAPES); for (let i = 6; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [G.bag[i], G.bag[j]] = [G.bag[j], G.bag[i]]; } }
  return G.bag.pop();
}
function collides(m, x, y) {
  for (let r = 0; r < m.length; r++) for (let c = 0; c < m.length; c++) {
    if (!m[r][c]) continue;
    const bx = x + c, by = y + r;
    if (bx < 0 || bx >= COLS || by < 0 || by >= ROWS || G.board[by][bx]) return true;
  }
  return false;
}
function spawn() {
  const t = G.next; G.next = draw7();
  const m = SHAPES[t].map(r => r.slice());
  G.piece = { t, m, x: Math.floor((COLS - m.length) / 2), y: t === "I" ? -1 : 0 };
  G.acc = G.lockMs = G.resets = 0;
  drawNext();
  if (collides(m, G.piece.x, G.piece.y)) gameOver();
}

/* ---------- game logic ---------- */
function grounded() { return collides(G.piece.m, G.piece.x, G.piece.y + 1); }
function touched(wasGrounded) { if (wasGrounded && G.resets < MAX_RESETS) { G.lockMs = 0; G.resets++; } }
function move(dx) {
  if (G.state !== "play") return;
  const p = G.piece, was = grounded();
  if (!collides(p.m, p.x + dx, p.y)) { p.x += dx; touched(was); beep(300, 25); draw(); }
}
function softStep() {
  if (G.state !== "play") return;
  const p = G.piece;
  if (!collides(p.m, p.x, p.y + 1)) { p.y++; G.score++; renderHud(); draw(); }
}
function spin(dir) {
  if (G.state !== "play") return;
  const p = G.piece, m2 = rotate(p.m, dir), was = grounded();
  for (const k of KICKS) if (!collides(m2, p.x + k, p.y)) { p.m = m2; p.x += k; touched(was); beep(420, 30); draw(); return; }
}
function hardDrop() {
  if (G.state !== "play") return;
  const p = G.piece; let n = 0;
  while (!collides(p.m, p.x, p.y + 1)) { p.y++; n++; }
  G.score += n * 2; lockPiece();
}
function lockPiece() {
  const p = G.piece;
  p.m.forEach((row, r) => row.forEach((v, c) => { if (v) G.board[p.y + r][p.x + c] = p.t; }));
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (G.board[r].every(Boolean)) { G.board.splice(r, 1); G.board.unshift(Array(COLS).fill(0)); cleared++; r++; }
  }
  if (cleared) {
    G.score += LINE_POINTS[cleared] * G.level; G.lines += cleared; G.level = 1 + Math.floor(G.lines / 10);
    beep(500 + cleared * 120, 160);
  } else beep(180, 50);
  if (G.score > G.best) { G.best = G.score; store.set("blocksBest", G.best); }
  renderHud(); spawn(); draw();
}
function gameOver() {
  G.state = "over"; G.lock = performance.now() + 500; stopRepeat(); stopLoop();
  if (G.score > G.best) { G.best = G.score; store.set("blocksBest", G.best); }
  renderHud(); draw(); beep(140, 350, "sawtooth");
  showMsg("Game over", `${G.score} points · ${G.lines} lines`, "Tap to play again");
}
function update(dt) {
  if (grounded()) { if ((G.lockMs += dt) >= LOCK_MS) lockPiece(); return; }
  G.lockMs = 0;
  const g = G.soft ? Math.min(gravity(), 45) : gravity();
  G.acc += dt;
  while (G.acc >= g && G.state === "play" && !grounded()) {
    G.acc -= g; G.piece.y++; if (G.soft) G.score++;
  }
  if (G.soft) renderHud();
}

/* ---------- rendering ---------- */
function cell(c, x, y, size, color, alpha = 1) {
  c.globalAlpha = alpha; c.fillStyle = color;
  c.beginPath(); c.roundRect(x * size + 1, y * size + 1, size - 2, size - 2, size * .2); c.fill(); c.globalAlpha = 1;
}
function draw() {
  const s = cv.width / COLS;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = ink; ctx.globalAlpha = .06;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { ctx.beginPath(); ctx.arc((c + .5) * s, (r + .5) * s, 1.4, 0, 6.3); ctx.fill(); }
  ctx.globalAlpha = 1;
  G.board.forEach((row, r) => row.forEach((t, c) => t && cell(ctx, c, r, s, COLORS[t])));
  const p = G.piece;
  if (p && G.state !== "over") {
    let gy = p.y; while (!collides(p.m, p.x, gy + 1)) gy++;
    p.m.forEach((row, r) => row.forEach((v, c) => {
      if (v && gy !== p.y) cell(ctx, p.x + c, gy + r, s, COLORS[p.t], .22);
    }));
    p.m.forEach((row, r) => row.forEach((v, c) => v && cell(ctx, p.x + c, p.y + r, s, COLORS[p.t])));
  }
}
function drawNext() {
  nctx.clearRect(0, 0, 96, 96);
  const m = SHAPES[G.next], s = 20, ox = (96 - m.length * s) / 2 / s, oy = (96 - m.length * s) / 2 / s;
  m.forEach((row, r) => row.forEach((v, c) => v && cell(nctx, c + ox, r + oy, s, COLORS[G.next])));
}

/* ---------- loop (one rAF; stopped while paused or over) ---------- */
function tick(now) {
  G.raf = requestAnimationFrame(tick);
  const dt = Math.min(50, now - (G.last || now)); G.last = now;
  update(dt); if (G.state === "play") draw();
}
const startLoop = () => { if (!G.raf) { G.last = 0; G.raf = requestAnimationFrame(tick); } };
const stopLoop = () => { cancelAnimationFrame(G.raf); G.raf = 0; };

function begin() {
  stopRepeat();
  Object.assign(G, { board: Array.from({ length: ROWS }, () => Array(COLS).fill(0)), score: 0, lines: 0, level: 1, bag: [], soft: false, state: "play" });
  G.next = draw7(); hideMsg(); renderHud(); spawn(); draw(); startLoop();
}
function pause() { if (G.state !== "play") return; G.state = "paused"; G.soft = false; stopRepeat(); stopLoop(); showMsg("Paused", "Tap or press P to resume"); }
function resume() { G.state = "play"; hideMsg(); startLoop(); }
function press() {
  if (G.state === "ready" || (G.state === "over" && performance.now() >= G.lock)) begin();
  else if (G.state === "paused") resume();
}

/* ---------- input (registered once) ---------- */
let repT = 0, repI = 0;
function stopRepeat() { clearTimeout(repT); clearInterval(repI); repT = repI = 0; }
function startRepeat(fn) { stopRepeat(); fn(); repT = setTimeout(() => { repI = setInterval(fn, 65); }, 200); }
const ACTIONS = { left: () => move(-1), right: () => move(1), rotate: () => spin(1), down: softStep, drop: hardDrop };

document.querySelectorAll(".pad button").forEach(b => {
  const a = b.dataset.a;
  b.addEventListener("pointerdown", e => { e.preventDefault(); if (G.state !== "play") return press(); a === "left" || a === "right" || a === "down" ? startRepeat(ACTIONS[a]) : ACTIONS[a](); });
  ["pointerup", "pointerleave", "pointercancel"].forEach(t => b.addEventListener(t, stopRepeat));
});
ui.well.addEventListener("pointerdown", () => { if (G.state === "play") spin(1); else press(); });

addEventListener("keydown", e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === "ArrowLeft" || k === "a") { e.preventDefault(); move(-1); }
  else if (k === "ArrowRight" || k === "d") { e.preventDefault(); move(1); }
  else if (k === "ArrowDown" || k === "s") { e.preventDefault(); G.soft = true; }
  else if (e.repeat) return;
  else if (k === "ArrowUp" || k === "w" || k === "x") { e.preventDefault(); spin(1); }
  else if (k === "z") spin(-1);
  else if (k === " ") { e.preventDefault(); G.state === "play" ? hardDrop() : press(); }
  else if (k === "Enter" && !e.target.closest?.("button")) press();
  else if (k === "p" || k === "Escape") { G.state === "play" ? pause() : G.state === "paused" && resume(); }
});
addEventListener("keyup", e => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; if (k === "ArrowDown" || k === "s") G.soft = false; });
ui.sound.addEventListener("click", e => {
  G.sound = !G.sound; store.set("blocksSound", G.sound ? "1" : "0");
  ui.sound.textContent = G.sound ? "Sound on" : "Sound off"; if (e.detail > 0) ui.sound.blur(); beep(440, 80);
});
document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
addEventListener("blur", () => { G.soft = false; pause(); });
addEventListener("resize", fit);
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { readTheme(); draw(); });

/* ---------- init ---------- */
ui.sound.textContent = G.sound ? "Sound on" : "Sound off";
G.board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
readTheme(); renderHud(); fit(); drawNext();
})();
