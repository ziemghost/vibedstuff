import Nexus from "nexusui";

const accentColor = () =>
  getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#e8590c";

/**
 * Reusable piano keyboard built on NexusUI.
 *
 * @param {HTMLElement|string} target  container element or selector
 * @param {object} [opts]
 * @param {number} [opts.lowNote=60]   lowest MIDI note (C4)
 * @param {number} [opts.highNote=84]  highest MIDI note (C6) — inclusive
 * @param {[number,number]} [opts.size=[780,150]]
 * @returns {{ highlight(notes:number[]):void, clear():void, el:object, destroy():void }}
 */
export function createPiano(target, { lowNote = 60, highNote = 84, size = [780, 150] } = {}) {
  const piano = new Nexus.Piano(target, { size, mode: "button", lowNote, highNote });
  piano.colorize("accent", accentColor());

  let active = [];

  return {
    el: piano,
    /** Light up exactly these MIDI notes, clearing whatever was lit before. */
    highlight(notes) {
      active.forEach((n) => piano.toggleKey(n, false));
      active = notes.slice();
      active.forEach((n) => piano.toggleKey(n, true));
    },
    clear() {
      active.forEach((n) => piano.toggleKey(n, false));
      active = [];
    },
    destroy() {
      piano.destroy();
    },
  };
}
