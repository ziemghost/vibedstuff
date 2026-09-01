// Smoke-test the real rootless-voicings page in jsdom: real DOM, real bundle,
// with a fake MIDI device driving it.
//
// Run with:  npm run build && npm run test:rootless-voicings
// It bundles main.js to an IIFE first, because jsdom cannot execute ES modules.
import { JSDOM, VirtualConsole } from "jsdom";
import fs from "node:fs";

const html = fs.readFileSync("dist/rootless-voicings/index.html", "utf8")
  .replace(/<script[^>]*src=[^>]*><\/script>/g, "");
const code = fs.readFileSync("/tmp/rootless.iife.js", "utf8");

// The expected answers, written out independently of the page's own table.
// F major, rootless: 3rd, 5th, 7th, 9th. `root` is the pitch class the voicing
// must NOT contain. iii and viiø carry a b9, so they also pass as plain 3-5-7.
const PC = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };
const p = (s) => s.split(" ").map((n) => PC[n]);
const EXPECT = {
  "Imaj9":  { pcs: p("A C E G"),   root: PC.F,  b9: false },
  "ii9":    { pcs: p("Bb D F A"),  root: PC.G,  b9: false },
  "iii9":   { pcs: p("C E G Bb"),  root: PC.A,  b9: true },
  "IVmaj9": { pcs: p("D F A C"),   root: PC.Bb, b9: false },
  "V9":     { pcs: p("E G Bb D"),  root: PC.C,  b9: false },
  "vi9":    { pcs: p("F A C E"),   root: PC.D,  b9: false },
  "vii\u00f89": { pcs: p("G Bb D F"), root: PC.E, b9: true },
};

const checks = [];
const ck = (label, cond, extra = "") => {
  checks.push(!!cond);
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${extra ? " — " + extra : ""}`);
};

function boot() {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(e.message));
  const dom = new JSDOM(html, {
    url: "https://ziemghost.github.io/vibedstuff/rootless-voicings/",
    runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
  });
  const { window } = dom;
  window.HTMLCanvasElement.prototype.getContext = () => null;
  // NexusUI builds a Web Audio context; jsdom has none, so give it a stub.
  class FakeAudioContext {
    constructor() { this.destination = {}; this.currentTime = 0; this.sampleRate = 44100; }
    createGain() { return { gain: { value: 1, setValueAtTime() {} }, connect() {}, disconnect() {} }; }
    createOscillator() { return { frequency: { value: 440, setValueAtTime() {} }, connect() {}, disconnect() {}, start() {}, stop() {} }; }
    createBuffer() { return {}; }
    createBufferSource() { return { connect() {}, disconnect() {}, start() {}, stop() {} }; }
    createDynamicsCompressor() { return { connect() {}, disconnect() {} }; }
    createScriptProcessor() { return { connect() {}, disconnect() {}, onaudioprocess: null }; }
    createAnalyser() { return { connect() {}, disconnect() {}, getFloatFrequencyData() {}, getByteFrequencyData() {} }; }
    createChannelMerger() { return { connect() {}, disconnect() {} }; }
    createChannelSplitter() { return { connect() {}, disconnect() {} }; }
    createBiquadFilter() { return { frequency: { value: 0, setValueAtTime() {} }, Q: { value: 1 }, connect() {}, disconnect() {} }; }
    resume() { return Promise.resolve(); }
  }
  window.AudioContext = FakeAudioContext;
  window.webkitAudioContext = FakeAudioContext;

  // One fake MIDI input the page can attach its handler to.
  const input = { id: "fake-1", name: "Fake Keyboard", onmidimessage: null };
  window.navigator.requestMIDIAccess = async () => ({
    inputs: new Map([[input.id, input]]),
    onstatechange: null,
  });

  const s = window.document.createElement("script");
  s.textContent = code;
  window.document.body.appendChild(s);
  return { window, errors, input };
}

// Longer than the page's settle delay, so each simulated chord gets judged.
const wait = (ms = 200) => new Promise((r) => setTimeout(r, ms));

console.log("== rootless-voicings smoke test (jsdom) ==\n");

const { window, errors, input } = boot();
await wait(300);
const d = window.document;
const q = (x) => d.querySelector(x);
const numeral = () => q("#numeral").textContent;
const correctCount = () => +q("#correct").textContent;
const streak = () => +q("#streak").textContent;

// Play a set of pitch classes as a chord: spread them ascending from C4 so the
// voicing is a real playable shape rather than a cluster of bare pitch classes.
function chordFrom(pcs, base = 60) {
  let n = base + ((pcs[0] - base) % 12 + 12) % 12;
  const out = [n];
  for (let i = 1; i < pcs.length; i++) {
    n += ((pcs[i] - n) % 12 + 12) % 12 || 12;
    out.push(n);
  }
  return out;
}
function send(bytes) { input.onmidimessage?.({ data: bytes }); }
async function play(notes) {
  notes.forEach((n) => send([0x90, n, 100]));
  await wait();
  notes.forEach((n) => send([0x80, n, 0]));
  await wait();
}

ck("no uncaught errors on boot", errors.length === 0, errors.slice(0, 2).join(" | "));
ck("MIDI device picked up", /Listening to/.test(q("#midi-text").textContent), q("#midi-text").textContent);
ck("a numeral is showing", !!EXPECT[numeral()], numeral());
ck("answer starts hidden", q("#answer").classList.contains("hidden"));
ck("keyboard starts hidden", q("#piano").style.display === "none");

// --- every numeral the bag deals must accept its rootless voicing -----------
{
  const seen = new Set();
  let advanced = 0;
  for (let i = 0; i < 40; i++) {
    const cur = numeral();
    const exp = EXPECT[cur];
    if (!exp) { ck("unknown numeral appeared", false, cur); break; }
    seen.add(cur);
    const before = correctCount();
    await play(chordFrom(exp.pcs));
    if (correctCount() === before + 1) advanced++;
  }
  ck("all 7 numerals appear in the bag", seen.size === 7, [...seen].join(" "));
  ck("every correct voicing advanced", advanced === 40, `${advanced}/40`);
  ck("count tracks the advances", correctCount() === 40, String(correctCount()));
  ck("streak tracks unrevealed correct answers", streak() === 40, String(streak()));
}

// --- the root must fail, in any octave --------------------------------------
{
  const exp = EXPECT[numeral()];
  const before = correctCount();
  await play([...chordFrom(exp.pcs), 36 + exp.root]);
  ck("sounding the root is rejected", correctCount() === before, numeral());
}

// --- the root must fail even when it lands last ------------------------------
{
  const cur = numeral();
  const exp = EXPECT[cur];
  const before = correctCount();
  const notes = chordFrom(exp.pcs);
  notes.forEach((n) => send([0x90, n, 100]));      // correct set held...
  send([0x90, 36 + exp.root, 100]);                 // ...then the root, same grab
  await wait();
  [...notes, 36 + exp.root].forEach((n) => send([0x80, n, 0]));
  await wait();
  ck("root landing last still fails", correctCount() === before, cur);
}

// --- inversion and octave are free ------------------------------------------
{
  const cur = numeral();
  const exp = EXPECT[cur];
  const before = correctCount();
  const notes = chordFrom(exp.pcs, 48);
  await play([notes[1], notes[2], notes[3] ?? notes[0], notes[0] + 24]);  // reordered, spread
  ck("inversion in another octave still counts", correctCount() === before + 1, cur);
}

// --- 3-5-7 passes only on the two b9 chords ---------------------------------
{
  let checkedB9 = false, checkedNat = false;
  for (let i = 0; i < 40 && !(checkedB9 && checkedNat); i++) {
    const cur = numeral();
    const exp = EXPECT[cur];
    const before = correctCount();
    await play(chordFrom(exp.pcs.slice(0, 3)));
    const took = correctCount() === before + 1;
    if (exp.b9 && !checkedB9) { ck(`3-5-7 accepted on ${cur}`, took); checkedB9 = true; }
    if (!exp.b9 && !checkedNat) { ck(`3-5-7 rejected on ${cur}`, !took); checkedNat = true; }
    if (!took) await play(chordFrom(exp.pcs));   // move on
  }
  ck("both 3-5-7 cases were exercised", checkedB9 && checkedNat);
}

// --- reveal ------------------------------------------------------------------
{
  const cur = numeral();
  q("#reveal").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await wait();
  ck("reveal shows the answer", !q("#answer").classList.contains("hidden"));
  ck("reveal names the chord", q("#name").textContent.length > 0, q("#name").textContent);
  ck("reveal breaks the streak", streak() === 0, String(streak()));
  ck("reveal does not change the question", numeral() === cur);

  q("#show-kb").checked = true;
  q("#show-kb").dispatchEvent(new window.Event("change", { bubbles: true }));
  await wait();
  ck("keyboard appears once revealed", q("#piano").style.display !== "none");
}

// --- skip --------------------------------------------------------------------
{
  await play(chordFrom(EXPECT[numeral()].pcs));   // rebuild a streak
  const s0 = streak();
  const before = numeral();
  q("#skip").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await wait();
  ck("skip moves to another numeral", numeral() !== before, `${before} -> ${numeral()}`);
  ck("skip resets the streak", streak() === 0, `${s0} -> ${streak()}`);
  ck("skip re-hides the answer", q("#answer").classList.contains("hidden"));
}

// --- the natural-9ths tab drops iii and viiø ---------------------------------
{
  const tab = [...d.querySelectorAll(".tabs button")].find((b) => b.dataset.set === "ninths");
  tab.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await wait();
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    seen.add(numeral());
    await play(chordFrom(EXPECT[numeral()].pcs));
  }
  const b9s = [...seen].filter((n) => EXPECT[n].b9);
  ck("natural-9ths tab excludes the b9 chords", b9s.length === 0, b9s.join(" ") || "none seen");
  ck("natural-9ths tab still cycles all 5", seen.size === 5, [...seen].join(" "));
}

ck("still no uncaught errors", errors.length === 0, errors.slice(0, 2).join(" | "));

const passed = checks.filter(Boolean).length;
console.log(`\n${passed}/${checks.length} checks passed`);
process.exit(passed === checks.length ? 0 : 1);
