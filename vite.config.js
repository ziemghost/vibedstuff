import { defineConfig } from "vite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, existsSync } from "node:fs";

const root = dirname(fileURLToPath(import.meta.url));

// Each page is its own top-level folder with an index.html, served at
// /vibedstuff/<name>/. The landing page is the root index.html. New page =
// new folder; no config change needed.
const SKIP = new Set(["src", "node_modules", "dist", ".git", ".github", "public", ".vite"]);
const input = { main: resolve(root, "index.html") };
for (const entry of readdirSync(root, { withFileTypes: true })) {
  if (!entry.isDirectory() || SKIP.has(entry.name)) continue;
  const html = resolve(root, entry.name, "index.html");
  if (existsSync(html)) input[entry.name] = html;
}

export default defineConfig({
  // Served from https://<user>.github.io/vibedstuff/
  base: "/vibedstuff/",
  resolve: {
    alias: { "@": resolve(root, "src") },
  },
  build: {
    rollupOptions: { input },
  },
});
