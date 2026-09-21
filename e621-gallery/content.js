(() => {
  "use strict";
  if (window.__e6gLoaded) return;
  window.__e6gLoaded = true;

  const GAP = 256;
  const MAX_ZOOM = 8;
  const PRELOAD = 2;
  const FIT = 0.94;
  const VIDEO_EXT = new Set(["webm", "mp4"]);
  const POST_SEL = "article.post-preview, article[data-id], .post-preview[data-id]";
  const RESUME_KEY = "__e6g_resume";
  const PANEL_KEY = "__e6g_tags_open";
  const CATEGORIES = ["artist", "copyright", "character", "species", "general", "meta", "lore", "invalid"];

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const px = (n) => `${Math.round(n * 100) / 100}px`;

  let posts = [];
  let slides = [];
  let index = 0;
  let isOpen = false;
  let root, track, hudPos, hudZoom, hudLink, mutedHint, panel, panelBody, tagsBtn;
  let tagToken = 0;

  // ---------------------------------------------------------------- posts

  function dsPick(ds, ...names) {
    for (const n of names) if (ds[n]) return ds[n];
    return null;
  }

  function readPost(el) {
    const ds = el.dataset;
    const img = el.querySelector("img");
    const id = dsPick(ds, "id") || (el.id.match(/\d+/) || [])[0] || null;
    return {
      el,
      id,
      ext: String(dsPick(ds, "fileExt", "ext") || "").toLowerCase(),
      full: dsPick(ds, "fileUrl", "largeFileUrl"),
      sample: dsPick(ds, "largeFileUrl", "sampleUrl"),
      preview: dsPick(ds, "previewFileUrl", "previewUrl") ||
        (img && (img.currentSrc || img.src || img.dataset.src || img.dataset.original)) || null,
      w: Number(dsPick(ds, "width", "fileWidth")) || 0,
      h: Number(dsPick(ds, "height", "fileHeight")) || 0,
      asked: false,
    };
  }

  function mediaUrl(p) {
    // gif and video must come from the original file; a "sample" of those is a still frame.
    if (VIDEO_EXT.has(p.ext) || p.ext === "gif") return p.full || p.sample;
    return p.sample || p.full;
  }

  // One request per post at most, shared by the url and the tag lookups.
  const postCache = new Map();
  function fetchPost(p) {
    if (!p.id) return Promise.resolve(null);
    if (!postCache.has(p.id)) {
      postCache.set(
        p.id,
        fetch(`/posts/${p.id}.json`, { credentials: "same-origin", headers: { Accept: "application/json" } })
          .then((r) => (r.ok ? r.json() : null))
          .then((body) => (body && (body.post || body)) || null)
          .catch(() => null),
      );
    }
    return postCache.get(p.id);
  }

  // The markup carries the urls on most pages; this fills the gaps.
  async function ensureUrls(p) {
    if (mediaUrl(p)) return;
    const post = await fetchPost(p);
    if (!post || !post.file) return;
    p.ext = String(post.file.ext || p.ext).toLowerCase();
    p.full = post.file.url || p.full;
    p.sample = (post.sample && post.sample.url) || p.sample;
    p.preview = (post.preview && post.preview.url) || p.preview;
    p.w = post.file.width || p.w;
    p.h = post.file.height || p.h;
  }

  // data-tags has no categories, so the api is the real source; it is the fallback.
  async function ensureTags(p) {
    if (p.tags) return p.tags;
    const post = await fetchPost(p);
    if (post && post.tags && typeof post.tags === "object") {
      p.tags = post.tags;
    } else {
      const raw = (p.el && p.el.dataset.tags) || "";
      p.tags = raw ? { general: raw.split(/\s+/).filter(Boolean) } : {};
    }
    return p.tags;
  }

  // ---------------------------------------------------------------- filter

  function searchTags() {
    const raw = new URL(location.href).searchParams.get("tags") || "";
    return raw.split(/\s+/).filter(Boolean);
  }

  function tagState(tag) {
    const lc = tag.toLowerCase();
    for (const t of searchTags()) {
      if (t.toLowerCase() === lc) return "+";
      if (t.toLowerCase() === `-${lc}`) return "-";
    }
    return null;
  }

  function applyTag(tag, mode) {
    const url = new URL(location.href);
    const lc = tag.toLowerCase();
    const kept = searchTags().filter((t) => {
      const bare = (t.startsWith("-") ? t.slice(1) : t).toLowerCase();
      return bare !== lc;
    });
    // Clicking the side a tag is already on removes it again.
    if (tagState(tag) !== mode) kept.push(mode === "-" ? `-${tag}` : tag);
    url.pathname = "/posts";
    if (kept.length) url.searchParams.set("tags", kept.join(" "));
    else url.searchParams.delete("tags");
    url.searchParams.delete("page");
    location.href = url.href;
  }

  // ---------------------------------------------------------------- layout

  function fittedSize(s) {
    const maxW = window.innerWidth * FIT;
    const maxH = window.innerHeight * FIT;
    const nw = s.natural.w;
    const nh = s.natural.h;
    if (!nw || !nh) return { w: maxH * 0.72, h: maxH };
    // Only refuse to upscale once the real media reported its size; before that the
    // thumbnail's aspect ratio is all we have and fitting to the viewport avoids a jump.
    const k = s.trueSize
      ? Math.min(maxW / nw, maxH / nh, 1)
      : Math.min(maxW / nw, maxH / nh);
    return { w: nw * k, h: nh * k };
  }

  function layout(s) {
    s.fit = fittedSize(s);
    // The window grows with zoom until it fills the screen, then it clips and you pan.
    const sw = Math.min(s.fit.w * s.zoom, window.innerWidth);
    const sh = Math.min(s.fit.h * s.zoom, window.innerHeight);
    s.stage.style.width = px(sw);
    s.stage.style.height = px(sh);
    s.view = { w: sw, h: sh };
    clampPan(s);
    paint(s);
  }

  function clampPan(s) {
    const ox = Math.max(0, (s.fit.w * s.zoom - s.view.w) / 2);
    const oy = Math.max(0, (s.fit.h * s.zoom - s.view.h) / 2);
    s.panX = clamp(s.panX, -ox, ox);
    s.panY = clamp(s.panY, -oy, oy);
    s.stage.classList.toggle("e6g-pannable", ox > 0.5 || oy > 0.5);
  }

  function paint(s) {
    const t = `translate(-50%, -50%) translate(${px(s.panX)}, ${px(s.panY)}) scale(${s.zoom})`;
    for (const el of s.stage.children) {
      el.style.width = px(s.fit.w);
      el.style.height = px(s.fit.h);
      el.style.transform = t;
    }
  }

  function layoutAll() {
    for (const s of slides) layout(s);
  }

  function center(animate) {
    const s = slides[index];
    if (!s) return;
    const target = s.wrap.offsetLeft + s.wrap.offsetWidth / 2 - window.innerWidth / 2;
    track.style.transition = animate ? "transform .22s ease" : "none";
    track.style.transform = `translateX(${px(-target)})`;
  }

  // ---------------------------------------------------------------- media

  async function loadMedia(i) {
    const s = slides[i];
    const p = posts[i];
    if (!s || s.requested) return;
    s.requested = true;
    await ensureUrls(p);
    const url = mediaUrl(p);
    if (!url) {
      s.wrap.classList.add("e6g-failed");
      return;
    }
    let el;
    if (VIDEO_EXT.has(p.ext)) {
      el = document.createElement("video");
      el.loop = true;
      el.controls = true;
      el.preload = "metadata";
      el.playsInline = true;
      el.addEventListener("loadedmetadata", () => {
        if (el.videoWidth) {
          s.natural = { w: el.videoWidth, h: el.videoHeight };
          s.trueSize = true;
        }
        ready(i, el);
      });
      // A manual pause must stick: the post is never auto-played again.
      el.addEventListener("pause", () => {
        s.played = true;
      });
      el.src = url;
      s.video = el;
    } else {
      el = document.createElement("img");
      el.decoding = "async";
      el.addEventListener("load", () => {
        s.natural = { w: el.naturalWidth, h: el.naturalHeight };
        s.trueSize = true;
        ready(i, el);
      });
      el.addEventListener("error", () => s.wrap.classList.add("e6g-failed"));
      el.src = url;
    }
    el.className = "e6g-media";
    s.stage.appendChild(el);
    s.media = el;
    if (i === index) startPlayback(i);
  }

  function ready(i, el) {
    const s = slides[i];
    el.classList.add("e6g-ready");
    if (s.thumb) s.thumb.classList.add("e6g-hide");
    layout(s);
    center(true);
    if (i === index) startPlayback(i);
  }

  // Autoplay with sound on first arrival only. Leaving the post pauses it, and coming
  // back does not restart it.
  function startPlayback(i) {
    const s = slides[i];
    if (!s || !s.video || s.played) return;
    s.played = true;
    s.video.muted = false;
    s.video.volume = 1;
    const attempt = s.video.play();
    if (attempt && attempt.catch) {
      attempt.catch(() => {
        // Firefox refused audible autoplay; fall back to muted so something plays.
        s.video.muted = true;
        showMutedHint();
        const retry = s.video.play();
        if (retry && retry.catch) retry.catch(() => {});
      });
    }
  }

  let mutedHintTimer = 0;
  function showMutedHint() {
    if (!mutedHint) return;
    mutedHint.hidden = false;
    clearTimeout(mutedHintTimer);
    mutedHintTimer = setTimeout(() => {
      mutedHint.hidden = true;
    }, 3500);
  }

  function pauseOthers(active) {
    slides.forEach((s, j) => {
      if (s.video && j !== active && !s.video.paused) s.video.pause();
    });
  }

  // ---------------------------------------------------------------- build

  function buildChrome() {
    root = document.createElement("div");
    root.className = "e6g-root";
    root.hidden = true;

    track = document.createElement("div");
    track.className = "e6g-track";
    root.appendChild(track);

    const hud = document.createElement("div");
    hud.className = "e6g-hud";
    hudPos = document.createElement("span");
    hudLink = document.createElement("a");
    hudLink.target = "_blank";
    hudLink.rel = "noopener";
    hudZoom = document.createElement("span");
    hudZoom.className = "e6g-zoom";
    const hint = document.createElement("span");
    hint.textContent = "← → move · wheel zoom · t tags · 0 reset · esc close";
    hud.append(hudPos, hudLink, hudZoom, hint);
    root.appendChild(hud);

    mutedHint = document.createElement("div");
    mutedHint.className = "e6g-muted-hint";
    mutedHint.hidden = true;
    mutedHint.textContent = "autoplay with sound was blocked — unmute in the player";
    root.appendChild(mutedHint);

    panel = document.createElement("aside");
    panel.className = "e6g-panel";
    panel.hidden = true;
    panelBody = document.createElement("div");
    panelBody.className = "e6g-panel-body";
    panel.appendChild(panelBody);
    root.appendChild(panel);

    tagsBtn = document.createElement("button");
    tagsBtn.className = "e6g-tags-toggle";
    tagsBtn.type = "button";
    tagsBtn.textContent = "tags";
    tagsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleTags();
    });
    root.appendChild(tagsBtn);

    const close = document.createElement("button");
    close.className = "e6g-close";
    close.type = "button";
    close.textContent = "×";
    close.addEventListener("click", (e) => {
      e.stopPropagation();
      closeGallery();
    });
    root.appendChild(close);

    root.addEventListener("wheel", onWheel, { passive: false });
    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("click", onOverlayClick);
    document.documentElement.appendChild(root);
  }

  function buildSlides() {
    track.textContent = "";
    slides = posts.map((p, i) => {
      const wrap = document.createElement("div");
      wrap.className = "e6g-wrap";
      const stage = document.createElement("div");
      stage.className = "e6g-stage";
      wrap.appendChild(stage);
      track.appendChild(wrap);

      const s = {
        wrap,
        stage,
        thumb: null,
        media: null,
        video: null,
        zoom: 1,
        panX: 0,
        panY: 0,
        natural: { w: p.w, h: p.h },
        trueSize: Boolean(p.w && p.h),
        fit: { w: 0, h: 0 },
        view: { w: 0, h: 0 },
        requested: false,
        played: false,
      };

      if (p.preview) {
        const t = document.createElement("img");
        t.className = "e6g-thumb";
        t.decoding = "async";
        t.addEventListener("load", () => {
          if (!s.trueSize && t.naturalWidth) {
            s.natural = { w: t.naturalWidth, h: t.naturalHeight };
            layout(s);
            center(true);
          }
        });
        t.src = p.preview;
        stage.appendChild(t);
        s.thumb = t;
      }

      stage.addEventListener("click", (e) => {
        if (i !== index) {
          e.stopPropagation();
          go(i);
        }
      });

      return s;
    });
  }

  // ---------------------------------------------------------------- input

  // Running off either end continues into the neighbouring page of results.
  function pageHref(dir) {
    const sels = dir > 0
      ? ["a#paginator-next", '.paginator a[rel~="next"]', 'a[rel~="next"]', ".paginator a.next"]
      : ["a#paginator-prev", '.paginator a[rel~="prev"]', 'a[rel~="prev"]', ".paginator a.prev"];
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (el && el.href && !el.classList.contains("disabled") && el.getAttribute("href") !== "#") return el.href;
    }
    const url = new URL(location.href);
    const raw = url.searchParams.get("page");
    // e621 also paginates by cursor (page=b1234567); guessing a number there would be wrong.
    if (raw !== null && !/^\d+$/.test(raw)) return null;
    const next = (Number(raw) || 1) + dir;
    if (next < 1) return null;
    if (next === 1) url.searchParams.delete("page");
    else url.searchParams.set("page", String(next));
    return url.href;
  }

  function gotoPage(dir) {
    const href = pageHref(dir);
    if (!href) return false;
    try {
      sessionStorage.setItem(RESUME_KEY, JSON.stringify({ at: dir > 0 ? "first" : "last", t: Date.now() }));
    } catch (_) {
      /* private mode: the next page just opens normally */
    }
    for (const s of slides) if (s.video) s.video.pause();
    hudPos.textContent = dir > 0 ? "next page…" : "previous page…";
    location.href = href;
    return true;
  }

  function go(i) {
    if (i > posts.length - 1 && gotoPage(1)) return;
    if (i < 0 && gotoPage(-1)) return;
    const next = clamp(i, 0, posts.length - 1);
    if (next === index && slides[next]) {
      center(true);
      return;
    }
    slides[index] && slides[index].wrap.classList.remove("e6g-active");
    index = next;
    slides[index] && slides[index].wrap.classList.add("e6g-active");
    pauseOthers(index);
    center(true);
    syncBackground();
    updateHud();
    renderTags();
    for (let d = 0; d <= PRELOAD; d++) {
      loadMedia(index + d);
      loadMedia(index - d);
    }
    startPlayback(index);
  }

  // Keep the page behind the overlay parked on the post being viewed.
  function syncBackground() {
    const p = posts[index];
    if (!p || !p.el || !p.el.isConnected) return;
    const r = p.el.getBoundingClientRect();
    const target = window.scrollY + r.top + r.height / 2 - window.innerHeight / 2;
    window.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }

  function toggleTags(force) {
    if (!panel) return;
    const open = force === undefined ? panel.hidden : force;
    panel.hidden = !open;
    tagsBtn.classList.toggle("e6g-on", open);
    try {
      localStorage.setItem(PANEL_KEY, open ? "1" : "0");
    } catch (_) {
      /* storage blocked; the toggle just does not persist */
    }
    if (open) renderTags();
  }

  async function renderTags() {
    if (!panel || panel.hidden) return;
    const p = posts[index];
    const token = ++tagToken;
    panelBody.textContent = "";
    if (!p) return;
    const loading = document.createElement("div");
    loading.className = "e6g-cat";
    loading.textContent = "loading…";
    panelBody.appendChild(loading);

    const tags = await ensureTags(p);
    if (token !== tagToken || panel.hidden) return;
    panelBody.textContent = "";

    let any = false;
    for (const cat of CATEGORIES) {
      const list = tags[cat];
      if (!Array.isArray(list) || !list.length) continue;
      any = true;
      const head = document.createElement("div");
      head.className = "e6g-cat";
      head.textContent = cat;
      panelBody.appendChild(head);
      for (const tag of list) {
        panelBody.appendChild(tagRow(tag, cat));
      }
    }
    if (!any) {
      const empty = document.createElement("div");
      empty.className = "e6g-cat";
      empty.textContent = "no tags";
      panelBody.appendChild(empty);
    }
  }

  function tagRow(tag, cat) {
    const state = tagState(tag);
    const row = document.createElement("div");
    row.className = `e6g-tag e6g-cat-${cat}`;

    const mk = (label, mode) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "e6g-pm" + (state === mode ? " e6g-on" : "");
      b.textContent = label;
      b.title = (state === mode ? "remove from" : mode === "+" ? "add to" : "exclude from") + " the search";
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        applyTag(tag, mode);
      });
      return b;
    };

    const name = document.createElement("a");
    name.className = "e6g-tag-name";
    name.textContent = tag.replace(/_/g, " ");
    name.href = `/posts?tags=${encodeURIComponent(tag)}`;
    name.addEventListener("click", (e) => e.stopPropagation());

    row.append(mk("+", "+"), mk("−", "-"), name);
    return row;
  }

  function updateHud() {
    const p = posts[index];
    const s = slides[index];
    hudPos.textContent = `${index + 1} / ${posts.length}`;
    if (p && p.id) {
      hudLink.textContent = `#${p.id}`;
      hudLink.href = `/posts/${p.id}`;
    } else {
      hudLink.textContent = "";
      hudLink.removeAttribute("href");
    }
    hudZoom.textContent = s && s.zoom > 1.005 ? `${s.zoom.toFixed(1)}×` : "";
  }

  function onWheel(e) {
    if (panel && !panel.hidden && panel.contains(e.target)) return;
    e.preventDefault();
    const s = slides[index];
    if (!s) return;
    const rect = s.stage.getBoundingClientRect();
    const cx = e.clientX - (rect.left + rect.width / 2);
    const cy = e.clientY - (rect.top + rect.height / 2);
    const z0 = s.zoom;
    const z1 = clamp(z0 * Math.exp(-e.deltaY * 0.0015), 1, MAX_ZOOM);
    if (Math.abs(z1 - z0) < 1e-4) return;
    if (z1 === 1) {
      s.panX = 0;
      s.panY = 0;
    } else {
      s.panX = cx - (cx - s.panX) * (z1 / z0);
      s.panY = cy - (cy - s.panY) * (z1 / z0);
    }
    s.zoom = z1;
    layout(s);
    center(false);
    updateHud();
  }

  let drag = null;

  function onPointerDown(e) {
    const s = slides[index];
    if (!s || e.button !== 0) return;
    if (panel && !panel.hidden && panel.contains(e.target)) return;
    if (!s.stage.contains(e.target)) return;
    if (e.target.tagName === "VIDEO") return; // leave the player controls alone
    const ox = Math.max(0, (s.fit.w * s.zoom - s.view.w) / 2);
    const oy = Math.max(0, (s.fit.h * s.zoom - s.view.h) / 2);
    if (ox < 0.5 && oy < 0.5) return;
    drag = { x: e.clientX, y: e.clientY, panX: s.panX, panY: s.panY, moved: false };
    s.stage.classList.add("e6g-panning");
    root.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!drag) return;
    const s = slides[index];
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    s.panX = drag.panX + dx;
    s.panY = drag.panY + dy;
    clampPan(s);
    paint(s);
  }

  function onPointerUp() {
    if (!drag) return;
    const s = slides[index];
    s && s.stage.classList.remove("e6g-panning");
    setTimeout(() => {
      drag = null;
    }, 0);
  }

  function onOverlayClick(e) {
    if (drag && drag.moved) return;
    if (e.target === root || e.target === track) closeGallery();
  }

  function onKey(e) {
    if (!isOpen) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.key) {
      case "ArrowRight":
        go(index + 1);
        break;
      case "ArrowLeft":
        go(index - 1);
        break;
      case "Home":
        go(0);
        break;
      case "End":
        go(posts.length - 1);
        break;
      case "Escape":
        closeGallery();
        break;
      case "0":
        resetZoom();
        break;
      case "t":
      case "T":
        toggleTags();
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  }

  function resetZoom() {
    const s = slides[index];
    if (!s) return;
    s.zoom = 1;
    s.panX = 0;
    s.panY = 0;
    layout(s);
    center(true);
    updateHud();
  }

  let resizeTimer = 0;
  function onResize() {
    if (!isOpen) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      layoutAll();
      center(false);
    }, 80);
  }

  // ---------------------------------------------------------------- open

  function collect() {
    return Array.from(document.querySelectorAll(POST_SEL)).filter((el) => el.querySelector("img") || el.dataset.id);
  }

  function openGallery(startEl) {
    const els = collect();
    if (!els.length) return false;
    const start = els.indexOf(startEl);
    if (start < 0) return false;

    posts = els.map(readPost);
    if (!root) buildChrome();
    buildSlides();

    isOpen = true;
    index = start;
    root.hidden = false;
    slides[index].wrap.classList.add("e6g-active");
    layoutAll();
    center(false);
    syncBackground();
    updateHud();
    let wantPanel = false;
    try {
      wantPanel = localStorage.getItem(PANEL_KEY) === "1";
    } catch (_) {
      /* storage blocked */
    }
    toggleTags(wantPanel);
    for (let d = 0; d <= PRELOAD; d++) {
      loadMedia(index + d);
      loadMedia(index - d);
    }
    return true;
  }

  function closeGallery() {
    if (!isOpen) return;
    isOpen = false;
    for (const s of slides) {
      if (s.video) {
        s.video.pause();
        s.video.removeAttribute("src");
        s.video.load();
      }
    }
    root.hidden = true;
    track.textContent = "";
    slides = [];
    posts = [];
  }

  // ---------------------------------------------------------------- wiring

  document.addEventListener(
    "click",
    (e) => {
      if (isOpen) return;
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const article = e.target.closest && e.target.closest(POST_SEL);
      if (!article) return;
      if (openGallery(article)) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true,
  );

  window.addEventListener("keydown", onKey, true);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("resize", onResize);

  // Arriving from a page turn: reopen at whichever end the reader was heading for.
  (function resume() {
    let raw = null;
    try {
      raw = sessionStorage.getItem(RESUME_KEY);
      sessionStorage.removeItem(RESUME_KEY);
    } catch (_) {
      return;
    }
    if (!raw) return;
    let req;
    try {
      req = JSON.parse(raw);
    } catch (_) {
      return;
    }
    if (!req || Date.now() - req.t > 20000) return;

    let tries = 0;
    const attempt = () => {
      if (isOpen) return;
      const els = collect();
      if (els.length) {
        openGallery(req.at === "last" ? els[els.length - 1] : els[0]);
        return;
      }
      if (++tries < 12) setTimeout(attempt, 250);
    };
    attempt();
  })();
})();
