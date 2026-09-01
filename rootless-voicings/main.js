import "@/styles/theme.css";
import { createMidi } from "@/lib/midi.js";

// ----- Chord data ---------------------------------------------------------
// Rootless voicings in F major: the root is dropped, so what's left is
// 3-5-7-9. Matching is on pitch classes, so A-form vs B-form, inversion and
// octave never matter.
//
// On iii and vii the 9th lands a semitone above the root (Bb over A, F over
// E). That's a b9 — the textbook avoid note — but both are still in the key,
// so the drill takes them either way: 3-5-7-9 or plain 3-5-7 both pass.
//
// pcs = pitch classes (C=0), listed 3rd, 5th, 7th, 9th. `natural` marks the
// five whose 9th is a natural 9.
const CHORDS = [
  { numeral: "Imaj9",  name: "Fmaj9",   notes: "A C E G",   pcs: [9, 0, 4, 7],  natural: true },
  { numeral: "ii9",    name: "Gm9",     notes: "Bb D F A",  pcs: [10, 2, 5, 9], natural: true },
  { numeral: "iii9",   name: "Am9(b9)", notes: "C E G (Bb)", pcs: [0, 4, 7, 10], natural: false },
  { numeral: "IVmaj9", name: "Bbmaj9",  notes: "D F A C",   pcs: [2, 5, 9, 0],  natural: true },
  { numeral: "V9",     name: "C9",      notes: "E G Bb D",  pcs: [4, 7, 10, 2], natural: true },
  { numeral: "vi9",    name: "Dm9",     notes: "F A C E",   pcs: [5, 9, 0, 4],  natural: true },
  { numeral: "vii\u00f89", name: "Em7b5(b9)", notes: "G Bb D (F)", pcs: [7, 10, 2, 5], natural: false },
];

// What counts as correct. The b9 chords also accept the 7th-chord shape with
// the 9 left off; everywhere else the 9 is the point, so it's required.
const ACCEPTED = new Map(
  CHORDS.map((c) => [c, c.natural ? [c.pcs] : [c.pcs, c.pcs.slice(0, 3)]])
);

const SETS = {
  all: CHORDS,
  ninths: CHORDS.filter((c) => c.natural),
};

// ----- Voicing shown on reveal -------------------------------------------
// Stack the pitch classes in 3-5-7-9 order ascending from the first one at or
// above FLOOR, which puts every shape in the register these are actually
// played in.
const FLOOR = 55;        // G3 — bottom of the usual rootless range
const LOW = 48;          // C3
const HIGH = 84;         // C6

function voicing(pcs) {
  let n = FLOOR + ((pcs[0] - FLOOR) % 12 + 12) % 12;
  const out = [n];
  for (let i = 1; i < pcs.length; i++) {
    n += ((pcs[i] - n) % 12 + 12) % 12 || 12;   // next pc strictly above
    out.push(n);
  }
  return out;
}

// ----- State --------------------------------------------------------------
let setKey = "all";
let bag = [];            // shuffled queue, so nothing repeats until all are seen
let cur = CHORDS[0];
let revealed = false;
let streak = 0;
let correctCount = 0;
let showKb = false;

const numeralEl = document.getElementById("numeral");
const answerEl = document.getElementById("answer");
const nameEl = document.getElementById("name");
const notesEl = document.getElementById("notes");
const streakEl = document.getElementById("streak");
const correctEl = document.getElementById("correct");
const heldEl = document.getElementById("held");
const pianoEl = document.getElementById("piano");

pianoEl.style.display = "none";

// Loaded on first reveal, not on load. The keyboard is off by default here,
// and NexusUI opens a Web Audio context as soon as the module is imported, so
// importing it eagerly would cost every visitor ~130 kB and an audio context
// for something most of them never open. If the import or the build fails the
// drill carries on without the optional keyboard.
let piano = null;
let pianoBroken = false;
let pianoLoading = false;
function ensurePiano() {
  if (piano || pianoBroken || pianoLoading) return piano;
  pianoLoading = true;
  import("@/components/piano.js")
    .then(({ createPiano }) => { piano = createPiano(pianoEl, { lowNote: LOW, highNote: HIGH }); })
    .catch((err) => { console.error("keyboard unavailable:", err); pianoBroken = true; })
    .finally(() => { pianoLoading = false; render(); });
  return piano;
}

function refill() {
  const list = SETS[setKey];
  bag = list.slice();
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  // Don't let a reshuffle hand back the chord that's already on screen.
  if (bag.length > 1 && bag[0] === cur) [bag[0], bag[1]] = [bag[1], bag[0]];
}

function draw() {
  if (!bag.length) refill();
  cur = bag.pop();
  revealed = false;
  render();
}

function render() {
  numeralEl.textContent = cur.numeral;
  nameEl.textContent = cur.name;
  notesEl.textContent = cur.notes;
  answerEl.classList.toggle("hidden", !revealed);
  streakEl.textContent = streak;
  correctEl.textContent = correctCount;
  if (revealed && showKb && ensurePiano()) {
    pianoEl.style.display = "";
    piano.highlight(voicing(cur.pcs));
  } else {
    pianoEl.style.display = "none";
    piano?.clear();
  }
}

function reveal() {
  if (revealed) return;
  revealed = true;
  streak = 0;               // peeking breaks the streak
  render();
}

function skip() {
  streak = 0;
  draw();
}

// ----- Controls -----------------------------------------------------------
document.getElementById("reveal").addEventListener("click", reveal);
document.getElementById("skip").addEventListener("click", skip);

document.getElementById("show-kb").addEventListener("change", (e) => {
  showKb = e.target.checked;
  render();
});

document.querySelectorAll(".tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    setKey = btn.dataset.set;
    bag = [];
    streak = 0;
    draw();
  });
});

document.addEventListener("keydown", (e) => {
  if (e.code === "Space") { e.preventDefault(); skip(); }
  else if (e.key === "r" || e.key === "R") { e.preventDefault(); reveal(); }
});

// ----- MIDI ---------------------------------------------------------------
const midiEl = document.getElementById("midi");
const midiTextEl = document.getElementById("midi-text");
const selectEl = document.getElementById("midi-select");
const held = new Set();

const PC_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

// Correct = exactly the rootless pitch classes, nothing more, nothing less.
// Octave, inversion and doublings are free; sounding the root fails, which is
// the whole point of the drill.
function isCorrect() {
  const pcs = new Set([...held].map((n) => n % 12));
  return ACCEPTED.get(cur).some((target) => {
    if (pcs.size !== target.length) return false;
    return target.every((pc) => pcs.has(pc));
  });
}

function renderHeld() {
  const pcs = [...new Set([...held].map((n) => n % 12))].sort((a, b) => a - b);
  heldEl.textContent = pcs.map((p) => PC_NAMES[p]).join(" ");
}

function flashCorrect() {
  numeralEl.classList.add("correct");
  setTimeout(() => numeralEl.classList.remove("correct"), 220);
}

function setMidiStatus(on, text) {
  midiEl.classList.toggle("on", on);
  midiTextEl.textContent = text;
}

// Judge the chord once it has settled, not on every note-on. Grabbing a
// 5-note chord sends five separate messages, so an immediate check would see
// the correct 4 notes a millisecond before the root arrived and credit a
// voicing that did contain the root — exactly what this drill is testing for.
const SETTLE_MS = 90;
let settleTimer = null;

function judge() {
  settleTimer = null;
  if (!isCorrect()) return;
  correctCount++;
  if (!revealed) streak++;
  flashCorrect();
  draw();
}

const midi = createMidi({
  onNoteOn: (note) => {
    held.add(note);
    renderHeld();
    clearTimeout(settleTimer);
    settleTimer = setTimeout(judge, SETTLE_MS);
  },
  onNoteOff: (note) => { held.delete(note); renderHeld(); },
  onDevices: (inputs) => {
    selectEl.innerHTML = "";
    if (!inputs.length) {
      selectEl.style.display = "none";
      held.clear();
      renderHeld();
      midi.listenTo(null);
      setMidiStatus(false, "No MIDI device found — plug one in, or use Space/R.");
      return;
    }
    inputs.forEach((inp) => {
      const opt = document.createElement("option");
      opt.value = inp.id;
      opt.textContent = inp.name;
      selectEl.appendChild(opt);
    });
    selectEl.style.display = "";
    const prev = midi.current();
    const chosen = (prev && inputs.find((i) => i.id === prev.id)) || inputs[0];
    selectEl.value = chosen.id;
    held.clear();
    renderHeld();
    midi.listenTo(chosen);
    setMidiStatus(true, "Listening to");
  },
  onStatus: ({ ok, reason, error }) => {
    if (ok) return;
    const msg = {
      unsupported: "No Web MIDI support in this browser — try Chrome/Edge/Firefox. Space/R still work.",
      enabling: "Enabling MIDI…",
      error: "MIDI error: " + (error?.message || error) + " — use Space/R.",
    }[reason] || "Looking for MIDI…";
    setMidiStatus(false, msg);
  },
});

selectEl.addEventListener("change", () => {
  held.clear();
  renderHeld();
  midi.listenTo(selectEl.value);
  setMidiStatus(true, "Listening to");
});

midi.enable();
draw();
