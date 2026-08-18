/* TIẾN LÊN ROYALE — the homepage's cinematic scroll journey.
   Seven approved clips of the game's own palace (the arena dolly -> the room
   portals -> the K♠ landing -> the Royal Club lounge -> the skin gallery ->
   the teaching run -> the finale pull-back), scrubbed on a canvas frame
   sequence. Adapted from durbin-nail-spa/assets/js/home-cinema.js v9 with all
   of its post-launch fixes (Lenis css contract, manual scroll restoration +
   refresh guard, progress-gated body.is-in-film — NEVER isActive,
   "containers scrub / typography plays on time").
   Falls back to an elegant static hero for reduced-motion, save-data,
   slow networks, hash deep-links (#beta etc.), or missing assets. */
(() => {
  'use strict';

  const section = document.querySelector('section.atl');
  if (!section) return;

  const pinEl   = document.getElementById('atlPin');
  const canvas  = document.getElementById('atlCanvas');
  const rail    = document.getElementById('atlRail');
  const skipBtn = document.getElementById('atlSkip');
  const cue     = document.getElementById('atlCue');

  const FRAMES_DIR = 'assets/film/frames/';
  const END_SEL = '#beta';

  /* ── PACING DIALS ── the scroll runway per device class. Sized by
     px-per-scene against a ~1000px native flick (the Durbin rule; their
     9 scenes landed at 440% ≈ 400px/scene on the owner's iPhone).
     ⚠ Tune ONLY after a real device test — change these two strings, bump
     the ?v= on the script tag, nothing else. */
  const PIN_DESKTOP = '+=390%';
  /* 350% shipped first; the owner's iPhone verdict 2026-08-18: too fast, a
     flick rushed ~3 scenes. 560% ≈ 528px/scene ≈ 1.9 scenes per native flick. */
  const PIN_MOBILE  = '+=560%';

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const conn = navigator.connection || {};
  const slowNet = !!conn.saveData || /\b(slow-2g|2g|3g)\b/.test(conn.effectiveType || '');
  // hash arrivals (#beta, #game ... from other pages) came for a section,
  // not the film — static hero + native anchor jump
  const deepLinked = !!location.hash;
  const isMobile = matchMedia('(max-width: 767px)').matches;

  const ga = (name, params) => { try { if (typeof gtag === 'function') gtag('event', name, params || {}); } catch (e) {} };

  const SCROLL_KEY = 'tlrCinemaY';
  try { addEventListener('pagehide', () => { try { sessionStorage.setItem(SCROLL_KEY, window.scrollY); } catch (e) {} }); } catch (e) {}
  const navType = ((performance.getEntriesByType('navigation') || [])[0] || {}).type || '';
  let savedY = 0;
  try {
    savedY = (navType === 'reload' || navType === 'back_forward')
      ? parseFloat(sessionStorage.getItem(SCROLL_KEY)) || 0 : 0;
  } catch (e) {}

  const goStatic = (reason) => {
    section.classList.add('atl--static');
    ga('film_static', { reason });
    if (savedY > 0 && !location.hash) requestAnimationFrame(() => window.scrollTo(0, savedY));
  };

  let lenis = null;
  const smoothTo = (target, offset) => {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;
    if (lenis) lenis.scrollTo(el, { offset: offset || -8, duration: 1.35, easing: t => 1 - Math.pow(1 - t, 4) });
    else el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
  };
  section.addEventListener('click', (e) => {
    const skip = e.target.closest('[data-atl-skip]');
    if (skip) { e.preventDefault(); ga('film_skip', {}); smoothTo(END_SEL, -8); return; }
    const goto = e.target.closest('[data-film-goto]');
    if (goto) { e.preventDefault(); smoothTo(goto.dataset.filmGoto, -8); return; }
    // WATCH GAMEPLAY starts the journey (there is no capture trailer yet —
    // the film IS the gameplay showcase; becomes a lightbox when one exists)
    const watch = e.target.closest('[data-film-watch]');
    if (watch) { e.preventDefault(); ga('film_watch', {}); startJourney(); return; }
  });
  let startJourney = () => smoothTo(END_SEL, -8); // static fallback; rebound in boot()

  if (reduce || slowNet || deepLinked || !window.gsap || !window.ScrollTrigger) {
    goStatic(reduce ? 'reduced_motion' : slowNet ? 'slow_connection' : deepLinked ? 'deep_link' : 'no_libs');
    return;
  }

  gsap.registerPlugin(ScrollTrigger);
  if (ScrollTrigger.clearScrollMemory) ScrollTrigger.clearScrollMemory('manual');

  if (window.Lenis) {
    // the page css sets html{scroll-behavior:smooth}; Lenis scrolls the window
    // every rAF, so the browser must NOT re-smooth those writes
    document.documentElement.style.scrollBehavior = 'auto';
    lenis = new Lenis({ lerp: 0.095, wheelMultiplier: 1, touchMultiplier: 1 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  fetch(FRAMES_DIR + 'manifest.json')
    .then(r => (r.ok ? r.json() : Promise.reject(new Error('no manifest'))))
    .then(boot)
    .catch(() => goStatic('no_frames'));

  function boot(mf) {
    const stride = (isMobile || slowNet) ? 2 : 1;
    const used = Math.ceil(mf.total / stride);
    const frames = new Array(used).fill(null);
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1 : 1.5);

    let vw = 0, vh = 0, dx = 0, dy = 0, dw = 0, dh = 0;
    const sizeCanvas = () => {
      vw = pinEl.clientWidth; vh = pinEl.clientHeight;
      canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const s = Math.max(vw / mf.width, vh / mf.height);
      dw = mf.width * s; dh = mf.height * s;
      dx = (vw - dw) / 2; dy = (vh - dh) / 2;
      drawn = -1; render();
    };

    let target = 0, drawn = -1;
    const nearestLoaded = (i) => {
      if (frames[i]) return i;
      for (let d = 1; d < used; d++) {
        if (frames[i - d]) return i - d;
        if (frames[i + d]) return i + d;
      }
      return -1;
    };
    const render = () => {
      const i = nearestLoaded(Math.round(target));
      if (i < 0 || i === drawn) return;
      ctx.drawImage(frames[i], dx, dy, dw, dh);
      drawn = i;
    };

    let next = 0, alive = 0;
    const CONC = 7;
    const pump = () => {
      while (alive < CONC && next < used) {
        const idx = next++;
        const n = Math.min(idx * stride, mf.total - 1);
        const img = new Image();
        img.decoding = 'async';
        alive++;
        img.onload = () => { frames[idx] = img; alive--; render(); pump(); };
        img.onerror = () => { alive--; pump(); };
        img.src = FRAMES_DIR + 'f_' + String(n).padStart(4, '0') + '.webp';
      }
    };
    sizeCanvas();
    addEventListener('resize', sizeCanvas);
    pump();

    // ---- the scrubbed master timeline ----
    const proxy = { f: 0 };
    const reveals = [];
    const pinLen = isMobile ? PIN_MOBILE : PIN_DESKTOP;
    // the fixed site header leaves during the film and returns for the page —
    // but stays for the landing frame (progress 0) where it is transparent
    const setInFilm = (on) => document.body.classList.toggle('is-in-film', on);
    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: pinEl, pin: true, pinSpacing: true, anticipatePin: 1,
        start: 'top top', end: pinLen, scrub: 1,
        // chrome gates on PROGRESS, never isActive — scrolling back to the very
        // top fires "left backwards" and would flash the header mid-film
        onUpdate: (st) => {
          setInFilm(st.progress > 0.01 && st.progress < 0.999);
          markRail(st.progress);
          tickReveals(st.progress);
          if (st.progress > 0.995 && !completed) { completed = true; ga('film_complete', {}); }
        }
      }
    });
    let completed = false;

    startJourney = () => {
      const st = tl.scrollTrigger;
      if (!st) return smoothTo(END_SEL, -8);
      const pos = st.start + 0.17 * (st.end - st.start);
      if (lenis) lenis.scrollTo(pos, { duration: 1.8, easing: t => 1 - Math.pow(1 - t, 4) });
      else window.scrollTo({ top: pos, behavior: 'smooth' });
    };

    // refresh guard — see the Durbin engine for the full war story
    try {
      const saved = savedY;
      let userMoved = false;
      const jump = (y) => {
        if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
        else window.scrollTo(0, y);
        ScrollTrigger.update();
      };
      const guard = () => {
        const st = tl.scrollTrigger;
        if (!st || !st.end) return;
        if (userMoved || location.hash) return;
        const y = window.scrollY;
        const targetY = saved > st.end ? saved : 0;
        if (Math.abs(y - targetY) < 4) return;
        if (y <= st.start + 4 && !targetY) return;
        jump(targetY);
      };
      const stopGuard = () => removeEventListener('scroll', guard);
      const markUser = () => { userMoved = true; stopGuard(); };
      ['wheel', 'touchstart', 'keydown', 'pointerdown', 'click'].forEach(ev =>
        addEventListener(ev, markUser, { once: true, passive: true, capture: true }));
      addEventListener('scroll', guard, { passive: true });
      let tries = 0;
      const armGuard = () => {
        const st = tl.scrollTrigger;
        if (st && st.end) guard();
        else if (++tries < 600) requestAnimationFrame(armGuard);
      };
      armGuard();
      setTimeout(stopGuard, 8000);
    } catch (e) {}

    tl.to(proxy, { f: used - 1, duration: 1, onUpdate: () => { target = proxy.f; render(); } }, 0);

    // letterbox breathes in as the journey begins, releases for the finale
    const bars = section.querySelectorAll('.atl__bar');
    tl.fromTo(bars, { height: 0 }, { height: '4.5vh', duration: 0.05 }, 0.01)
      .to(bars, { height: 0, duration: 0.06 }, 0.90);

    // chrome
    tl.to(cue, { autoAlpha: 0, duration: 0.03 }, 0.005);
    tl.fromTo([rail, skipBtn], { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.04 }, 0.04)
      .to([rail, skipBtn], { autoAlpha: 0, duration: 0.04 }, 0.94);

    // ---- scenes ----
    const scenes = {};
    section.querySelectorAll('.atl__scene').forEach(el => { scenes[el.dataset.scene] = el; });
    const seen = {};
    const see = (name) => { if (!seen[name]) { seen[name] = 1; ga('film_scene', { scene: name }); } };

    // intro (the LCP) leaves as the dolly begins
    tl.to(scenes.intro, { autoAlpha: 0, y: -46, duration: 0.055 }, 0.015)
      .set(scenes.intro, { pointerEvents: 'none' }, 0.07);

    const split = (el) => {
      const h = el.querySelector('.atl__h');
      if (!h || !window.SplitType) return null;
      const s = new SplitType(h, { types: 'words,chars' });
      if (s.chars) s.chars.forEach(c => { c.style.display = 'inline-block'; c.style.willChange = 'transform'; });
      return s.chars && s.chars.length ? s.chars : null;
    };

    // one window per clip (each clip owns 1/7 ≈ .143 of progress); text enters
    // shortly after its cut, exits before the next cut. The first clip's
    // caption waits for the intro to leave.
    const windows = {
      game:      [0.078, 0.118, 0.122, 0.143],
      rooms:     [0.167, 0.218, 0.258, 0.284],
      table:     [0.310, 0.361, 0.401, 0.427],
      club:      [0.453, 0.504, 0.544, 0.570],
      customize: [0.595, 0.646, 0.686, 0.712],
      howto:     [0.738, 0.789, 0.829, 0.855],
      beta:      [0.881, 0.931, null, null]   // stays up through the landing
    };

    // containers scrub, typography plays on time
    Object.entries(windows).forEach(([name, [i0, i1, o0, o1]]) => {
      const el = scenes[name];
      if (!el) return;
      el.removeAttribute('aria-hidden');
      const inD = i1 - i0;
      tl.fromTo(el, { autoAlpha: 0, y: 56 }, { autoAlpha: 1, y: 0, duration: inD,
        onStart: () => see(name) }, i0);
      const chars = split(el);
      const rest = el.querySelectorAll('.atl__sub, .atl__ctarow');
      if (chars) gsap.set(chars, { yPercent: 115 });
      if (rest.length) gsap.set(rest, { autoAlpha: 0, y: 24 });
      const reveal = gsap.timeline({ paused: true });
      if (chars) reveal.to(chars, { yPercent: 0, duration: 0.65, ease: 'power3.out', stagger: 0.022 }, 0);
      if (rest.length) reveal.to(rest, { autoAlpha: 1, y: 0, duration: 0.55, ease: 'power2.out', stagger: 0.07 }, chars ? 0.18 : 0);
      reveals.push({ reveal, i0, played: false });
      if (o0 !== null) tl.to(el, { autoAlpha: 0, y: -46, duration: o1 - o0 }, o0);
    });
    function tickReveals(p) {
      for (const r of reveals) {
        if (!r.played && p >= r.i0 + 0.005) { r.played = true; r.reveal.play(0); }
        else if (r.played && p < r.i0 - 0.02) { r.played = false; r.reveal.pause(0); }
      }
    }

    // ---- progress rail ----
    const dots = rail ? [...rail.querySelectorAll('.atl__dot')] : [];
    const stops = dots.map(d => parseFloat(d.dataset.p));
    let activeDot = -1;
    function markRail(p) {
      let a = 0;
      for (let i = 0; i < stops.length; i++) if (p >= stops[i] - 0.05) a = i;
      if (a !== activeDot) { activeDot = a; dots.forEach((d, i) => d.classList.toggle('is-on', i === a)); }
    }
    dots.forEach(d => d.addEventListener('click', () => {
      const st = tl.scrollTrigger;
      const pos = st.start + parseFloat(d.dataset.p) * (st.end - st.start);
      if (lenis) lenis.scrollTo(pos, { duration: 1.6, easing: t => 1 - Math.pow(1 - t, 4) });
      else window.scrollTo({ top: pos, behavior: 'smooth' });
    }));

    see('intro');
  }
})();
