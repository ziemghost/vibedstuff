/**
 * Thin wrapper around the native Web MIDI API — no external dependency.
 *
 * Usage:
 *   const midi = createMidi({
 *     onNoteOn:  (note) => {...},   // note = MIDI number
 *     onNoteOff: (note) => {...},
 *     onDevices: (inputs) => {...}, // array of MIDIInput, called on connect/disconnect
 *     onStatus:  ({ ok, reason, error }) => {...},
 *   });
 *   midi.enable();
 *   midi.listenTo(inputId);         // choose which device to listen to
 */
export function createMidi({ onNoteOn, onNoteOff, onDevices, onStatus } = {}) {
  let access = null;
  let current = null;

  function handle(msg) {
    const [status, note, velocity] = msg.data;
    const cmd = status & 0xf0;
    if (cmd === 0x90 && velocity > 0) onNoteOn?.(note);
    else if (cmd === 0x80 || (cmd === 0x90 && velocity === 0)) onNoteOff?.(note);
  }

  function inputs() {
    return access ? [...access.inputs.values()] : [];
  }

  function listenTo(input) {
    // Accept an input object or an id string.
    if (typeof input === "string") input = inputs().find((i) => i.id === input);
    if (current) current.onmidimessage = null;
    current = input || null;
    if (current) current.onmidimessage = handle;
    return current;
  }

  async function enable() {
    if (!navigator.requestMIDIAccess) {
      onStatus?.({ ok: false, reason: "unsupported" });
      return;
    }
    onStatus?.({ ok: false, reason: "enabling" });
    try {
      access = await navigator.requestMIDIAccess({ sysex: false });
      access.onstatechange = () => onDevices?.(inputs());
      onDevices?.(inputs());
      onStatus?.({ ok: true });
    } catch (error) {
      console.error("Web MIDI enable failed:", error);
      onStatus?.({ ok: false, reason: "error", error });
    }
  }

  return { enable, inputs, listenTo, current: () => current };
}
