(() => {
"use strict";

const LEVELS = { easy: { cols: 4, rows: 3 }, medium: { cols: 4, rows: 4 }, hard: { cols: 6, rows: 4 } };
const SYMBOLS = ["●", "■", "▲", "◆", "★", "✚", "♥", "⬟", "☾", "✿", "⬢", "☂"];
const NAMES = ["circle", "square", "triangle", "diamond", "star", "cross", "heart", "pentagon", "moon", "flower", "hexagon", "umbrella"];
const MISMATCH_MS = 750;

const $ = id => document.getElementById(id);
const ui = { grid: $("grid"), moves: $("moves"), time: $("time"), best: $("best"), status: $("status"), newBtn: $("new"), levels: [...document.querySelectorAll("#levels button")] };
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

// state: ready | play | won     (G.busy blocks input while a mismatched pair is shown)
const G = { lv: "easy", cards: [], els: [], state: "ready", first: -1, busy: false, moves: 0, matched: 0, t0: 0, timer: 0, hide: 0 };

/* ---------- helpers ---------- */
const bestKey = () => "pairsBest-" + G.lv;
const seconds = () => Math.min(999, Math.floor((performance.now() - G.t0) / 1000));
function stopTimers() { clearInterval(G.timer); clearTimeout(G.hide); G.timer = G.hide = 0; }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* ---------- rendering ---------- */
function renderHud() {
  ui.moves.textContent = G.moves;
  ui.time.textContent = G.state === "ready" ? 0 : seconds();
  const b = +store.get(bestKey()); ui.best.textContent = b ? b : "–";
}
function renderCard(i) {
  const c = G.cards[i], el = G.els[i];
  el.classList.toggle("up", c.up); el.classList.toggle("matched", c.matched);
  el.setAttribute("aria-label", c.up || c.matched ? `Card ${i + 1}: ${NAMES[c.sym]}` : `Card ${i + 1}, face down`);
}

/* ---------- game logic ---------- */
function newGame(lv = G.lv) {
  stopTimers();
  const { cols, rows } = LEVELS[lv], pairs = cols * rows / 2;
  const syms = shuffle([...Array(pairs).keys()].flatMap(s => [s, s]));
  Object.assign(G, { lv, state: "ready", first: -1, busy: false, moves: 0, matched: 0, cards: syms.map(sym => ({ sym, up: false, matched: false })) });
  ui.grid.style.setProperty("--cols", cols); ui.grid.style.setProperty("--rows", rows);
  G.els = G.cards.map((c, i) => {
    const b = document.createElement("button");
    b.className = "card"; b.dataset.i = i; b.style.setProperty("--h", Math.round(c.sym * 360 / pairs + 160) % 360);
    b.innerHTML = `<span class="face back"></span><span class="face front">${SYMBOLS[c.sym]}</span>`;
    return b;
  });
  ui.grid.replaceChildren(...G.els);
  G.cards.forEach((_, i) => renderCard(i));
  ui.levels.forEach(b => b.setAttribute("aria-pressed", b.dataset.lv === lv));
  ui.status.textContent = "Flip two cards to find a match";
  renderHud();
}
function flip(i) {
  const c = G.cards[i];
  if (G.busy || G.state === "won" || c.up || c.matched) return;
  if (G.state === "ready") { G.state = "play"; G.t0 = performance.now(); G.timer = setInterval(renderHud, 250); }
  c.up = true; renderCard(i);
  if (G.first < 0) { G.first = i; return; }

  const a = G.first, b = i; G.first = -1; G.moves++;
  if (G.cards[a].sym === c.sym) {
    G.cards[a].matched = c.matched = true; G.matched += 2; renderCard(a); renderCard(b);
    ui.status.textContent = "Match!";
    if (G.matched === G.cards.length) win();
  } else {
    G.busy = true; ui.status.textContent = "Not a match";
    G.hide = setTimeout(() => {
      G.cards[a].up = c.up = false; renderCard(a); renderCard(b); G.busy = false; G.hide = 0;
    }, MISMATCH_MS);
  }
  renderHud();
}
function win() {
  const t = seconds(), prev = +store.get(bestKey());
  stopTimers(); G.state = "won";
  const record = !prev || G.moves < prev;
  if (record) store.set(bestKey(), G.moves);
  ui.status.textContent = `Done in ${G.moves} moves, ${t}s${record ? " · new best!" : ""}`;
  renderHud();
}

/* ---------- input (registered once) ---------- */
ui.grid.addEventListener("click", e => { const b = e.target.closest(".card"); if (b) flip(+b.dataset.i); });
ui.newBtn.addEventListener("click", () => newGame());
ui.levels.forEach(b => b.addEventListener("click", () => newGame(b.dataset.lv)));
document.addEventListener("click", e => { if (e.detail > 0 && !e.target.closest?.(".card")) e.target.closest?.("button")?.blur(); });
document.addEventListener("keydown", e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key, cols = LEVELS[G.lv].cols, n = G.els.length, cur = G.els.indexOf(document.activeElement);
  const move = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[k];
  if (move !== undefined) {
    e.preventDefault();
    const from = cur < 0 ? 0 : cur, to = from + move;
    const ok = to >= 0 && to < n && (Math.abs(move) !== 1 || Math.floor(to / cols) === Math.floor(from / cols));
    G.els[cur < 0 ? 0 : ok ? to : from].focus({ preventScroll: true });
  } else if (k === "r") newGame();
});

newGame();
})();
