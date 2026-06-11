# vibedstuff

A collection of small, single-purpose web toys, built with [Vite](https://vitejs.dev/)
and deployed to GitHub Pages.

**Live:** https://ziemghost.github.io/vibedstuff/

## Structure

```
index.html              # landing page (lists all apps)
apps/<slug>/
  index.html            # one HTML entry point per app
  main.js               # app logic
src/
  components/           # reusable UI built on libs (e.g. piano.js → NexusUI)
  lib/                  # framework-free helpers (e.g. midi.js → Web MIDI)
  styles/theme.css      # shared dark theme + UI primitives
  home/                 # landing-page logic + app registry
vite.config.js          # multi-page build; auto-discovers apps/*/index.html
.github/workflows/      # build + deploy to Pages on push to main
```

## Develop

```bash
npm install
npm run dev        # local dev server with HMR
npm run build      # production build to dist/
npm run preview    # preview the built site
```

## Add a new page

1. Create `apps/<slug>/index.html` and `apps/<slug>/main.js`.
2. Import shared pieces with the `@` alias, e.g. `import "@/styles/theme.css"`.
3. Add an entry to `src/home/apps.js` so it shows on the landing page.

The Vite config auto-discovers `apps/*/index.html`, so no build config changes
are needed. Push to `main` and the site redeploys automatically.

## Shared components

- **`@/components/piano.js`** — `createPiano(target, { lowNote, highNote })`,
  returns `{ highlight(notes), clear(), destroy() }`. Wraps NexusUI.
- **`@/lib/midi.js`** — `createMidi({ onNoteOn, onNoteOff, onDevices, onStatus })`
  over the native Web MIDI API. `enable()` / `listenTo(idOrInput)`.
