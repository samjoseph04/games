(() => {
"use strict";

const $ = id => document.getElementById(id);
const ui = { board: $("board"), moves: $("moves"), time: $("time"), best: $("best"), status: $("status"), newBtn: $("new"), sizes: [...document.querySelectorAll("#sizes button")] };
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

// state: ready (shuffled, not started) | play | won
const G = { n: 3, board: [], tiles: [], state: "ready", moves: 0, t0: 0, timer: 0 };
const bestKey = () => "slideBest-" + G.n;
const seconds = () => Math.min(999, Math.floor((performance.now() - G.t0) / 1000));
const stopTimer = () => { clearInterval(G.timer); G.timer = 0; };

/* ---------- puzzle logic (0 = gap) ---------- */
const solved = n => [...Array(n * n - 1).keys()].map(i => i + 1).concat(0);
const isSolved = () => G.board.every((v, i) => v === (i === G.board.length - 1 ? 0 : i + 1));
function neighbours(i, n) {
  const r = Math.floor(i / n), c = i % n, out = [];
  if (r > 0) out.push(i - n); if (r < n - 1) out.push(i + n);
  if (c > 0) out.push(i - 1); if (c < n - 1) out.push(i + 1);
  return out;
}
function shuffled(n) {            // random legal moves from the solved board, so it is always solvable
  let b, prev = -1;
  do {
    b = solved(n); let e = b.length - 1;
    for (let k = 0; k < n * n * 40; k++) {
      const opts = neighbours(e, n).filter(j => j !== prev), j = opts[Math.floor(Math.random() * opts.length)];
      [b[e], b[j]] = [b[j], b[e]]; prev = e; e = j;
    }
  } while (b.every((v, i) => v === solved(n)[i]));
  return b;
}
function slide(idx) {             // move the clicked tile (and any tiles between it and the gap)
  const n = G.n, e = G.board.indexOf(0);
  if (idx === e) return false;
  const er = Math.floor(e / n), ec = e % n, ir = Math.floor(idx / n), ic = idx % n;
  if (er !== ir && ec !== ic) return false;
  const step = er === ir ? Math.sign(ic - ec) : Math.sign(ir - er) * n;
  for (let cur = e; cur !== idx; cur += step) { G.board[cur] = G.board[cur + step]; G.board[cur + step] = 0; }
  return true;
}

/* ---------- rendering ---------- */
function renderHud() {
  ui.moves.textContent = G.moves; ui.time.textContent = G.state === "ready" ? 0 : seconds();
  const b = +store.get(bestKey()); ui.best.textContent = b || "–";
}
function render() {
  const n = G.n;
  G.board.forEach((v, i) => {
    if (!v) return;
    const el = G.tiles[v];
    el.style.setProperty("--x", i % n); el.style.setProperty("--y", Math.floor(i / n));
    el.classList.toggle("ok", v === i + 1);
    el.tabIndex = 0;
  });
  ui.board.classList.toggle("done", G.state === "won");
  renderHud();
}
function newGame(n = G.n) {
  stopTimer();
  Object.assign(G, { n, board: shuffled(n), state: "ready", moves: 0 });
  const inner = document.createElement("div"); inner.className = "inner";
  G.tiles = [null];
  for (let v = 1; v < n * n; v++) {
    const t = document.createElement("button");
    t.className = "tile"; t.textContent = v; t.dataset.v = v; t.setAttribute("aria-label", `Tile ${v}`);
    inner.appendChild(t); G.tiles.push(t);
  }
  ui.board.style.setProperty("--n", n); ui.board.replaceChildren(inner);
  ui.sizes.forEach(b => b.setAttribute("aria-pressed", +b.dataset.n === n));
  ui.status.textContent = "Put the numbers in order";
  render();
}

/* ---------- game flow ---------- */
function afterMove() {
  G.moves++;
  if (G.state === "ready") { G.state = "play"; G.t0 = performance.now(); G.timer = setInterval(renderHud, 250); }
  if (isSolved()) {
    stopTimer(); G.state = "won";
    const t = seconds(), prev = +store.get(bestKey()), record = !prev || G.moves < prev;
    if (record) store.set(bestKey(), G.moves);
    ui.status.textContent = `Solved in ${G.moves} moves, ${t}s${record ? " · new best!" : ""}`;
  }
  render();
}
function tryMove(idx) {
  if (G.state === "won" || !slide(idx)) return;
  afterMove();
}

/* ---------- input (registered once) ---------- */
ui.board.addEventListener("click", e => {
  const t = e.target.closest(".tile"); if (!t) return;
  tryMove(G.board.indexOf(+t.dataset.v));
});
ui.newBtn.addEventListener("click", () => newGame());
ui.sizes.forEach(b => b.addEventListener("click", () => newGame(+b.dataset.n)));
document.addEventListener("click", e => { if (e.detail > 0 && !e.target.closest?.(".tile")) e.target.closest?.("button")?.blur(); });
document.addEventListener("keydown", e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key, n = G.n, gap = G.board.indexOf(0);
  // an arrow key slides the tile on the opposite side of the gap toward it
  const from = { ArrowLeft: gap % n < n - 1 ? gap + 1 : -1, ArrowRight: gap % n > 0 ? gap - 1 : -1,
    ArrowUp: gap + n < n * n ? gap + n : -1, ArrowDown: gap - n >= 0 ? gap - n : -1 };
  const map = { a: "ArrowLeft", d: "ArrowRight", w: "ArrowUp", s: "ArrowDown" };
  const dir = from[k] !== undefined ? k : map[k];
  if (dir) { e.preventDefault(); if (from[dir] >= 0) tryMove(from[dir]); }
  else if (k === "r") newGame();
});

newGame();
})();
