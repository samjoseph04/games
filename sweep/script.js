(() => {
"use strict";

const LEVELS = { easy: { n: 8, m: 10 }, medium: { n: 10, m: 18 }, hard: { n: 12, m: 30 } };
const $ = id => document.getElementById(id);
const ui = { grid: $("grid"), mines: $("mines"), time: $("time"), best: $("best"), status: $("status"), mode: $("mode"), newBtn: $("new"), levels: [...document.querySelectorAll("#levels button")] };
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

// state: ready (mines not placed yet) | play | won | over
const G = { lv: "easy", n: 8, m: 10, cells: [], els: [], state: "ready", flagMode: false, t0: 0, timer: 0 };

/* ---------- helpers ---------- */
function neighbours(i) {
  const n = G.n, r = Math.floor(i / n), c = i % n, out = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const rr = r + dr, cc = c + dc;
    if ((dr || dc) && rr >= 0 && rr < n && cc >= 0 && cc < n) out.push(rr * n + cc);
  }
  return out;
}
const bestKey = () => "sweepBest-" + G.lv;
function stopTimer() { clearInterval(G.timer); G.timer = 0; }
const seconds = () => Math.min(999, Math.floor((performance.now() - G.t0) / 1000));

/* ---------- game logic ---------- */
function placeMines(safe) {
  const banned = new Set([safe, ...neighbours(safe)]);
  const pool = G.cells.map((_, i) => i).filter(i => !banned.has(i)).sort(() => Math.random() - .5);
  pool.slice(0, G.m).forEach(i => { G.cells[i].mine = true; });
  G.cells.forEach((c, i) => { c.adj = neighbours(i).filter(j => G.cells[j].mine).length; });
}
function reveal(i) {
  const cell = G.cells[i];
  if (G.state === "won" || G.state === "over" || cell.flag) return;
  if (G.state === "ready") {
    placeMines(i); G.state = "play"; G.t0 = performance.now();
    G.timer = setInterval(renderHud, 250); ui.status.textContent = "Good luck";
  }
  if (cell.open) return chord(i);
  if (cell.mine) return lose(i);
  const stack = [i];
  while (stack.length) {          // flood fill through empty areas
    const j = stack.pop(), c = G.cells[j];
    if (c.open || c.flag) continue;
    c.open = true;
    if (c.adj === 0) stack.push(...neighbours(j));
  }
  checkWin(); render();
}
function chord(i) {               // open neighbours of a number that already has enough flags
  const cell = G.cells[i], nb = neighbours(i);
  if (!cell.adj || nb.filter(j => G.cells[j].flag).length !== cell.adj) return;
  for (const j of nb) {
    const c = G.cells[j];
    if (c.flag || c.open) continue;
    if (c.mine) return lose(j);
    reveal(j);
    if (G.state !== "play") return;
  }
}
function toggleFlag(i) {
  const c = G.cells[i];
  if (G.state === "won" || G.state === "over" || c.open) return;
  c.flag = !c.flag; render();
}
function lose(hit) {
  stopTimer(); G.state = "over"; G.cells[hit].boom = true;
  G.cells.forEach(c => { if (c.mine && !c.flag) c.show = true; if (!c.mine && c.flag) c.wrong = true; });
  ui.status.textContent = "Boom. Try again"; render();
}
function checkWin() {
  if (G.cells.some(c => !c.mine && !c.open)) return;
  stopTimer(); G.state = "won";
  G.cells.forEach(c => { if (c.mine) c.flag = true; });
  const t = seconds(), prev = +store.get(bestKey()) || 0;
  if (!prev || t < prev) store.set(bestKey(), t);
  ui.status.textContent = `Cleared in ${t}s`; render();
}

/* ---------- rendering ---------- */
function renderHud() {
  ui.mines.textContent = G.m - G.cells.filter(c => c.flag).length;
  ui.time.textContent = G.state === "ready" ? 0 : seconds();
  const b = +store.get(bestKey()); ui.best.textContent = b ? b + "s" : "–";
}
function render() {
  G.cells.forEach((c, i) => {
    const el = G.els[i];
    el.className = "cell" + (c.open ? " open" : "") + (c.flag ? " flag" : "") + (c.show ? " mine" : "") + (c.boom ? " boom mine" : "") + (c.wrong ? " wrong" : "");
    if (c.open && c.adj) { el.textContent = c.adj; el.dataset.n = c.adj; } else { el.textContent = ""; delete el.dataset.n; }
  });
  ui.grid.classList.toggle("locked", G.state === "won" || G.state === "over");
  renderHud();
}
function newGame(lv = G.lv) {
  stopTimer();
  const { n, m } = LEVELS[lv];
  Object.assign(G, { lv, n, m, state: "ready", cells: Array.from({ length: n * n }, () => ({ mine: false, adj: 0, open: false, flag: false })) });
  ui.grid.style.setProperty("--n", n);
  G.els = G.cells.map((_, i) => {
    const b = document.createElement("button");
    b.className = "cell"; b.dataset.i = i; b.setAttribute("aria-label", `Row ${Math.floor(i / n) + 1}, column ${i % n + 1}`);
    return b;
  });
  ui.grid.replaceChildren(...G.els);
  ui.levels.forEach(b => b.setAttribute("aria-pressed", b.dataset.lv === lv));
  ui.status.textContent = "Tap a square to begin";
  render();
}
function setMode(on) {
  G.flagMode = on; ui.mode.setAttribute("aria-pressed", on); ui.mode.textContent = on ? "Flag" : "Reveal";
}

/* ---------- input (registered once) ---------- */
ui.grid.addEventListener("click", e => {
  const b = e.target.closest(".cell"); if (!b) return;
  G.flagMode ? toggleFlag(+b.dataset.i) : reveal(+b.dataset.i);
});
ui.grid.addEventListener("contextmenu", e => {
  const b = e.target.closest(".cell"); if (!b) return;
  e.preventDefault(); toggleFlag(+b.dataset.i);
});
ui.mode.addEventListener("click", () => setMode(!G.flagMode));
ui.newBtn.addEventListener("click", () => newGame());
ui.levels.forEach(b => b.addEventListener("click", () => newGame(b.dataset.lv)));
document.addEventListener("click", e => { if (e.detail > 0 && !e.target.closest?.(".cell")) e.target.closest?.("button")?.blur(); });
document.addEventListener("keydown", e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key, n = G.n, cur = G.els.indexOf(document.activeElement);
  const move = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -n, ArrowDown: n }[k];
  if (move !== undefined) {
    e.preventDefault();
    const from = cur < 0 ? 0 : cur, to = from + move;
    const ok = to >= 0 && to < n * n && (Math.abs(move) !== 1 || Math.floor(to / n) === Math.floor(from / n));
    G.els[cur < 0 ? 0 : ok ? to : from].focus({ preventScroll: true });
  } else if (k === "f" && cur >= 0) toggleFlag(cur);
  else if (k === "r") newGame();
});

newGame();
})();
