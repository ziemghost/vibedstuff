import "@/styles/theme.css";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Route record layout (arrays, so ~10k rows stay small over the wire):
// 0 name, 1 grade, 2 gradeIdx, 3 lengthM, 4 rockIdx, 5 areaIdx, 6 region, 7 style,
// 8 firstAscentYear, 9 protection, 10 isTraverse
const NAME = 0, GRADE = 1, GIDX = 2, LEN = 3, ROCK = 4, AREA = 5, REG = 6, STY = 7,
      YEAR = 8, PROT = 9, TRAV = 10;

// Grade colour ramp: the four bands Portal Górski prints on its own topos, so a
// colour means the same here as on the source. Never the theme accent, which means
// "you selected this".
const BANDS = ["--g1", "--g2", "--g3", "--g4"];
function bandOf(g) {
  if (!g) return -1;
  const m = /^VI\.(\d)/.exec(g);
  if (m) { const n = +m[1]; return n <= 1 ? 1 : (n <= 4 ? 2 : 3); }
  if (/^VI/.test(g)) return 1;
  return 0;
}

const T = {
  pl: {
    title: "Drogi wspinaczkowe na Jurze",
    sub: (r, k, v) => `${r} dróg · ${k} skał · ${v} rejonów`,
    search: "Szukaj drogi, skały lub rejonu…",
    grade: "Wycena", length: "Długość", protection: "Asekuracja",
    traverses: "Pokaż trawersy", reset: "Wyczyść filtry",
    regions: ["Cała Jura", "Południowa", "Środkowa", "Północna"],
    allAreas: "Wszystkie rejony",
    styles: { sport: "sportowa", trad: "trad", mixed: "mieszana", unknown: "brak danych" },
    th_route: "Droga", th_grade: "Wycena", th_length: "Długość", th_rock: "Skała",
    th_area: "Rejon", th_protection: "Asekuracja",
    count: (n, all, rocks) => `<b>${n}</b> z ${all} dróg · ${rocks} skał`,
    more: (n) => `Pokaż więcej (zostało ${n})`,
    empty: "Żadna droga nie pasuje do filtrów.",
    pinned: (r) => `przypięto: ${r}`,
    popupRoutes: (n) => `${n} ${n === 1 ? "pasująca droga" : "pasujących dróg"}`,
    popupHardest: "najtrudniejsza tutaj",
    you: "Tu jesteś", traverse: "trawers",
    locTitle: "Pokaż moją pozycję", locDenied: "Brak dostępu do lokalizacji",
    m: "m",
  },
  en: {
    title: "Jura Route Finder",
    sub: (r, k, v) => `${r} routes · ${k} rocks · ${v} areas`,
    search: "Search route, rock or area…",
    grade: "Grade", length: "Length", protection: "Protection",
    traverses: "Show traverses", reset: "Reset filters",
    regions: ["All regions", "Southern", "Middle", "Northern"],
    allAreas: "All areas",
    styles: { sport: "sport", trad: "trad", mixed: "mixed", unknown: "unknown" },
    th_route: "Route", th_grade: "Grade", th_length: "Length", th_rock: "Rock",
    th_area: "Area", th_protection: "Protection",
    count: (n, all, rocks) => `<b>${n}</b> of ${all} routes · ${rocks} rocks`,
    more: (n) => `Show more (${n} left)`,
    empty: "No routes match those filters.",
    pinned: (r) => `pinned to ${r}`,
    popupRoutes: (n) => `${n} matching route${n === 1 ? "" : "s"}`,
    popupHardest: "hardest here",
    you: "You are here", traverse: "traverse",
    locTitle: "Show my location", locDenied: "Location unavailable",
    m: "m",
  },
};
const STYLE_KEYS = ["sport", "trad", "mixed", "unknown"];

// Polish is the default; English only when the browser actually asks for English.
// An explicit choice via the flag buttons is remembered and always wins.
function pickLang() {
  const saved = localStorage.getItem("jura.lang");
  if (saved === "pl" || saved === "en") return saved;
  const langs = navigator.languages || [navigator.language || ""];
  return langs.some((l) => /^en\b/i.test(l)) ? "en" : "pl";
}
let lang = pickLang();
const t = () => T[lang];

const el = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const norm = (s) => s.toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[̀-ͯ]/g, "");
const nfmt = (n) => n.toLocaleString(lang === "pl" ? "pl-PL" : "en-GB");

let D, HAY, LADDER, ROCKS, AREAS, COORDS, gLim, lLim;
const state = {
  q: "", reg: -1, area: "", styles: { 0: 1, 1: 1, 2: 1, 3: 1 }, traverses: false,
  g: [0, 0], len: [0, 0], rock: -1, sort: null, dir: 1, shown: 0,
};
const PAGE = 150;
let filtered = [];
let mapRoutes = [];

boot();

async function boot() {
  D = await (await fetch(`${import.meta.env.BASE_URL}jura-routes.json`)).json();
  LADDER = D.ladder; ROCKS = D.rocks; AREAS = D.areas; COORDS = D.coords;
  HAY = D.routes.map((r) => norm(`${r[NAME]} ${ROCKS[r[ROCK]]} ${AREAS[r[AREA]]}`));

  const gs = D.routes.filter((r) => r[GIDX] >= 0).map((r) => r[GIDX]);
  const ls = D.routes.filter((r) => r[LEN] > 0).map((r) => r[LEN]);
  gLim = [Math.min(...gs), Math.max(...gs)];
  lLim = [Math.min(...ls), Math.max(...ls)];
  state.g = [...gLim];
  state.len = [...lLim];

  initMap();
  buildControls();
  applyLang();
  render();
}

function buildControls() {
  t().regions.forEach((label, i) => {
    const b = document.createElement("button");
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

  STYLE_KEYS.forEach((key, i) => {
    const b = document.createElement("button");
    b.className = "chip";
    b.dataset.style = key;
    b.setAttribute("aria-pressed", "true");
    b.onclick = () => {
      state.styles[i] = state.styles[i] ? 0 : 1;
      b.setAttribute("aria-pressed", String(!!state.styles[i]));
      render();
    };
    el("styles").appendChild(b);
  });

  el("tv").onchange = (e) => { state.traverses = e.target.checked; render(); };

  wireRange("grange", "g0", "g1", "gvals", gLim, state.g, (v) => LADDER[v] ?? "?", render);
  wireRange("lrange", "l0", "l1", "lvals", lLim, state.len, (v) => `${v} ${t().m}`, render);

  el("reset").onclick = () => {
    state.q = ""; el("q").value = "";
    state.reg = -1; state.area = ""; el("area").value = "";
    state.rock = -1;
    state.traverses = false; el("tv").checked = false;
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

  [...el("lang").querySelectorAll("button")].forEach((b) => {
    b.onclick = () => {
      lang = b.dataset.lang;
      localStorage.setItem("jura.lang", lang);
      applyLang();
      render();
    };
  });
}

function applyLang() {
  const d = t();
  document.documentElement.lang = lang;
  document.title = d.title;
  document.querySelectorAll("[data-t]").forEach((n) => { n.textContent = d[n.dataset.t]; });
  document.querySelectorAll("[data-t-ph]").forEach((n) => { n.placeholder = d[n.dataset.tPh]; });
  document.querySelectorAll("[data-t-aria]").forEach((n) => { n.setAttribute("aria-label", d[n.dataset.tAria]); });
  [...el("lang").querySelectorAll("button")].forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
  [...el("regs").children].forEach((b, i) => { b.textContent = d.regions[i]; });
  [...el("styles").children].forEach((b) => { b.textContent = d.styles[b.dataset.style]; });
  const first = el("area").querySelector("option[value='']");
  if (first) first.textContent = d.allAreas;
  else el("area").insertAdjacentHTML("afterbegin", `<option value="">${esc(d.allAreas)}</option>`);
  // Prepending an option does not move an existing selection, so the dropdown would
  // otherwise open showing the first valley instead of "all valleys".
  el("area").value = state.area;
  el("sub").textContent = d.sub(nfmt(D.routes.length), ROCKS.length, AREAS.length);
  if (locBtn) locBtn.title = d.locTitle;
  // range labels re-render through their own sync
  el("g0").dispatchEvent(new Event("input", { bubbles: true }));
  el("l0").dispatchEvent(new Event("input", { bubbles: true }));
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
let map, layer, meLayer, locBtn, watchId = null;
function initMap() {
  map = L.map("map", { scrollWheelZoom: false }).setView([50.35, 19.6], 9);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  layer = L.layerGroup().addTo(map);
  meLayer = L.layerGroup().addTo(map);

  const Locate = L.Control.extend({
    options: { position: "topleft" },
    onAdd() {
      locBtn = L.DomUtil.create("button", "locbtn");
      locBtn.type = "button";
      locBtn.textContent = "⌖";
      locBtn.title = t().locTitle;
      L.DomEvent.disableClickPropagation(locBtn);
      locBtn.onclick = toggleLocate;
      return locBtn;
    },
  });
  map.addControl(new Locate());
}

function toggleLocate() {
  if (watchId !== null) {                       // second press turns it off again
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
    meLayer.clearLayers();
    locBtn.dataset.state = "";
    return;
  }
  if (!navigator.geolocation) { locBtn.title = t().locDenied; return; }
  locBtn.dataset.state = "wait";
  // watchPosition rather than a one-shot read, so the dot tracks you while walking in.
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      locBtn.dataset.state = "on";
      meLayer.clearLayers();
      L.circle([latitude, longitude], { radius: accuracy, color: "#e8590c", weight: 1, fillOpacity: 0.12 }).addTo(meLayer);
      L.circleMarker([latitude, longitude], {
        radius: 6, color: "#fff", weight: 2, fillColor: "#e8590c", fillOpacity: 1,
      }).addTo(meLayer).bindPopup(t().you);
      if (!toggleLocate.centred) { map.setView([latitude, longitude], 13); toggleLocate.centred = true; }
    },
    () => { locBtn.dataset.state = ""; locBtn.title = t().locDenied; watchId = null; },
    { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
  );
}

let mapSig = null;
function drawMap(sig) {
  if (!layer) return;
  // Rebuild only when a filter the map actually reflects has changed. Pinning a rock
  // is not one of them, so clicking a marker leaves the map completely alone - the
  // markers keep their identity (and any open popup) instead of being torn down and
  // recreated underneath your finger on every render.
  if (sig === mapSig) return;
  mapSig = sig;
  layer.clearLayers();
  const byRock = new Map();
  for (const r of mapRoutes) {
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
      radius: Math.min(8, 2.2 + Math.sqrt(e.n) * 0.55),
      color: colour, weight: 1, fillColor: colour, fillOpacity: 0.55,
    }).addTo(layer);
    m.bindPopup(`<b>${esc(ROCKS[ri])}</b><br>${t().popupRoutes(e.n)}<br>${t().popupHardest}: ${esc(LADDER[e.hardest] ?? "—")}`);
    m.on("click", () => { state.rock = state.rock === ri ? -1 : ri; render(); });
  }
}

// ---- filtering + table ------------------------------------------------------
function render() {
  filtered = [];
  mapRoutes = [];
  const gNarrow = state.g[0] !== gLim[0] || state.g[1] !== gLim[1];
  const lNarrow = state.len[0] !== lLim[0] || state.len[1] !== lLim[1];
  for (let i = 0; i < D.routes.length; i++) {
    const r = D.routes[i];
    if (!state.traverses && r[TRAV]) continue;
    if (state.reg >= 0 && r[REG] !== state.reg) continue;
    if (state.area !== "" && r[AREA] !== +state.area) continue;
    if (!state.styles[r[STY]]) continue;
    // Ungraded / unmeasured routes drop out only once that slider is actually
    // narrowed, so an explicit range never silently swallows unknowns.
    if (r[GIDX] < 0 ? gNarrow : (r[GIDX] < state.g[0] || r[GIDX] > state.g[1])) continue;
    if (r[LEN] === 0 ? lNarrow : (r[LEN] < state.len[0] || r[LEN] > state.len[1])) continue;
    if (state.q && !HAY[i].includes(state.q)) continue;
    mapRoutes.push(r);                                  // map ignores the pin
    if (state.rock >= 0 && r[ROCK] !== state.rock) continue;
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

  const rocksShown = new Set(mapRoutes.map((r) => r[ROCK])).size;
  el("count").innerHTML = t().count(nfmt(filtered.length), nfmt(D.routes.length), rocksShown);
  el("pinned").textContent = state.rock >= 0 ? t().pinned(ROCKS[state.rock]) : "";
  drawMap(JSON.stringify([state.q, state.reg, state.area, state.styles, state.traverses,
                          state.g, state.len, lang]));
  paint(true);
}

function paint(reset) {
  const body = el("rows"), more = el("more");
  if (reset) { body.innerHTML = ""; state.shown = 0; }
  const next = filtered.slice(state.shown, state.shown + PAGE);
  if (!next.length && state.shown === 0) {
    body.innerHTML = `<tr><td class="empty" colspan="6">${esc(t().empty)}</td></tr>`;
    more.hidden = true;
    return;
  }
  body.insertAdjacentHTML("beforeend", next.map(rowHtml).join(""));
  state.shown += next.length;
  more.hidden = state.shown >= filtered.length;
  more.textContent = t().more(nfmt(filtered.length - state.shown));
}

function rowHtml(r) {
  const band = bandOf(r[GRADE]);
  const style = band >= 0 ? ` style="--gc:var(${BANDS[band]})"` : "";
  return `<tr>
    <td data-c="name">${esc(r[NAME])}${r[YEAR] ? ` <span class="dim">· ${r[YEAR]}</span>` : ""}${r[TRAV] ? ` <span class="tv">${esc(t().traverse)}</span>` : ""}</td>
    <td data-c="grade"><span class="grade"${style}>${esc(r[GRADE]) || "—"}</span></td>
    <td data-c="len" class="num">${r[LEN] ? `${r[LEN]} ${t().m}` : "—"}</td>
    <td data-c="rock" class="dim">${esc(ROCKS[r[ROCK]])}</td>
    <td data-c="area" class="dim">${esc(AREAS[r[AREA]])}</td>
    <td data-c="meta"><span class="style">${esc(t().styles[STYLE_KEYS[r[STY]]])}</span>${r[PROT] ? ` <span class="dim">${esc(r[PROT])}</span>` : ""}</td>
  </tr>`;
}
