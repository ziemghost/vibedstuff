import "@/styles/theme.css";

// Tiny stateful backend on the box (FastAPI + SQLite behind Caddy HTTPS).
const API = "https://46-62-200-155.sslip.io";

const count = document.getElementById("count");
const label = document.getElementById("label");

fetch(`${API}/api/counter/visits/add_one`, { method: "POST" })
  .then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  })
  .then((data) => {
    count.classList.remove("loading");
    count.textContent = data.value.toLocaleString();
    label.textContent = data.value === 1 ? "visit so far" : "visits so far";
  })
  .catch((err) => {
    count.classList.remove("loading");
    count.textContent = "—";
    label.textContent = "couldn't reach the counter 😢";
    console.error(err);
  });
