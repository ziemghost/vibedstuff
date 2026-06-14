import "@/styles/theme.css";
import { kayakSVG } from "@/lib/kayak.js";
import { mountConfetti, burstOnLoad } from "@/lib/confetti.js";

document.getElementById("scene").innerHTML = kayakSVG;

const burst = mountConfetti();
burstOnLoad(burst);
document.getElementById("cheer").addEventListener("click", () => burst(200));
