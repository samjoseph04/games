(() => {
"use strict";

const COLS = 7, ROWS = 6, ORDER = [3, 2, 4, 1, 5, 0, 6];
const LEVELS = { easy: { depth: 2, rand: .35 }, medium: { depth: 4, rand: .05 }, hard: { depth: 5, rand: 0 } };
const THINK_MS = 450;

const $ = id => document.getElementById(id);
const ui = { board: $("board"), status: $("statusText"), dot: $("dot"), w: $("w"), d: $("d"), l: $("l"), newBtn: $("new"), levels: [...document.querySelectorAll("#levels button")] };
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

/* ---------- board logic (1 = you, 2 = AI; row 0 is the top) ---------- */
const idx = (r, c) => r * COLS + c;
const LINES = (() => {
  const out = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++)
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const er = r + 3 * dr, ec = c + 3 * dc;
      if (er >= 0 && er < ROWS && ec >= 0 && ec < COLS) out.push([0, 1, 2, 3].map(k => idx(r + k * dr, c + k * dc)));
    }
  return out;
})();
function dropRow(b, c) { for (let r = ROWS - 1; r >= 0; r--) if (!b[idx(r, c)]) return r; return -1; }
function findWin(b) {
  for (const l of LINES) { const p = b[l[0]]; if (p && p === b[l[1]] && p === b[l[2]] && p === b[l[3]]) return { p, line: l }; }
  return null;
}
function score(b) {
  let s = 0;
  for (const l of LINES) {
    let a = 0, h = 0;
    for (const i of l) { if (b[i] === 2) a++; else if (b[i] === 1) h++; }
    if (a && h) continue;
    if (a === 3) s += 5; else if (a === 2) s += 2;
    if (h === 3) s -= 6; else if (h === 2) s -= 2;
  }
  for (let r = 0; r < ROWS; r++) if (b[idx(r, 3)] === 2) s += 3;   // centre control
  return s;
}
function search(b, depth, alpha, beta, ai) {
  const w = findWin(b);
  if (w) return w.p === 2 ? 100000 + depth : -100000 - depth;     // prefer quicker wins / slower losses
  if (depth === 0) return score(b);
  let best = ai ? -Infinity : Infinity, any = false;
  for (const c of ORDER) {
    const r = dropRow(b, c); if (r < 0) continue;
    any = true; b[idx(r, c)] = ai ? 2 : 1;
    const v = search(b, depth - 1, alpha, beta, !ai);
    b[idx(r, c)] = 0;
    if (ai) { best = Math.max(best, v); alpha = Math.max(alpha, v); } else { best = Math.min(best, v); beta = Math.min(beta, v); }
    if (alpha >= beta) break;
  }
  return any ? best : 0;
}
function chooseMove(b, level) {
  const { depth, rand } = LEVELS[level], legal = ORDER.filter(c => dropRow(b, c) >= 0);
  if (Math.random() < rand) return legal[Math.floor(Math.random() * legal.length)];
  let best = -Infinity, pick = legal[0];
  for (const c of legal) {
    const r = dropRow(b, c); b[idx(r, c)] = 2;
    const v = search(b, depth - 1, -Infinity, Infinity, false) + Math.random() * .01;
    b[idx(r, c)] = 0;
    if (v > best) { best = v; pick = c; }
  }
  return pick;
}

/* ---------- game state ---------- */
// state: play | won | lost | draw     (turn: 1 you, 2 AI)
const G = { lv: store.get("fourLevel") in LEVELS ? store.get("fourLevel") : "medium", board: [], cells: [], state: "play", turn: 1, first: 2, ai: 0, token: 0 };
const recKey = () => "fourRec-" + G.lv;
const record = () => (store.get(recKey()) || "0,0,0").split(",").map(Number);

function renderRecord() { [ui.w.textContent, ui.d.textContent, ui.l.textContent] = record(); }
function setStatus(text, ai = false) { ui.status.textContent = text; ui.dot.classList.toggle("ai", ai); }

function addDisc(r, c, p) {
  const d = document.createElement("div");
  d.className = "disc" + (p === 2 ? " p2" : ""); d.style.setProperty("--fall", r + 1);
  G.cells[idx(r, c)].appendChild(d);
}
function play(c, p) {
  const r = dropRow(G.board, c); if (r < 0) return false;
  G.board[idx(r, c)] = p; addDisc(r, c, p);
  const w = findWin(G.board);
  if (w) end(w.p === 1 ? "won" : "lost", w.line);
  else if (G.board.every(Boolean)) end("draw");
  return true;
}
function end(state, line) {
  G.state = state; ui.board.classList.add("locked");
  line?.forEach(i => G.cells[i].lastChild.classList.add("win"));
  const rec = record(); rec[state === "won" ? 0 : state === "draw" ? 1 : 2]++;
  store.set(recKey(), rec.join(",")); renderRecord();
  setStatus(state === "won" ? "You win!" : state === "lost" ? "AI wins" : "Draw", state === "lost");
}
function aiTurn() {
  G.turn = 2; ui.board.classList.add("locked"); setStatus("AI is thinking…", true);
  const id = ++G.token;
  G.ai = setTimeout(() => {
    G.ai = 0; if (id !== G.token || G.state !== "play") return;
    play(chooseMove(G.board, G.lv), 2);
    if (G.state === "play") { G.turn = 1; ui.board.classList.remove("locked"); setStatus("Your turn"); }
  }, THINK_MS);
}
function humanMove(c) {
  if (G.state !== "play" || G.turn !== 1 || !play(c, 1)) return;
  if (G.state === "play") aiTurn();
}
function newGame(lv = G.lv) {
  clearTimeout(G.ai); G.token++; G.ai = 0;
  if (lv !== G.lv) store.set("fourLevel", lv);
  G.lv = lv; G.first = 3 - G.first;                       // alternate who starts
  Object.assign(G, { board: Array(COLS * ROWS).fill(0), state: "play", turn: 1 });
  ui.board.replaceChildren(...Array.from({ length: COLS }, (_, c) => {
    const b = document.createElement("button");
    b.className = "col"; b.dataset.c = c; b.setAttribute("aria-label", `Column ${c + 1}`);
    for (let r = 0; r < ROWS; r++) b.appendChild(Object.assign(document.createElement("div"), { className: "cell" }));
    return b;
  }));
  G.cells = Array.from({ length: COLS * ROWS }, (_, i) => ui.board.children[i % COLS].children[Math.floor(i / COLS)]);
  ui.board.classList.remove("locked");
  ui.levels.forEach(b => b.setAttribute("aria-pressed", b.dataset.lv === lv));
  renderRecord(); setStatus("Your turn");
  if (G.first === 2) aiTurn();
}

/* ---------- input (registered once) ---------- */
ui.board.addEventListener("click", e => { const b = e.target.closest(".col"); if (b) humanMove(+b.dataset.c); });
ui.newBtn.addEventListener("click", () => newGame());
ui.levels.forEach(b => b.addEventListener("click", () => newGame(b.dataset.lv)));
document.addEventListener("click", e => { if (e.detail > 0 && !e.target.closest?.(".col")) e.target.closest?.("button")?.blur(); });
document.addEventListener("keydown", e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key, cols = [...ui.board.children], cur = cols.indexOf(document.activeElement);
  if (/^[1-7]$/.test(k)) humanMove(+k - 1);
  else if (k === "ArrowLeft" || k === "ArrowRight") {
    e.preventDefault(); const to = Math.max(0, Math.min(COLS - 1, (cur < 0 ? 3 : cur) + (k === "ArrowLeft" ? -1 : 1))); cols[to].focus({ preventScroll: true });
  } else if (k === "r") newGame();
});

G.first = 2;   // so the first game starts with you
newGame();
})();
