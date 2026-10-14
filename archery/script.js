(() => {
"use strict";

/* ---------- Constants (logical units: 640 x 400 canvas, px and ms) ---------- */
const W = 640, H = 400, GY = 350, BOW = { x: 80, y: 280 }, TX = 560, HALF = 60;
const MAXPULL = 90, VMAX = .95, GRAV = .0011, SHOTS = 10, MINPOW = .12;
const BANDS = [[9, 10, "#e8665a"], [21, 8, "#f0a63a"], [33, 6, "#2fa38f"], [46, 4, "#6f8fa0"], [60, 2, "#a3aca8"]];

const $ = id => document.getElementById(id);
const cv = $("c"), ctx = cv.getContext("2d"), stage = $("stage");
const ui = { score: $("score"), arrows: $("arrows"), best: $("best"), msg: $("msg"), sound: $("sound") };
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

// state: ready | aim | fly | wait | over
const G = { state: "ready", score: 0, shot: 0, best: +store.get("archeryBest") || 0, t: 0, raf: 0, last: 0, wait: 0, lock: 0,
  base: 180, phase: 0, amp: 0, ang: .25, pow: 0, drag: false, charge: false, arrow: null, stuck: [], pop: null,
  sound: store.get("archerySound") !== "0", ctx: null };
let ink = "#232b2a";

/* ---------- helpers ---------- */
const targetY = () => G.base + G.amp * Math.sin(G.phase + G.t * .0009);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function readTheme() { ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || ink; }
function fit() {
  const r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
  cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d);
}
function beep(f, ms = 120, type = "triangle") {
  if (!G.sound) return;
  try {
    const c = G.ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (c.state === "suspended") c.resume();
    const o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(.06, t); g.gain.exponentialRampToValueAtTime(.001, t + ms / 1000);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + ms / 1000);
  } catch { /* audio unavailable */ }
}
function showMsg(title, text, small = "") {
  ui.msg.innerHTML = `<b>${title}</b>${text}${small ? `<small>${small}</small>` : ""}`; ui.msg.style.opacity = 1;
}
function renderHud() {
  ui.score.textContent = G.score; ui.best.textContent = G.best; ui.arrows.textContent = SHOTS - G.shot;
}

/* ---------- game flow ---------- */
function newTarget() {
  G.base = 100 + Math.random() * 150;
  G.phase = Math.random() * 6.28;
  G.amp = Math.min(36, G.shot * 4);
}
function begin() {
  Object.assign(G, { score: 0, shot: 0, stuck: [], arrow: null, pop: null, drag: false, charge: false, pow: 0, ang: .25, state: "aim" });
  newTarget(); renderHud(); ui.msg.style.opacity = 0;
}
function fire() {
  const v = G.pow * VMAX;
  G.arrow = { x: BOW.x, y: BOW.y, vx: Math.cos(G.ang) * v, vy: -Math.sin(G.ang) * v };
  G.state = "fly"; G.shot++; G.pow = 0; G.drag = G.charge = false;
  beep(190, 140, "sawtooth"); renderHud();
}
function settle(a, pts, onTarget, dy = 0) {
  G.stuck.push({ x: a.x, y: a.y, ang: Math.atan2(a.vy, a.vx), onTarget, dy });
  G.arrow = null; G.score += pts;
  if (G.score > G.best) { G.best = G.score; store.set("archeryBest", G.best); }
  G.pop = { text: pts ? "+" + pts : "Miss", x: a.x, y: Math.max(40, a.y - 24), age: 0 };
  beep(pts ? 300 + pts * 40 : 120, pts ? 160 : 200);
  G.state = "wait"; G.wait = 800; renderHud();
}
function stepArrow(h) {
  const a = G.arrow, px = a.x;
  a.vy += GRAV * h; a.x += a.vx * h; a.y += a.vy * h;
  if (px < TX && a.x >= TX) {                              // crossed the target plane
    const f = (TX - px) / (a.x - px), y = a.y - a.vy * h * (1 - f), cy = targetY(), d = Math.abs(y - cy);
    if (d <= HALF) {
      const pts = BANDS.find(b => d <= b[0])[1];
      return settle({ x: TX, y, vx: a.vx, vy: a.vy }, pts, true, y - cy);
    }
  }
  if (a.y >= GY) return settle({ ...a, y: GY }, 0, false);
  if (a.x > W + 60) return settle({ ...a, x: W - 10, y: GY }, 0, false);
}
function update(dt) {
  G.t += dt;
  if (G.state === "aim" && G.charge) G.pow = Math.min(1, G.pow + dt / 1200);
  if (G.state === "fly") for (let left = dt; left > 0 && G.arrow; left -= 8) stepArrow(Math.min(8, left));
  if (G.pop && (G.pop.age += dt) > 900) G.pop = null;
  if (G.state === "wait" && (G.wait -= dt) <= 0) {
    if (G.shot >= SHOTS) finish(); else { newTarget(); G.state = "aim"; }
  }
}
function finish() {
  G.state = "over"; G.lock = performance.now() + 500;
  showMsg(`${G.score} points`, G.score >= G.best && G.score > 0 ? "New best!" : `Best ${G.best}`, "Tap to play again");
  beep(520, 300);
}

/* ---------- rendering ---------- */
function drawArrow(x, y, a, len = 38) {
  const c = Math.cos(a), s = Math.sin(a);
  ctx.beginPath(); ctx.moveTo(x - c * len, y - s * len); ctx.lineTo(x, y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - c * 7 - s * 3.5, y - s * 7 + c * 3.5);
  ctx.lineTo(x - c * 7 + s * 3.5, y - s * 7 - c * 3.5); ctx.closePath(); ctx.fill();
}
function trajectory() {
  const v = Math.max(G.pow, .001) * VMAX, vx = Math.cos(G.ang) * v, vy0 = -Math.sin(G.ang) * v;
  ctx.fillStyle = ink; ctx.globalAlpha = .35;
  for (let t = 60; t <= 600; t += 60) {
    const x = BOW.x + vx * t, y = BOW.y + vy0 * t + .5 * GRAV * t * t;
    ctx.beginPath(); ctx.arc(x, y, 2, 0, 6.3); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function draw() {
  const s = cv.width / W, cy = targetY();
  ctx.setTransform(s, 0, 0, s, 0, 0); ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = 2; ctx.lineCap = "round";
  ctx.globalAlpha = .35; ctx.beginPath(); ctx.moveTo(0, GY); ctx.lineTo(W, GY); ctx.stroke();
  ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(TX + 7, cy + HALF); ctx.lineTo(TX + 7, GY); ctx.stroke(); ctx.globalAlpha = 1;

  // target board: stacked coloured bands, outermost first
  for (let i = BANDS.length - 1; i >= 0; i--) {
    ctx.fillStyle = BANDS[i][2]; ctx.fillRect(TX - 7, cy - BANDS[i][0], 14, BANDS[i][0] * 2);
  }
  ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = 2;
  for (const a of G.stuck) drawArrow(a.x, a.onTarget ? cy + a.dy : a.y, a.ang);

  // bow + nocked arrow
  const aiming = G.state === "aim", pull = aiming ? G.pow * MAXPULL : 0;
  const u = { x: Math.cos(G.ang), y: -Math.sin(G.ang) };
  ctx.lineWidth = 3; ctx.beginPath();
  ctx.arc(BOW.x - u.x * 30, BOW.y - u.y * 30, 34, Math.atan2(u.y, u.x) - 1.1, Math.atan2(u.y, u.x) + 1.1); ctx.stroke();
  const n = { x: BOW.x - u.x * pull * .45, y: BOW.y - u.y * pull * .45 };
  const tip = [-1, 1].map(k => { const a = Math.atan2(u.y, u.x) + k * 1.1; return [BOW.x - u.x * 30 + Math.cos(a) * 34, BOW.y - u.y * 30 + Math.sin(a) * 34]; });
  ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(...tip[0]); ctx.lineTo(n.x, n.y); ctx.lineTo(...tip[1]); ctx.stroke();
  ctx.lineWidth = 2;
  if (aiming) { drawArrow(n.x + u.x * 40, n.y + u.y * 40, Math.atan2(u.y, u.x)); if (G.pow > MINPOW) trajectory(); }
  if (G.arrow) drawArrow(G.arrow.x, G.arrow.y, Math.atan2(G.arrow.vy, G.arrow.vx));

  if (G.pop) {
    ctx.globalAlpha = 1 - G.pop.age / 900; ctx.font = "500 22px system-ui,sans-serif"; ctx.textAlign = "center";
    ctx.fillText(G.pop.text, G.pop.x, G.pop.y - G.pop.age * .02); ctx.globalAlpha = 1;
  }
  if (aiming) {   // power meter
    ctx.globalAlpha = .25; ctx.fillRect(24, 24, 80, 4); ctx.globalAlpha = 1; ctx.fillRect(24, 24, 80 * G.pow, 4);
  }
}

/* ---------- loop (one rAF at all times) ---------- */
function tick(now) {
  G.raf = requestAnimationFrame(tick);
  const dt = Math.min(50, now - (G.last || now)); G.last = now;
  update(dt); draw();
}

/* ---------- input (registered once) ---------- */
function aimFrom(e) {
  const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
  const dx = Math.max(BOW.x - x, .001), dy = BOW.y - y;
  G.ang = clamp(Math.atan2(-dy, dx), -.35, 1.35);   // pull back and down to aim up
  G.pow = clamp(Math.hypot(dx, dy) / MAXPULL, 0, 1);
}
function press() {
  if (G.state === "ready") begin();
  else if (G.state === "over" && performance.now() >= G.lock) begin();
}
stage.addEventListener("pointerdown", e => {
  if (G.state !== "aim") return press();
  G.drag = true; stage.setPointerCapture?.(e.pointerId); aimFrom(e);
});
stage.addEventListener("pointermove", e => { if (G.drag && G.state === "aim") aimFrom(e); });
stage.addEventListener("pointerup", () => {
  if (!G.drag) return;
  G.drag = false;
  if (G.state === "aim" && G.pow >= MINPOW) fire(); else G.pow = 0;
});
stage.addEventListener("pointercancel", () => { G.drag = false; G.pow = 0; });

addEventListener("keydown", e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); G.ang = clamp(G.ang + (e.key === "ArrowUp" ? .04 : -.04), -.35, 1.35); }
  else if ((e.key === " " || e.key === "Enter") && !e.target.closest?.("button")) {
    e.preventDefault();
    if (e.repeat) return;
    if (G.state === "aim") G.charge = true; else press();
  }
});
addEventListener("keyup", e => {
  if (e.key === " " || e.key === "Enter") {
    if (G.state === "aim" && G.charge) { G.charge = false; if (G.pow >= MINPOW) fire(); else G.pow = 0; }
  }
});
addEventListener("blur", () => { G.charge = G.drag = false; if (G.state === "aim") G.pow = 0; });
ui.sound.addEventListener("click", e => {
  G.sound = !G.sound; store.set("archerySound", G.sound ? "1" : "0");
  ui.sound.textContent = G.sound ? "Sound on" : "Sound off"; if (e.detail > 0) ui.sound.blur(); beep(440, 80);
});
addEventListener("resize", fit);
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", readTheme);

/* ---------- init ---------- */
ui.sound.textContent = G.sound ? "Sound on" : "Sound off";
readTheme(); fit(); newTarget(); renderHud(); G.raf = requestAnimationFrame(tick);
})();
