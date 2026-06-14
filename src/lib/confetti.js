// Tiny dependency-free canvas confetti. Call mountConfetti() once; it returns a
// burst(count) function. Creates its own fixed, click-through canvas if needed.
const COLORS = ["#e8590c", "#37b24d", "#6da9d6", "#f2c037", "#e64980", "#f2f4f7"];

export function mountConfetti() {
  let canvas = document.getElementById("confetti");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "confetti";
    document.body.appendChild(canvas);
  }
  const ctx = canvas.getContext("2d");
  let pieces = [];
  let running = false;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  addEventListener("resize", resize);

  function loop() {
    running = true;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of pieces) {
      p.vy += 0.22;      // gravity
      p.vx *= 0.99;      // air drag
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vrot;
      if (p.y > innerHeight * 0.55) p.life -= 0.02;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }
    pieces = pieces.filter((p) => p.life > 0 && p.y < innerHeight + 40);
    if (pieces.length) {
      requestAnimationFrame(loop);
    } else {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      running = false;
    }
  }

  return function burst(count = 180) {
    const cx = innerWidth / 2;
    const cy = innerHeight * 0.35;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 9;
      pieces.push({
        x: cx + (Math.random() - 0.5) * 120,
        y: cy + (Math.random() - 0.5) * 40,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 5,
        size: 5 + Math.random() * 7,
        color: COLORS[(Math.random() * COLORS.length) | 0],
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 0.3,
        life: 1,
      });
    }
    if (!running) loop();
  };
}

// Fire on load unless the user prefers reduced motion.
export function burstOnLoad(burst, count = 180, delay = 350) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  setTimeout(() => burst(count), delay);
}
