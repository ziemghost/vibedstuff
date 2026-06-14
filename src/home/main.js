import "@/styles/theme.css";
import { apps } from "./apps.js";
import { kayakSVG } from "@/lib/kayak.js";
import { mountConfetti, burstOnLoad } from "@/lib/confetti.js";

const base = import.meta.env.BASE_URL; // e.g. "/vibedstuff/"

// Plain list of titled links — no descriptions.
document.getElementById("list").innerHTML = apps
  .map((a) => `<li><a href="${base}apps/${a.slug}/">${a.title}</a></li>`)
  .join("");

// The lonely guy lives on the home page too, because why not.
document.getElementById("scene").innerHTML = kayakSVG;

const burst = mountConfetti();
burstOnLoad(burst);
document.getElementById("scene").addEventListener("click", () => burst(200));
