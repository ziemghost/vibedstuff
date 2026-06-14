// The lonely sad guy in a kayak, as a reusable inline SVG string.
// Animation classes (.boat, .wave, .rain, .scene) live in theme.css.
export const kayakSVG = `
<svg class="scene" viewBox="0 0 400 300" role="img"
     aria-label="A lonely sad man sitting in a kayak on the water under a small rain cloud">
  <!-- rain cloud -->
  <g transform="translate(78 38)">
    <ellipse cx="0"  cy="6"  rx="26" ry="17" fill="#3a4049" />
    <ellipse cx="26" cy="2"  rx="22" ry="18" fill="#454c57" />
    <ellipse cx="48" cy="9"  rx="20" ry="15" fill="#3a4049" />
    <g class="rain" stroke="#6da9d6" stroke-width="2.4" stroke-linecap="round">
      <line x1="10" y1="22" x2="10" y2="30" />
      <line x1="26" y1="24" x2="26" y2="32" />
      <line x1="42" y1="22" x2="42" y2="30" />
    </g>
  </g>

  <!-- water -->
  <g stroke="#2f6d8f" stroke-width="3" stroke-linecap="round" fill="none" opacity=".9">
    <path class="wave"   d="M-20 232 q 30 -12 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0" />
    <path class="wave b" d="M-20 252 q 30 -12 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0" opacity=".6"/>
    <path class="wave"   d="M-20 272 q 30 -12 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0" opacity=".4"/>
  </g>

  <g class="boat">
    <!-- paddle -->
    <g transform="rotate(-14 200 150)">
      <rect x="150" y="146" width="100" height="6" rx="3" fill="#8a5a2b" />
      <ellipse cx="150" cy="149" rx="9" ry="15" fill="#a76a32" />
      <ellipse cx="250" cy="149" rx="9" ry="15" fill="#a76a32" />
    </g>

    <!-- guy -->
    <g>
      <path d="M182 196 q18 -14 36 0 l-4 -34 q-14 -10 -28 0 z" fill="#3f7d6b" />
      <circle cx="200" cy="138" r="17" fill="#e9c39b" />
      <circle cx="194" cy="136" r="2.1" fill="#2a2e36" />
      <circle cx="206" cy="136" r="2.1" fill="#2a2e36" />
      <path d="M189 131 l7 2 M211 131 l-7 2" stroke="#2a2e36" stroke-width="1.6" stroke-linecap="round" fill="none"/>
      <path d="M194 147 q6 -6 12 0" stroke="#2a2e36" stroke-width="2" stroke-linecap="round" fill="none"/>
      <path d="M194 140 q-2 5 0 7 q2 -2 0 -7" fill="#6da9d6" />
    </g>

    <!-- kayak hull -->
    <path d="M118 206 q82 34 164 0 q-12 16 -32 18 l-100 0 q-20 -2 -32 -18 z" fill="#e8590c" />
    <ellipse cx="200" cy="208" rx="80" ry="9" fill="#c64a08" />
    <ellipse cx="200" cy="206" rx="70" ry="6" fill="#14161a" opacity=".55" />
  </g>
</svg>`;
