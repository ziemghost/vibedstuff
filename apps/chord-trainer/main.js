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

// ----- State --------------------------------------------------------------
const LOW = 60;          // C4 — fixed left-hand note, same for every chord
const HIGH = LOW + 24;   // two octaves up to C6

let list = CYCLES.maj7;
let idx = 0;
let dir = 1;             // +1 ascending 4ths, -1 descending 5ths

const nameEl = document.getElementById("name");
const notesEl = document.getElementById("notes");
const counterEl = document.getElementById("counter");
const pianoEl = document.getElementById("piano");

const piano = createPiano(pianoEl, { lowNote: LOW, highNote: HIGH });

function chordNotes(c) {
  const root = LOW + c.pc;
  return INTERVALS[c.q].map((i) => root + i);
}

function render() {
  const c = list[idx];
  nameEl.textContent = c.name;
  notesEl.textContent = c.notes;
  counterEl.textContent = `${idx + 1} / ${list.length}`;
  piano.highlight(chordNotes(c));
}

function next() { idx = (idx + dir + list.length) % list.length; render(); }
function prev() { idx = (idx - dir + list.length) % list.length; render(); }

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

document.querySelectorAll(".tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    list = CYCLES[btn.dataset.cycle];
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
const held = new Set();   // pitch classes currently held down

function targetPcs() {
  const c = list[idx];
  return new Set(INTERVALS[c.q].map((i) => (c.pc + i) % 12));
}

function isCorrect() {
  const target = targetPcs();
  if (held.size !== target.size) return false;
  for (const pc of target) if (!held.has(pc)) return false;
  return true;
}

function flashCorrect() {
  nameEl.classList.add("correct");
  setTimeout(() => nameEl.classList.remove("correct"), 220);
}

function setMidiStatus(on, text) {
  midiEl.classList.toggle("on", on);
  midiTextEl.textContent = text;
}

const midi = createMidi({
  onNoteOn: (note) => { held.add(note % 12); if (isCorrect()) { flashCorrect(); next(); } },
  onNoteOff: (note) => { held.delete(note % 12); },
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
