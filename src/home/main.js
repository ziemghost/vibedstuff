import "@/styles/theme.css";
import { apps } from "./apps.js";

const base = import.meta.env.BASE_URL; // e.g. "/vibedstuff/"
const grid = document.getElementById("grid");

grid.innerHTML = apps
  .map(
    (a) => `
    <a class="app-card" href="${base}apps/${a.slug}/">
      <h2>${a.title}</h2>
      <p>${a.description}</p>
    </a>`
  )
  .join("");
