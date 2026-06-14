import "@/styles/theme.css";
import { apps } from "./apps.js";

const base = import.meta.env.BASE_URL; // e.g. "/vibedstuff/"

// Plain list of titled links — no descriptions.
document.getElementById("list").innerHTML = apps
  .map((a) => `<li><a href="${base}${a.slug}/">${a.title}</a></li>`)
  .join("");
