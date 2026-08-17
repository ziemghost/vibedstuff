// Smoke-test the real jura page in jsdom: real DOM, real bundle, real data,
// with only the network and canvas stubbed (Leaflet needs a live browser for tiles).
import { JSDOM, VirtualConsole } from "jsdom";
import fs from "node:fs";

// Run with:  npm run build && npm run test:jura
// Bundles jura/main.js to an IIFE first (jsdom cannot execute ES modules).

const html = fs.readFileSync("dist/jura/index.html", "utf8")
  .replace(/<script[^>]*src=[^>]*><\/script>/g, "");
const code = fs.readFileSync("/tmp/jura.iife.js", "utf8");
const data = fs.readFileSync("dist/jura-routes.json", "utf8");

const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push(e.message));
vc.on("error", (m) => errors.push(String(m)));

const dom = new JSDOM(html, {
  url: "https://ziemghost.github.io/vibedstuff/jura/",
  runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
});
const { window } = dom;
window.fetch = async () => ({ ok: true, json: async () => JSON.parse(data) });
window.HTMLCanvasElement.prototype.getContext = () => null;
Object.defineProperty(window.HTMLElement.prototype, "clientWidth", { get: () => 900, configurable: true });
Object.defineProperty(window.HTMLElement.prototype, "clientHeight", { get: () => 420, configurable: true });

const s = window.document.createElement("script");
s.textContent = code;
window.document.body.appendChild(s);
await new Promise((r) => setTimeout(r, 1200));

const d = window.document, q = (x) => d.querySelector(x);
const checks = [];
const ck = (label, cond, extra = "") => { checks.push(!!cond); console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${extra ? " — " + extra : ""}`); };
const click = (n) => n.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
const wait = () => new Promise((r) => setTimeout(r, 150));

console.log("== jura page smoke test (jsdom) ==");
ck("no uncaught errors", errors.length === 0, errors.slice(0, 2).join(" | "));
ck("subtitle populated", /9,852 routes/.test(q("#sub").textContent), q("#sub").textContent);
ck("first page of rows rendered", d.querySelectorAll("#rows tr").length === 150);
ck("count shows the full set", /9,852<\/b> of 9,852/.test(q("#count").innerHTML), q("#count").textContent);
ck("region buttons built", d.querySelectorAll("#regs button").length === 4);
ck("valley dropdown built", d.querySelectorAll("#area option").length === 49, `${d.querySelectorAll("#area option").length}`);
ck("protection chips built", d.querySelectorAll("#styles .chip").length === 4);
ck("grade range labelled", /—/.test(q("#gvals").textContent), q("#gvals").textContent);
ck("length range labelled", /m/.test(q("#lvals").textContent), q("#lvals").textContent);
ck("map markers drawn", d.querySelectorAll("#map path").length > 100, `${d.querySelectorAll("#map path").length} markers`);

const chips = [...d.querySelectorAll("#styles .chip")];
chips.forEach((c) => { if (c.textContent !== "trad") click(c); });
await wait();
ck("trad-only gives 1,697", /1,697<\/b> of/.test(q("#count").innerHTML), q("#count").textContent);
chips.forEach((c) => { if (c.getAttribute("aria-pressed") === "false") click(c); });
await wait();

const regs = [...d.querySelectorAll("#regs button")];
click(regs[3]);
await wait();
ck("northern region gives 3,695", /3,695<\/b> of/.test(q("#count").innerHTML), q("#count").textContent);
click(regs[0]);
await wait();

const g1 = q("#g1");
g1.value = String(Math.floor(+g1.max / 3));
g1.dispatchEvent(new window.Event("input", { bubbles: true }));
await wait();
const narrowed = +q("#count").textContent.replace(/,/g, "").match(/(\d+) of/)[1];
ck("grade cap narrows the set", narrowed > 0 && narrowed < 9852, `${narrowed} routes`);

q("#q").value = "kobyla";
q("#q").dispatchEvent(new window.Event("input", { bubbles: true }));
await wait();
ck("search narrows further", +q("#count").textContent.replace(/,/g, "").match(/(\d+) of/)[1] < narrowed);

click(q("#reset"));
await wait();
ck("reset restores everything", /9,852<\/b> of 9,852/.test(q("#count").innerHTML), q("#count").textContent);

const passed = checks.filter(Boolean).length;
console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
