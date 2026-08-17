import "@/styles/theme.css";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Route record layout (kept as arrays so ~10k rows stay small over the wire):
// 0 name, 1 grade, 2 gradeIdx, 3 lengthM, 4 rockIdx, 5 areaIdx, 6 region, 7 style,
// 8 firstAscentYear, 9 protection
const NAME = 0, GRADE = 1, GIDX = 2, LEN = 3, ROCK = 4, AREA = 5, REG = 6, STY = 7, YEAR = 8, PROT = 9;
const REGN = ["southern", "middle", "northern", "unclassified"];
const STYN = ["sport", "trad", "mixed", "unknown"];

// Grade colour ramp. Four bands, matching the legend Portal Górski prints on its own
// topos, so a colour means the same thing here as on the source. Deliberately not the
// theme accent — accent means "you selected this", never "this route is hard".
const BANDS = ["--g1", "--g2", "--g3", "--g4"];
function bandOf(g) {
  if (!g) return -1;
  const m = /^VI\.(\d)/.exec(g);
  if (m) { const n = +m[1]; return n <= 1 ? 1 : (n <= 4 ? 2 : 3); }
  if (/^VI/.test(g)) return 1;
  return 0;
}

const el = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const norm = (s) => s.toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

let D, HAY, LADDER, ROCKS, AREAS, COORDS;
const state = {
  q: "", reg: -1, area: "", styles: { 0: 1, 1: 1, 2: 1, 3: 1 },
  g: [0, 0], len: [0, 0], rock: -1, sort: null, dir: 1, shown: 0,
};
const PAGE = 150;
let filtered = [];

boot();

async function boot() {
  const res = await fetch(`${import.meta.env.BASE_URL}jura-routes.json`);
  D = await res.json();
  LADDER = D.ladder; ROCKS = D.rocks; AREAS = D.areas; COORDS = D.coords;
  HAY = D.routes.map((r) => norm(`${r[NAME]} ${ROCKS[r[ROCK]]} ${AREAS[r[AREA]]}`));

  const gs = D.routes.filter((r) => r[GIDX] >= 0).map((r) => r[GIDX]);
  const ls = D.routes.filter((r) => r[LEN] > 0).map((r) => r[LEN]);
  const gLimits = [Math.min(...gs), Math.max(...gs)];
  const lLimits = [Math.min(...ls), Math.max(...ls)];
  state.g = [...gLimits];
  state.len = [...lLimits];

  el("sub").textContent =
    `${D.routes.length.toLocaleString("en")} routes · ${ROCKS.length} rocks · ${AREAS.length} valleys`;

  initMap();
  buildControls(gLimits, lLimits);
  render();
}

function buildControls(gLim, lLim) {
  ["All regions", "Southern", "Middle", "Northern"].forEach((label, i) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.setAttribute("aria-pressed", String(i === 0));
    b.onclick = () => {
      state.reg = i - 1;
      [...el("regs").children].forEach((c, j) => c.setAttribute("aria-pressed", String(j === i)));
      render();
    };
    el("regs").appendChild(b);
  });

  AREAS.map((a, i) => [a, i]).filter(([a]) => a)
    .sort((a, b) => a[0].localeCompare(b[0], "pl"))
    .forEach(([a, i]) => {
      const o = document.createElement("option");
      o.value = i; o.textContent = a; el("area").appendChild(o);
    });
  el("area").onchange = (e) => { state.area = e.target.value; render(); };
  el("q").oninput = (e) => { state.q = norm(e.target.value.trim()); render(); };

  STYN.forEach((s, i) => {
    const b = document.createElement("button");
    b.className = "chip";
    b.setAttribute("aria-pressed", "true");
    b.textContent = s;
    b.onclick = () => {
      state.styles[i] = state.styles[i] ? 0 : 1;
      b.setAttribute("aria-pressed", String(!!state.styles[i]));
      render();
    };
    el("styles").appendChild(b);
  });

  wireRange("grange", "g0", "g1", "gvals", gLim, state.g,
    (v) => LADDER[v] ?? "?", () => render());
  wireRange("lrange", "l0", "l1", "lvals", lLim, state.len,
    (v) => `${v} m`, () => render());

  el("reset").onclick = () => {
    state.q = ""; el("q").value = "";
    state.reg = -1; state.area = ""; el("area").value = "";
    state.rock = -1;
    [0, 1, 2, 3].forEach((k) => { state.styles[k] = 1; });
    [...el("styles").children].forEach((c) => c.setAttribute("aria-pressed", "true"));
    [...el("regs").children].forEach((c, j) => c.setAttribute("aria-pressed", String(j === 0)));
    state.g[0] = gLim[0]; state.g[1] = gLim[1];
    state.len[0] = lLim[0]; state.len[1] = lLim[1];
    el("g0").value = gLim[0]; el("g1").value = gLim[1];
    el("l0").value = lLim[0]; el("l1").value = lLim[1];
    el("g0").dispatchEvent(new Event("input", { bubbles: true }));
    el("l0").dispatchEvent(new Event("input", { bubbles: true }));
  };
  el("more").onclick = () => paint(false);

  document.querySelectorAll("th.s").forEach((th) => {
    th.onclick = () => {
      const k = th.dataset.s;
      state.dir = state.sort === k ? -state.dir : 1;
      state.sort = k;
      document.querySelectorAll("th.s").forEach((o) => o.setAttribute("aria-sort", "none"));
      th.setAttribute("aria-sort", state.dir > 0 ? "ascending" : "descending");
      render();
    };
  });
}

/** Two range inputs sharing one track. Thumbs cannot cross; the fill shows the span. */
function wireRange(wrapId, aId, bId, valId, limits, target, fmt, onChange) {
  const wrap = el(wrapId), a = el(aId), b = el(bId), out = el(valId);
  const fill = wrap.querySelector(".fill");
  [a, b].forEach((inp) => { inp.min = limits[0]; inp.max = limits[1]; inp.step = 1; });
  a.value = target[0]; b.value = target[1];
  const span = Math.max(1, limits[1] - limits[0]);
  const sync = (fire = true) => {
    let lo = +a.value, hi = +b.value;
    if (lo > hi) { if (document.activeElement === a) hi = lo, b.value = hi; else lo = hi, a.value = lo; }
    target[0] = lo; target[1] = hi;
    fill.style.left = `${((lo - limits[0]) / span) * 100}%`;
    fill.style.width = `${((hi - lo) / span) * 100}%`;
    out.textContent = `${fmt(lo)} — ${fmt(hi)}`;
    if (fire) onChange();
  };
  a.oninput = () => sync(); b.oninput = () => sync();
  sync(false);
}

// ---- map -------------------------------------------------------------------
let map, layer;
function initMap() {
  map = L.map("map", { scrollWheelZoom: false }).setView([50.35, 19.6], 9);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  layer = L.layerGroup().addTo(map);
}

function drawMap() {
  if (!layer) return;
  layer.clearLayers();
  const byRock = new Map();
  for (const r of filtered) {
    const c = COORDS[r[ROCK]];
    if (!c) continue;
    let e = byRock.get(r[ROCK]);
    if (!e) byRock.set(r[ROCK], (e = { n: 0, hardest: -1, c }));
    e.n++;
    if (r[GIDX] > e.hardest) e.hardest = r[GIDX];
  }
  const css = getComputedStyle(document.documentElement);
  for (const [ri, e] of byRock) {
    const band = bandOf(LADDER[e.hardest]);
    const colour = css.getPropertyValue(band >= 0 ? BANDS[band] : "--g0").trim();
    const m = L.circleMarker(e.c, {
      radius: Math.min(16, 4 + Math.sqrt(e.n) * 1.5),
      color: colour, weight: state.rock === ri ? 3 : 1.5,
      fillColor: colour, fillOpacity: state.rock === ri ? 0.85 : 0.4,
    }).addTo(layer);
    m.bindPopup(
      `<b>${esc(ROCKS[ri])}</b><br>${e.n} matching route${e.n === 1 ? "" : "s"}` +
      `<br>hardest here: ${esc(LADDER[e.hardest] ?? "—")}`
    );
    m.on("click", () => { state.rock = state.rock === ri ? -1 : ri; render(); });
  }
}

// ---- filtering + table ------------------------------------------------------
function render() {
  filtered = [];
  for (let i = 0; i < D.routes.length; i++) {
    const r = D.routes[i];
    if (state.reg >= 0 && r[REG] !== state.reg) continue;
    if (state.area !== "" && r[AREA] !== +state.area) continue;
    if (state.rock >= 0 && r[ROCK] !== state.rock) continue;
    if (!state.styles[r[STY]]) continue;
    // Ungraded / unmeasured routes are kept only while that slider is untouched,
    // otherwise an explicit range would silently include unknowns.
    if (r[GIDX] < 0 ? isNarrowed("g") : (r[GIDX] < state.g[0] || r[GIDX] > state.g[1])) continue;
    if (r[LEN] === 0 ? isNarrowed("len") : (r[LEN] < state.len[0] || r[LEN] > state.len[1])) continue;
    if (state.q && !HAY[i].includes(state.q)) continue;
    filtered.push(r);
  }

  if (state.sort) {
    const k = state.sort, d = state.dir;
    const key = {
      name: (r) => r[NAME], grade: (r) => r[GIDX], len: (r) => r[LEN],
      rock: (r) => ROCKS[r[ROCK]], area: (r) => AREAS[r[AREA]],
    }[k];
    filtered.sort((x, y) => {
      const a = key(x), b = key(y);
      return (typeof a === "number" ? a - b : String(a).localeCompare(String(b), "pl")) * d;
    });
  }

  const rocksShown = new Set(filtered.map((r) => r[ROCK])).size;
  el("count").innerHTML =
    `<b>${filtered.length.toLocaleString("en")}</b> of ${D.routes.length.toLocaleString("en")} routes · ${rocksShown} rocks`;
  el("pinned").textContent = state.rock >= 0 ? `pinned to ${ROCKS[state.rock]}` : "";
  drawMap();
  paint(true);
}

const limitsCache = {};
function isNarrowed(which) {
  const t = which === "g" ? state.g : state.len;
  const key = which === "g" ? GIDX : LEN;
  if (!limitsCache[which]) {
    const vals = D.routes.filter((r) => (key === GIDX ? r[GIDX] >= 0 : r[LEN] > 0)).map((r) => r[key]);
    limitsCache[which] = [Math.min(...vals), Math.max(...vals)];
  }
  const [lo, hi] = limitsCache[which];
  return t[0] !== lo || t[1] !== hi;
}

function paint(reset) {
  const body = el("rows"), more = el("more");
  if (reset) { body.innerHTML = ""; state.shown = 0; }
  const next = filtered.slice(state.shown, state.shown + PAGE);
  if (!next.length && state.shown === 0) {
    body.innerHTML = '<tr><td class="empty" colspan="6">No routes match those filters.</td></tr>';
    more.hidden = true;
    return;
  }
  body.insertAdjacentHTML("beforeend", next.map(rowHtml).join(""));
  state.shown += next.length;
  more.hidden = state.shown >= filtered.length;
  more.textContent = `Show more (${(filtered.length - state.shown).toLocaleString("en")} left)`;
}

function rowHtml(r) {
  const band = bandOf(r[GRADE]);
  const style = band >= 0 ? ` style="--gc:var(${BANDS[band]})"` : "";
  return `<tr>
    <td data-c="name">${esc(r[NAME])}${r[YEAR] ? ` <span class="dim">· ${r[YEAR]}</span>` : ""}</td>
    <td data-c="grade"><span class="grade"${style}>${esc(r[GRADE]) || "—"}</span></td>
    <td data-c="len" class="num">${r[LEN] ? `${r[LEN]} m` : "—"}</td>
    <td data-c="rock" class="dim">${esc(ROCKS[r[ROCK]])}</td>
    <td data-c="area" class="dim">${esc(AREAS[r[AREA]])}</td>
    <td data-c="meta"><span class="style">${STYN[r[STY]]}</span>${r[PROT] ? ` <span class="dim">${esc(r[PROT])}</span>` : ""}</td>
  </tr>`;
}
