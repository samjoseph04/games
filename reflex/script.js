(() => {
"use strict";

const ROUNDS = 5, WAIT = [1200, 3500];                    // random delay range before the screen turns green (ms)

const $ = id => document.getElementById(id);
const ui = { pad: $("pad"), title: $("title"), sub: $("sub"), round: $("round"), last: $("last"), best: $("best"), chips: $("chips") };
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

// state: ready | wait | go | shown (round result) | done (summary)
const G = { state: "ready", times: [], t0: 0, timer: 0, best: +store.get("reflexBest") || 0 };
const clearTimer = () => { clearTimeout(G.timer); G.timer = 0; };

/* ---------- rendering ---------- */
function show(cls, title, sub) {
  ui.pad.className = "pad " + cls; ui.title.textContent = title; ui.sub.textContent = sub;
}
function renderHud() {
  ui.round.textContent = `${Math.min(G.times.length + 1, ROUNDS)}/${ROUNDS}`;
  ui.last.textContent = G.times.length ? G.times[G.times.length - 1] + " ms" : "–";
  ui.best.textContent = G.best ? G.best + " ms" : "–";
  ui.chips.replaceChildren(...Array.from({ length: ROUNDS }, (_, i) => {
    const li = document.createElement("li");
    if (G.times[i] != null) { li.className = "done"; li.textContent = G.times[i]; } else li.textContent = "·";
    return li;
  }));
}
const rating = avg => avg < 200 ? "Lightning" : avg < 250 ? "Fast" : avg < 350 ? "Good" : "Keep practising";

/* ---------- game flow ---------- */
function arm() {                                           // start the random wait before "go"
  clearTimer(); G.state = "wait";
  show("wait", "Wait for green…", "Don't tap yet");
  const delay = WAIT[0] + Math.random() * (WAIT[1] - WAIT[0]);
  G.timer = setTimeout(() => {
    G.timer = 0; G.state = "go"; show("go", "Tap!", "");
    G.t0 = performance.now();
  }, delay);
}
function start() { G.times = []; renderHud(); arm(); }
function react() {
  const ms = Math.round(performance.now() - G.t0);
  G.times.push(ms); G.state = "shown"; renderHud();
  if (G.times.length >= ROUNDS) return finish();
  show("ready", `${ms} ms`, "Tap for the next round");
}
function finish() {
  G.state = "done";
  const avg = Math.round(G.times.reduce((a, b) => a + b, 0) / ROUNDS);
  const record = !G.best || avg < G.best;
  if (record) { G.best = avg; store.set("reflexBest", avg); }
  renderHud();
  show("ready", `${avg} ms average`, `${rating(avg)}${record ? " · new best!" : ""} · tap to play again`);
}
function press() {
  switch (G.state) {
    case "ready": case "done": return start();
    case "shown": return arm();
    case "go": return react();
    case "wait":
      clearTimer(); G.state = "shown";
      return show("ready", "Too soon", "Tap to try this round again");
  }
}

/* ---------- input (registered once) ---------- */
ui.pad.addEventListener("pointerdown", e => { e.preventDefault(); press(); });
ui.pad.addEventListener("keydown", e => e.stopPropagation());   // handled by the document listener below
document.addEventListener("keydown", e => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === " " || e.key === "Enter") { e.preventDefault(); press(); }
});
// If the tab is hidden while waiting, don't let "go" fire unseen: restart the wait on return.
document.addEventListener("visibilitychange", () => {
  if (document.hidden && G.state === "wait") { clearTimer(); G.state = "shown"; show("ready", "Paused", "Tap to continue"); }
});

renderHud();
})();
