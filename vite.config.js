import { defineConfig } from "vite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, existsSync } from "node:fs";

const root = dirname(fileURLToPath(import.meta.url));
const appsDir = resolve(root, "apps");

// Every page is its own HTML entry point. The landing page lives at the root,
// and each app is auto-discovered at apps/<name>/index.html — so adding a new
// page never requires touching this config.
const input = { main: resolve(root, "index.html") };
for (const name of readdirSync(appsDir)) {
  const html = resolve(appsDir, name, "index.html");
  if (existsSync(html)) input[name] = html;
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
