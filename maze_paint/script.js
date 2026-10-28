(() => {
"use strict";

// direction: [dx, dy, wall bit, opposite bit]  (0 up, 1 right, 2 down, 3 left)
const DIRS = [[0, -1, 1, 4], [1, 0, 2, 8], [0, 1, 4, 1], [-1, 0, 8, 2]];
const KEYS = { ArrowUp: 0, w: 0, ArrowRight: 1, d: 1, ArrowDown: 2, s: 2, ArrowLeft: 3, a: 3 };
const MAX_SIZE = 14;

const $ = id => document.getElementById(id);
const cv = $("c"), ctx = cv.getContext("2d"), stage = $("stage");
const ui = { level: $("level"), moves: $("moves"), painted: $("painted"), par: $("par"), msg: $("msg"), mTitle: $("mTitle"), mText: $("mText"),
  restart: $("restart"), skip: $("skip") };
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

// state: play | won
const G = { level: 1, n: 6, open: [], start: 0, pos: 0, px: 0, py: 0, order: [], count: 0, moves: 0, par: 0, state: "play", raf: 0, anchor: null, ink: "#232b2a", dark: false };
const sizeFor = lvl => Math.min(MAX_SIZE, 5 + lvl);

/* ---------- maze generation (recursive backtracker, iterative) ---------- */
function generate(n) {
  const open = Array(n * n).fill(0), seen = Array(n * n).fill(false);
  const stack = [Math.floor(Math.random() * n * n)]; seen[stack[0]] = true;
  while (stack.length) {
    const cur = stack[stack.length - 1], x = cur % n, y = Math.floor(cur / n);
    const opts = DIRS.map((d, k) => [k, x + d[0], y + d[1]]).filter(([, nx, ny]) => nx >= 0 && ny >= 0 && nx < n && ny < n && !seen[ny * n + nx]);
    if (!opts.length) { stack.pop(); continue; }
    const [k, nx, ny] = opts[Math.floor(Math.random() * opts.length)], next = ny * n + nx;
    open[cur] |= DIRS[k][2]; open[next] |= DIRS[k][3]; seen[next] = true; stack.push(next);
  }
  return open;
}
function eccentricity(open, n, from) {          // longest walk from the start cell (BFS)
  const dist = Array(n * n).fill(-1); dist[from] = 0; const q = [from];
  for (let h = 0; h < q.length; h++) {
    const c = q[h], x = c % n, y = Math.floor(c / n);
    DIRS.forEach(([dx, dy, bit]) => { const nx = x + dx, ny = y + dy; if (open[c] & bit && dist[ny * n + nx] < 0) { dist[ny * n + nx] = dist[c] + 1; q.push(ny * n + nx); } });
  }
  return Math.max(...dist);
}

/* ---------- game logic ---------- */
function load(level, keepMaze = false) {
  const n = sizeFor(level);
  if (!keepMaze) {
    G.n = n; G.open = generate(n); G.start = Math.floor(Math.random() * n * n);
    G.par = 2 * (n * n - 1) - eccentricity(G.open, n, G.start);   // fewest moves that can paint every cell
  }
  Object.assign(G, { level, pos: G.start, order: Array(G.n * G.n).fill(-1), count: 1, moves: 0, state: "play" });
  G.order[G.start] = 0;
  G.px = G.start % G.n; G.py = Math.floor(G.start / G.n);
  ui.msg.hidden = true; renderHud(); requestDraw();
}
function move(k) {
  if (G.state !== "play") return false;
  const [dx, dy, bit] = DIRS[k];
  if (!(G.open[G.pos] & bit)) return false;
  G.pos += dy * G.n + dx; G.moves++;
  if (G.order[G.pos] < 0) G.order[G.pos] = G.count++;
  renderHud(); requestDraw();
  if (G.count === G.n * G.n) win();
  return true;
}
function win() {
  G.state = "won";
  const r = G.moves / G.par, tier = r <= 1 ? "Perfect!" : r <= 1.25 ? "Great" : "Painted";
  const best = Math.max(+store.get("mazeBest") || 0, G.level); store.set("mazeBest", best);
  ui.mTitle.textContent = tier;
  ui.mText.textContent = `${G.moves} moves · best possible ${G.par}`;
  ui.msg.hidden = false; ui.skip.focus?.({ preventScroll: true });
}
const next = () => load(G.level + 1);

/* ---------- rendering ---------- */
function renderHud() {
  ui.level.textContent = G.level; ui.moves.textContent = G.moves;
  ui.painted.textContent = Math.floor(G.count / (G.n * G.n) * 100) + "%";
  ui.par.textContent = `Fewest possible moves: ${G.par}`;
}
function fit() {
  const r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
  cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d); requestDraw();
}
function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  G.ink = cs.getPropertyValue("--ink").trim() || G.ink;
  G.dark = !!matchMedia?.("(prefers-color-scheme: dark)")?.matches && document.documentElement.dataset.theme !== "light" || document.documentElement.dataset.theme === "dark";
}
function draw() {
  const S = cv.width, n = G.n, cs = S / n;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, S, S);
  for (let i = 0; i < n * n; i++) {
    if (G.order[i] < 0) continue;
    const x = i % n, y = Math.floor(i / n), h = 165 + G.order[i] / (n * n) * 150;
    ctx.fillStyle = `hsl(${h} 50% ${G.dark ? 52 : 58}%)`;
    ctx.fillRect(x * cs, y * cs, cs + 1, cs + 1);                          // +1 hides hairline gaps between cells
  }
  ctx.strokeStyle = G.ink; ctx.lineWidth = Math.max(2, cs * .09); ctx.lineCap = "round"; ctx.beginPath();
  for (let i = 0; i < n * n; i++) {
    const x = (i % n) * cs, y = Math.floor(i / n) * cs, o = G.open[i];
    if (!(o & 1)) { ctx.moveTo(x, y); ctx.lineTo(x + cs, y); }
    if (!(o & 8)) { ctx.moveTo(x, y); ctx.lineTo(x, y + cs); }
    if (i % n === n - 1 && !(o & 2)) { ctx.moveTo(x + cs, y); ctx.lineTo(x + cs, y + cs); }
    if (Math.floor(i / n) === n - 1 && !(o & 4)) { ctx.moveTo(x, y + cs); ctx.lineTo(x + cs, y + cs); }
  }
  ctx.stroke();
  ctx.fillStyle = G.ink; ctx.beginPath(); ctx.arc((G.px + .5) * cs, (G.py + .5) * cs, Math.max(4, cs * .26), 0, Math.PI * 2); ctx.fill();
}
// The brush glides toward its cell; the loop runs only while something is moving.
function frame() {
  const tx = G.pos % G.n, ty = Math.floor(G.pos / G.n);
  G.px += (tx - G.px) * .4; G.py += (ty - G.py) * .4;
  const moving = Math.abs(tx - G.px) > .005 || Math.abs(ty - G.py) > .005;
  if (!moving) { G.px = tx; G.py = ty; }
  draw();
  G.raf = moving ? requestAnimationFrame(frame) : 0;
}
function requestDraw() { if (!G.raf) G.raf = requestAnimationFrame(frame); }

/* ---------- input (registered once) ---------- */
addEventListener("keydown", e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k in KEYS) { e.preventDefault(); move(KEYS[k]); }
  else if (e.repeat) return;
  else if (k === "r") load(G.level, true);
  else if ((k === " " || k === "Enter") && G.state === "won" && !e.target.closest?.("button")) { e.preventDefault(); next(); }
});
stage.addEventListener("pointerdown", e => {
  if (G.state === "won") return next();
  G.anchor = { x: e.clientX, y: e.clientY, moved: false };
});
stage.addEventListener("pointermove", e => {
  const a = G.anchor; if (!a || G.state !== "play") return;
  const dx = e.clientX - a.x, dy = e.clientY - a.y, cell = cv.getBoundingClientRect().width / G.n;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < Math.max(14, cell * .6)) return;
  move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
  G.anchor = { x: e.clientX, y: e.clientY, moved: true };
});
stage.addEventListener("pointerup", e => {
  const a = G.anchor; G.anchor = null;
  if (!a || a.moved || G.state !== "play") return;
  const r = cv.getBoundingClientRect(), cx = Math.floor((e.clientX - r.left) / r.width * G.n), cy = Math.floor((e.clientY - r.top) / r.height * G.n);
  const px = G.pos % G.n, py = Math.floor(G.pos / G.n);
  const k = DIRS.findIndex(([dx, dy]) => px + dx === cx && py + dy === cy);
  if (k >= 0) move(k);
});
stage.addEventListener("pointercancel", () => { G.anchor = null; });
ui.restart.addEventListener("click", e => { load(G.level, true); if (e.detail > 0) e.currentTarget.blur(); });
ui.skip.addEventListener("click", e => { G.state === "won" ? next() : load(G.level); if (e.detail > 0) e.currentTarget.blur(); });
addEventListener("resize", fit);
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { readTheme(); requestDraw(); });

/* ---------- init ---------- */
readTheme(); load(1); fit();
})();
