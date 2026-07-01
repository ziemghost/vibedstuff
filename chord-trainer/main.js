import "@/styles/theme.css";
import { createPiano } from "@/components/piano.js";
import { createMidi } from "@/lib/midi.js";

// ----- Chord data ---------------------------------------------------------
// pc = pitch class of the root (C=0 … B=11). Octave is fixed at 4 (C4 = 60).
// Intervals come from the chord quality, so enharmonic spelling never matters.
const INTERVALS = { maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10] };

const MAJ7 = [
  ["Cmaj7", "C E G B", 0], ["Fmaj7", "F A C E", 5], ["Bbmaj7", "Bb D F A", 10],
  ["Ebmaj7", "Eb G Bb D", 3], ["Abmaj7", "Ab C Eb G", 8], ["Dbmaj7", "Db F Ab C", 1],
  ["Gbmaj7", "Gb Bb Db F", 6], ["Bmaj7", "B D# F# A#", 11], ["Emaj7", "E G# B D#", 4],
  ["Amaj7", "A C# E G#", 9], ["Dmaj7", "D F# A C#", 2], ["Gmaj7", "G B D F#", 7],
].map(([name, notes, pc]) => ({ name, notes, pc, q: "maj7" }));

const M7 = [
  ["Cm7", "C Eb G Bb", 0], ["Fm7", "F Ab C Eb", 5], ["Bbm7", "Bb Db F Ab", 10],
  ["Ebm7", "Eb Gb Bb Db", 3], ["Abm7", "Ab Cb Eb Gb", 8], ["Dbm7", "Db Fb Ab Cb", 1],
  ["F#m7", "F# A C# E", 6], ["Bm7", "B D F# A", 11], ["Em7", "E G B D", 4],
  ["Am7", "A C E G", 9], ["Dm7", "D F A C", 2], ["Gm7", "G Bb D F", 7],
].map(([name, notes, pc]) => ({ name, notes, pc, q: "m7" }));

const CYCLES = { maj7: MAJ7, m7: M7, all: MAJ7.concat(M7) };

// ----- H2 voice-led inversion cycles -------------------------------------
// The nearest-shape voice leading from the Keys & Groove system: every chord
// stays inside C4-C5 (60-71), each one found from the previous by moving the
// fewest notes. `midi` is the exact voicing (bottom-up); `notes` is spelled to
// match. maj7 chain starts C4 E4 G4 B4, m7 chain starts C4 Eb4 G4 Bb4.
const INV_MAJ7 = [
  { name: "Cmaj7",  notes: "C E G B",    midi: [60, 64, 67, 71] },
  { name: "Fmaj7",  notes: "C E F A",    midi: [60, 64, 65, 69] },
  { name: "Bbmaj7", notes: "D F A Bb",   midi: [62, 65, 69, 70] },
  { name: "Ebmaj7", notes: "D Eb G Bb",  midi: [62, 63, 67, 70] },
  { name: "Abmaj7", notes: "C Eb G Ab",  midi: [60, 63, 67, 68] },
  { name: "Dbmaj7", notes: "C Db F Ab",  midi: [60, 61, 65, 68] },
  { name: "Gbmaj7", notes: "Db F Gb Bb", midi: [61, 65, 66, 70] },
  { name: "Bmaj7",  notes: "D# F# A# B", midi: [63, 66, 70, 71] },
  { name: "Emaj7",  notes: "D# E G# B",  midi: [63, 64, 68, 71] },
  { name: "Amaj7",  notes: "C# E G# A",  midi: [61, 64, 68, 69] },
  { name: "Dmaj7",  notes: "C# D F# A",  midi: [61, 62, 66, 69] },
  { name: "Gmaj7",  notes: "D F# G B",   midi: [62, 66, 67, 71] },
].map((c) => ({ ...c, q: "maj7" }));

const INV_M7 = [
  { name: "Cm7",  notes: "C Eb G Bb",   midi: [60, 63, 67, 70] },
  { name: "Fm7",  notes: "C Eb F Ab",   midi: [60, 63, 65, 68] },
  { name: "Bbm7", notes: "Db F Ab Bb",  midi: [61, 65, 68, 70] },
  { name: "Ebm7", notes: "Db Eb Gb Bb", midi: [61, 63, 66, 70] },
  { name: "Abm7", notes: "Eb Gb Ab B",  midi: [63, 66, 68, 71] },
  { name: "Dbm7", notes: "Db E Ab B",   midi: [61, 64, 68, 71] },
  { name: "F#m7", notes: "C# E F# A",   midi: [61, 64, 66, 69] },
  { name: "Bm7",  notes: "D F# A B",    midi: [62, 66, 69, 71] },
  { name: "Em7",  notes: "D E G B",     midi: [62, 64, 67, 71] },
  { name: "Am7",  notes: "C E G A",     midi: [60, 64, 67, 69] },
  { name: "Dm7",  notes: "C D F A",     midi: [60, 62, 65, 69] },
  { name: "Gm7",  notes: "D F G Bb",    midi: [62, 65, 67, 70] },
].map((c) => ({ ...c, q: "m7" }));

const INV_CYCLES = { maj7: INV_MAJ7, m7: INV_M7, all: INV_MAJ7.concat(INV_M7) };

// ----- State --------------------------------------------------------------
const LOW = 60;          // C4 — fixed left-hand note, same for every chord
const HIGH = LOW + 24;   // two octaves up to C6

let cycleKey = "maj7";   // maj7 | m7 | all
let inv = false;         // false = root position, true = voice-led inversions (H2)
let idx = 0;
let dir = 1;             // +1 ascending 4ths, -1 descending 5ths

const nameEl = document.getElementById("name");
const notesEl = document.getElementById("notes");
const counterEl = document.getElementById("counter");
const pianoEl = document.getElementById("piano");
const posHintEl = document.getElementById("pos-hint");
const cycleEl = document.getElementById("cycle");

// The cycle of 4ths — the order every ladder follows. Shown as a strip so the
// running order (the thing that's easy to forget) is always in front of you.
const CYCLE_OF_4THS = ["C", "F", "Bb", "Eb", "Ab", "Db", "Gb", "B", "E", "A", "D", "G"];
CYCLE_OF_4THS.forEach((root) => {
  const s = document.createElement("span");
  s.textContent = root;
  cycleEl.appendChild(s);
});

const piano = createPiano(pianoEl, { lowNote: LOW, highNote: HIGH });

function currentList() {
  return (inv ? INV_CYCLES : CYCLES)[cycleKey];
}

function chordNotes(c) {
  if (inv) return c.midi;                         // exact voicing
  const root = LOW + c.pc;                          // root position from C4
  return INTERVALS[c.q].map((i) => root + i);
}

function render() {
  const list = currentList();
  if (idx >= list.length) idx = 0;
  const c = list[idx];
  nameEl.textContent = c.name;
  notesEl.textContent = c.notes;
  counterEl.textContent = `${idx + 1} / ${list.length}`;
  piano.highlight(chordNotes(c));

  // highlight where we are in the cycle of 4ths (12 roots, "both" wraps twice)
  const rootPos = idx % 12;
  const nextPos = ((idx + dir) % 12 + 12) % 12;
  [...cycleEl.children].forEach((el, i) => {
    el.classList.toggle("on", i === rootPos);
    el.classList.toggle("nextup", i === nextPos && i !== rootPos);
  });
}

function next() { const n = currentList().length; idx = (idx + dir + n) % n; render(); }
function prev() { const n = currentList().length; idx = (idx - dir + n) % n; render(); }

// ----- Controls -----------------------------------------------------------
document.getElementById("next").addEventListener("click", next);
document.getElementById("prev").addEventListener("click", prev);

const dirBtn = document.getElementById("dir");
dirBtn.addEventListener("click", () => {
  dir = -dir;
  dirBtn.textContent = dir === 1 ? "↑ Ascending 4ths" : "↓ Descending 5ths";
});

document.getElementById("show-kb").addEventListener("change", (e) => {
  pianoEl.style.display = e.target.checked ? "" : "none";
});

document.getElementById("inv-mode").addEventListener("change", (e) => {
  inv = e.target.checked;
  idx = 0;
  posHintEl.textContent = inv
    ? "voice-led inversions (H2), each staying inside C4–C5 — play the exact shape shown (any octave)."
    : "root position over two octaves from C.";
  held.clear();
  render();
});

document.querySelectorAll(".tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    cycleKey = btn.dataset.cycle;
    idx = 0;
    render();
  });
});

document.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.key === "ArrowRight") { e.preventDefault(); next(); }
  else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
});

// ----- MIDI ---------------------------------------------------------------
const midiEl = document.getElementById("midi");
const midiTextEl = document.getElementById("midi-text");
const selectEl = document.getElementById("midi-select");
const held = new Set();   // actual MIDI note numbers currently held down

// root-position match: correct set of pitch classes, any octave/voicing.
function isCorrectRoot() {
  const c = currentList()[idx];
  const target = new Set(INTERVALS[c.q].map((i) => (c.pc + i) % 12));
  const pcs = new Set([...held].map((n) => n % 12));
  if (pcs.size !== target.size) return false;
  for (const pc of target) if (!pcs.has(pc)) return false;
  return true;
}

// inversion match: correct pitch classes AND correct voicing shape (the
// intervals measured from the bass note), so it accepts the shape in any
// octave but insists on the right inversion.
function shape(notes) {
  const a = [...notes].sort((x, y) => x - y);
  const base = a[0];
  return a.map((n) => n - base).join(",");
}
function isCorrectInv() {
  const c = currentList()[idx];
  if (held.size !== c.midi.length) return false;
  const targetPcs = new Set(c.midi.map((n) => n % 12));
  const pcs = new Set([...held].map((n) => n % 12));
  if (pcs.size !== targetPcs.size) return false;
  for (const pc of targetPcs) if (!pcs.has(pc)) return false;
  return shape(held) === shape(c.midi);
}

function isCorrect() { return inv ? isCorrectInv() : isCorrectRoot(); }

function flashCorrect() {
  nameEl.classList.add("correct");
  setTimeout(() => nameEl.classList.remove("correct"), 220);
}

function setMidiStatus(on, text) {
  midiEl.classList.toggle("on", on);
  midiTextEl.textContent = text;
}

const midi = createMidi({
  onNoteOn: (note) => { held.add(note); if (isCorrect()) { flashCorrect(); next(); } },
  onNoteOff: (note) => { held.delete(note); },
  onDevices: (inputs) => {
    selectEl.innerHTML = "";
    if (!inputs.length) {
      selectEl.style.display = "none";
      held.clear();
      midi.listenTo(null);
      setMidiStatus(false, "No MIDI device found — plug one in, or use Space/arrows.");
      return;
    }
    inputs.forEach((inp) => {
      const opt = document.createElement("option");
      opt.value = inp.id;
      opt.textContent = inp.name;
      selectEl.appendChild(opt);
    });
    selectEl.style.display = "";
    const cur = midi.current();
    const chosen = (cur && inputs.find((i) => i.id === cur.id)) || inputs[0];
    selectEl.value = chosen.id;
    held.clear();
    midi.listenTo(chosen);
    setMidiStatus(true, "Listening to");
  },
  onStatus: ({ ok, reason, error }) => {
    if (ok) return; // device list message takes over
    const msg = {
      unsupported: "No Web MIDI support in this browser — try Chrome/Edge/Firefox. Space/arrows still work.",
      enabling: "Enabling MIDI…",
      error: "MIDI error: " + (error?.message || error) + " — use Space/arrows.",
    }[reason] || "Looking for MIDI…";
    setMidiStatus(false, msg);
  },
});

selectEl.addEventListener("change", () => {
  held.clear();
  midi.listenTo(selectEl.value);
  setMidiStatus(true, "Listening to");
});

midi.enable();
render();
