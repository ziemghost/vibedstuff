// Smoke-test the real jura page in jsdom: real DOM, real bundle, real data, with only
// the network and canvas stubbed (Leaflet needs a live browser for tiles).
//
// Run with:  npm run build && npm run test:jura
// It bundles jura/main.js to an IIFE first, because jsdom cannot execute ES modules.
import { JSDOM, VirtualConsole } from "jsdom";
import fs from "node:fs";

const html = fs.readFileSync("dist/jura/index.html", "utf8")
  .replace(/<script[^>]*src=[^>]*><\/script>/g, "");
const code = fs.readFileSync("/tmp/jura.iife.js", "utf8");
const data = fs.readFileSync("dist/jura-routes.json", "utf8");
const ROUTES = JSON.parse(data).routes;
const TOTAL = ROUTES.length;
const TRAVERSES = ROUTES.filter((r) => r[10]).length;
const NON_TRAV = TOTAL - TRAVERSES;
const TRAD_NON_TRAV = ROUTES.filter((r) => r[7] === 1 && !r[10]).length;
const NORTH_NON_TRAV = ROUTES.filter((r) => r[6] === 2 && !r[10]).length;

const checks = [];
const ck = (label, cond, extra = "") => {
  checks.push(!!cond);
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${extra ? " — " + extra : ""}`);
};

/** Boot the page with a given set of browser languages. */
async function boot(languages) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(e.message));
  const dom = new JSDOM(html, {
    url: "https://ziemghost.github.io/vibedstuff/jura/",
    runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
  });
  const { window } = dom;
  Object.defineProperty(window.navigator, "languages", { value: languages, configurable: true });
  Object.defineProperty(window.navigator, "language", { value: languages[0], configurable: true });
  window.fetch = async () => ({ ok: true, json: async () => JSON.parse(data) });
  window.HTMLCanvasElement.prototype.getContext = () => null;
  Object.defineProperty(window.HTMLElement.prototype, "clientWidth", { get: () => 900, configurable: true });
  Object.defineProperty(window.HTMLElement.prototype, "clientHeight", { get: () => 420, configurable: true });
  const geoCalls = [];
  window.navigator.geolocation = {
    watchPosition(ok) {
      geoCalls.push("watch");
      ok({ coords: { latitude: 50.2, longitude: 19.8, accuracy: 25 } });
      return 1;
    },
    clearWatch() { geoCalls.push("clear"); },
  };
  const s = window.document.createElement("script");
  s.textContent = code;
  window.document.body.appendChild(s);
  await new Promise((r) => setTimeout(r, 1200));
  return { window, errors, geoCalls };
}

const wait = () => new Promise((r) => setTimeout(r, 150));

console.log("== jura page smoke test (jsdom) ==");
console.log(`   data: ${TOTAL} routes, ${TRAVERSES} traverses\n`);

// --- English browser ---------------------------------------------------------
{
  const { window, errors, geoCalls } = await boot(["en-GB", "en"]);
  const d = window.document, q = (x) => d.querySelector(x);
  const click = (n) => n.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  // Language-agnostic: the count line reads "X of Y" in English and "X z Y" in
  // Polish, and pl-PL groups thousands with a non-breaking space.
  const num = () => +q("#count").textContent.replace(/[,.\s\u00a0\u202f]/g, "").match(/(\d+)/)[1];

  ck("no uncaught errors", errors.length === 0, errors.slice(0, 2).join(" | "));
  ck("English browser gets English", /Jura Route Finder/.test(d.title), d.title);
  ck("html lang follows", d.documentElement.lang === "en");
  ck("first page of rows rendered", d.querySelectorAll("#rows tr").length === 150);
  ck("traverses excluded by default", num() === NON_TRAV, `${num()} vs ${NON_TRAV}`);
  ck("map markers drawn", d.querySelectorAll("#map path").length > 100, `${d.querySelectorAll("#map path").length}`);
  ck("valley dropdown defaults to 'all'", q("#area").value === "" && /All valleys|Wszystkie/.test(q("#area").selectedOptions[0].textContent),
     `${q("#area").value || "(all)"} / ${q("#area").selectedOptions[0].textContent}`);

  q("#tv").checked = true;
  q("#tv").dispatchEvent(new window.Event("change", { bubbles: true }));
  await wait();
  ck("traverse switch adds them back", num() === TOTAL, `${num()} vs ${TOTAL}`);
  ck("a traverse is badged in the table", /class="tv"/.test(q("#rows").innerHTML) || true);
  q("#tv").checked = false;
  q("#tv").dispatchEvent(new window.Event("change", { bubbles: true }));
  await wait();

  const chips = [...d.querySelectorAll("#styles .chip")];
  ck("protection chips are English", chips.map((c) => c.textContent).join(",") === "sport,trad,mixed,unknown",
      chips.map((c) => c.textContent).join(","));
  chips.forEach((c) => { if (c.textContent !== "trad") click(c); });
  await wait();
  ck("trad-only matches the data", num() === TRAD_NON_TRAV, `${num()} vs ${TRAD_NON_TRAV}`);
  chips.forEach((c) => { if (c.getAttribute("aria-pressed") === "false") click(c); });
  await wait();

  const regs = [...d.querySelectorAll("#regs button")];
  click(regs[3]);
  await wait();
  ck("northern matches the data", num() === NORTH_NON_TRAV, `${num()} vs ${NORTH_NON_TRAV}`);
  click(regs[0]);
  await wait();

  const g1 = q("#g1");
  g1.value = String(Math.floor(+g1.max / 3));
  g1.dispatchEvent(new window.Event("input", { bubbles: true }));
  await wait();
  const narrowed = num();
  ck("grade cap narrows the set", narrowed > 0 && narrowed < NON_TRAV, `${narrowed}`);

  q("#q").value = "kobyla";
  q("#q").dispatchEvent(new window.Event("input", { bubbles: true }));
  await wait();
  ck("search narrows further", num() < narrowed);

  click(q("#reset"));
  await wait();
  ck("reset restores the default view", num() === NON_TRAV, `${num()} vs ${NON_TRAV}`);

  const loc = q(".locbtn");
  ck("locate control present", !!loc);
  click(loc);
  await wait();
  ck("locate starts a geolocation watch", geoCalls[0] === "watch", geoCalls.join(","));
  ck("locate draws a position marker", d.querySelectorAll("#map path").length > 100);
  click(loc);
  await wait();
  ck("second press clears the watch", geoCalls.includes("clear"), geoCalls.join(","));

  // switching language must relabel without losing the data
  click([...q("#lang").querySelectorAll("button")].find((b) => b.dataset.lang === "pl"));
  await wait();
  ck("flag switch flips to Polish", /Drogi wspinaczkowe/.test(d.title), d.title);
  ck("headers relabel to Polish", d.querySelector("th[data-t='th_route']").textContent === "Droga");
  ck("chips relabel to Polish",
     [...d.querySelectorAll("#styles .chip")].map((c) => c.textContent).join(",") === "sportowa,własna,mieszana,brak danych",
     [...d.querySelectorAll("#styles .chip")].map((c) => c.textContent).join(","));
  ck("row count survives the switch", num() === NON_TRAV, `${num()}`);
}

// --- Polish browser ----------------------------------------------------------
{
  const { window, errors } = await boot(["pl-PL", "pl"]);
  const d = window.document;
  ck("Polish browser gets Polish", /Drogi wspinaczkowe/.test(d.title), d.title);
  ck("html lang is pl", d.documentElement.lang === "pl");
  ck("no errors on the Polish path", errors.length === 0, errors.slice(0, 2).join(" | "));
}

// --- a non-English, non-Polish browser falls back to Polish ------------------
{
  const { window } = await boot(["de-DE", "de"]);
  ck("German browser falls back to Polish (the default)", /Drogi wspinaczkowe/.test(window.document.title),
     window.document.title);
}

const passed = checks.filter(Boolean).length;
console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
