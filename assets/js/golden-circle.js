/* Golden Circle — hero + scroll animation.
 *
 * Ported verbatim from the original Claude "Design" export
 * ("Golden Circle Hero.dc.html", class Component extends DCLogic).
 *
 * The only changes vs. the original are the plumbing, NOT the visuals:
 *   - React refs  ->  a `{ current: element }` wrapper per [data-ref], so every
 *                     `this.xRef.current` access below is unchanged.
 *   - this.props  ->  the design's baked-in defaults (waveIntensity 0.7, autoPlay false).
 *   - componentDidMount -> init() run on DOMContentLoaded.
 *   - style-hover -> data-hover, applied by applyHover() (identical effect).
 *   - onClick={noop} -> a delegated preventDefault on [data-noop] links.
 * All animation math (buildRibbons, tick, buildWfLine, centerX, reveals, timings)
 * is copied unchanged.
 */
(function () {
  "use strict";

  // Arc data traced pixel-by-pixel from the uploaded logo (IMG_6412.PNG):
  // r = radius, w = stroke width (viewBox units, outer ring = 190), a0/a1 = angular span (SVG polar, y-down)
  const ARCS = [
    { r: 28.6, w: 3.56, a0: 0.82, a1: 2.011 }, { r: 32.4, w: 1.82, a0: 3.953, a1: 4.59 },
    { r: 35.6, w: 4.33, a0: 0.999, a1: 2.317 }, { r: 40.7, w: 3.05, a0: 3.752, a1: 4.765 },
    { r: 42, w: 4.4, a0: 1.44, a1: 2.505 }, { r: 46.1, w: 1.4, a0: 5.197, a1: 5.712 },
    { r: 47.3, w: 4.13, a0: 2.199, a1: 2.622 }, { r: 51.8, w: 3.69, a0: 3.63, a1: 5.869 },
    { r: 62.1, w: 4, a0: 3.539, a1: 5.93 }, { r: 72.2, w: 1.1, a0: 0.336, a1: 1.196 },
    { r: 75.7, w: 3.87, a0: 4.211, a1: 5.986 }, { r: 83.5, w: 1.24, a0: 0.288, a1: 2.007 },
    { r: 89, w: 3.81, a0: 4.9, a1: 6.026 }, { r: 93.2, w: 2.03, a0: 0.253, a1: 2.457 },
    { r: 103.3, w: 4.71, a0: 5.637, a1: 6.065 }, { r: 104.3, w: 2.73, a0: 0.227, a1: 2.889 },
    { r: 115.5, w: 3.45, a0: 0.205, a1: 2.919 }, { r: 116.1, w: 1.62, a0: 3.347, a1: 4.211 },
    { r: 128.9, w: 4.09, a0: 0.602, a1: 2.945 }, { r: 129.3, w: 2.55, a0: 3.325, a1: 4.241 },
    { r: 135.1, w: 1.1, a0: 4.302, a1: 5.061 }, { r: 139.9, w: 4.46, a0: 1.156, a1: 2.967 },
    { r: 143.6, w: 3.67, a0: 3.294, a1: 4.211 }, { r: 150.1, w: 1.71, a0: 4.32, a1: 5.118 },
    { r: 150.3, w: 4.78, a0: 1.994, a1: 2.993 }, { r: 159.3, w: 4.47, a0: 3.281, a1: 4.232 },
    { r: 162.6, w: 5.38, a0: 2.587, a1: 3.006 }, { r: 166.4, w: 2.28, a0: 4.324, a1: 5.175 },
    { r: 176.8, w: 4.93, a0: 3.268, a1: 4.232 }, { r: 184.5, w: 2.85, a0: 4.298, a1: 5.184 },
    { r: 188.5, w: 1.17, a0: 5.502, a1: 6.17 }, { r: 190, w: 1.1, a0: 0.118, a1: 1.527 }
  ];

  // Every ref name from the original component (a few have no element in this
  // template — they resolve to { current: null } and their tick() branch is skipped,
  // exactly as in the original preview).
  const REF_NAMES = [
    "wrapRef", "stageRef", "gradRef", "linesGlowRef", "linesCoreRef", "pulseGlowRef",
    "rippleRef", "logoTextRef", "heroRef", "heroTopRef", "navRef", "hintRef",
    "storyRef", "sLabelRef", "sHeadRef", "sParaRef", "colLeftRef", "colRightRef",
    "ribSvgRef", "ribGlowRef", "ribCoreRef", "ribEchoRef",
    "hiwRef", "hLabelRef", "hHeadRef", "journeyRef", "hPathRef", "hPathGlowRef",
    "hNodesRef", "hFieldRef", "hGradRef",
    "wfRef", "wfSvgRef", "wfLineRef", "wfLineGlowRef", "bnRef",
    "brandRef", "bLabelRef", "bHeadRef", "bwRef", "bwSvgRef", "bwLineRef",
    "bwLineGlowRef", "bbRef"
  ];

  class GoldenCircle {
    constructor() {
      // props baked from the design's data-props defaults
      this.props = { waveIntensity: 0.7, autoPlay: false };

      // state fields (verbatim from the original class body)
      this.ribLit = 0;
      this.ribLitTarget = 0;
      this.hiwDraw = 0;
      this.wfShown = false;
      this.bnShown = false;
      this.bwShown = false;
      this.bbShown = false;
      this.hiwMax = 0;
      this.waveTight = 0;
      this.lastSY = null;
      // adaptive quality (phones): flips true once the frame-time average says
      // the browser can't hold ~40fps (weak in-app WebViews); never flips back
      this.lite = false;
      this.frameAvg = 16.7;

      // React refs -> { current: element } wrappers (keeps all `.current` usage intact)
      for (const name of REF_NAMES) {
        this[name] = { current: document.querySelector('[data-ref="' + name + '"]') };
      }
    }

    // ==== lifecycle (was componentDidMount) ====================================
    init() {
      this.reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      // fewer ribbon samples on phones — the per-frame path rebuild is the main
      // cost of the hero animation, and the difference is imperceptible at small size
      this.isMobile = !!(window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
      // phones: watch the two per-frame-animated sections so tick() can pause
      // their SVG work once they are scrolled offscreen — otherwise that work
      // competes with touch scrolling for the main thread on the whole page
      this.stageVisible = true;
      this.storyVisible = true;
      if (this.isMobile && !this.reduced && 'IntersectionObserver' in window) {
        const watch = (el, key) => {
          if (!el) return null;
          const io = new IntersectionObserver((ents) => { ents.forEach((e) => { this[key] = e.isIntersecting; }); });
          io.observe(el);
          return io;
        };
        this.stageVisIO = watch(this.stageRef.current, 'stageVisible');
        this.storyVisIO = watch(this.storyRef.current, 'storyVisible');
      }
      this.p = this.reduced ? 1 : 0;
      this.pTarget = this.p;
      this.t0 = performance.now();
      this.lastT = this.t0;
      this.lastLabel = '';
      this.buildRibbons();
      this.setupScroll();
      this.setupStoryReveal();
      this.setupJourney();
      this.setupBrandJourney();
      if (this.reduced && this.stageRef.current) {
        const st = this.stageRef.current;
        st.style.opacity = '0';
        st.style.transition = 'opacity 1.4s ease';
        setTimeout(() => { st.style.opacity = '1'; }, 60);
      }
      this.raf = requestAnimationFrame(this.tick);
    }

    // hero geometry. Desktop: vh units (stable there). Phones: frozen PIXELS —
    // in-app browsers (Telegram/Instagram) collapse their toolbars while the
    // user scrolls, which re-resolves vh mid-scroll, changes the pin length
    // under the finger and jumps the page. Pixels can't be resized by the
    // browser chrome. 300vh desktop / 2.4x viewport on phones keeps the
    // pinned intro to ~1.5-2 flicks.
    sizeHero() {
      const wrap = this.wrapRef.current, stage = this.stageRef.current;
      if (!wrap) return;
      if (this.isMobile) {
        const h = window.innerHeight;
        this.heroBaseH = h;
        if (stage) stage.style.height = h + 'px';
        wrap.style.height = Math.round(h * 2.4) + 'px';
      } else {
        wrap.style.height = '300vh';
      }
    }

    setupScroll() {
      this.auto = !!(this.props.autoPlay ?? false);
      if (this.st) { this.st.kill(); this.st = null; }
      const wrap = this.wrapRef.current;
      if (!wrap) return;
      if (this.auto || this.reduced) { wrap.style.height = '100vh'; return; }
      this.sizeHero();
      // only a genuine orientation change (>150px height delta) re-derives the
      // frozen geometry — toolbar show/hide (~60-120px) must never do it
      this._heroResize = () => {
        if (!this.isMobile) return;
        if (Math.abs(window.innerHeight - (this.heroBaseH || 0)) > 150) {
          this.sizeHero();
          if (window.ScrollTrigger) window.ScrollTrigger.refresh();
        }
      };
      window.addEventListener('resize', this._heroResize);
      if (window.gsap && window.ScrollTrigger) {
        window.gsap.registerPlugin(window.ScrollTrigger);
        // mobile browsers fire a resize every time the URL bar shows/hides, which
        // would refresh ScrollTrigger mid-scroll and jump the hero — ignore it
        window.ScrollTrigger.config({ ignoreMobileResize: true });
        this.st = window.ScrollTrigger.create({
          trigger: wrap, start: 'top top', end: 'bottom bottom', scrub: true,
          onUpdate: (s) => { this.pTarget = s.progress; }
        });
      }
    }

    setupStoryReveal() {
      const reveal = (el, delay) => {
        if (!el) return;
        el.style.transition = 'opacity 1.5s cubic-bezier(0.22,1,0.36,1) ' + delay + 's, transform 1.6s cubic-bezier(0.22,1,0.36,1) ' + delay + 's';
        requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; });
      };
      const items = [
        [this.sLabelRef.current, 0],
        [this.sHeadRef.current, 0.12],
        [this.sParaRef.current, 0.34],
        [this.colLeftRef.current, 0.5],
        [this.colRightRef.current, 0.68]
      ];
      if (this.reduced) {
        items.forEach(([el]) => { if (el) { el.style.opacity = '1'; el.style.transform = 'none'; } });
        this.ribLitTarget = 1;
        return;
      }
      const target = this.storyRef.current;
      if (!target || !('IntersectionObserver' in window)) {
        items.forEach(([el, d]) => reveal(el, d));
        this.ribLitTarget = 1;
        return;
      }
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            items.forEach(([el, d]) => reveal(el, d));
            this.ribLitTarget = 1;
            io.disconnect();
          }
        });
      }, { threshold: 0.28 });
      io.observe(target);
      this.storyIO = io;
    }

    setupJourney() {
      const reveal = (el, delay) => {
        if (!el) return;
        el.style.transition = 'opacity 1.5s cubic-bezier(0.22,1,0.36,1) ' + delay + 's, transform 1.6s cubic-bezier(0.22,1,0.36,1) ' + delay + 's';
        requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; });
      };
      const hdr = [this.hLabelRef.current, this.hHeadRef.current];
      const showHdr = () => { reveal(hdr[0], 0); reveal(hdr[1], 0.12); };

      this.buildWfLine();
      requestAnimationFrame(() => this.buildWfLine());
      setTimeout(() => this.buildWfLine(), 450);
      // debounced: mobile URL-bar show/hide fires resize mid-scroll, and the
      // rebuild forces layout reads — batching it avoids scroll hitches
      this._wfResize = () => { clearTimeout(this._wfRT); this._wfRT = setTimeout(() => this.buildWfLine(), 150); };
      window.addEventListener('resize', this._wfResize);

      const revealWf = () => {
        if (this.wfShown) return;
        this.wfShown = true;
        for (const p of [this.wfLineRef.current, this.wfLineGlowRef.current]) {
          if (!p) continue;
          p.style.transition = 'stroke-dashoffset 1.9s cubic-bezier(.4,0,.2,1)';
          p.style.strokeDashoffset = '0';
        }
        const cont = this.wfRef.current;
        if (!cont) return;
        Array.from(cont.querySelectorAll('[data-wf-card]')).forEach((col, i) => {
          const base = 0.55 + i * 0.16;
          const set = (el, d) => { if (!el) return; el.style.transitionDelay = d + 's'; el.style.opacity = '1'; el.style.transform = 'none'; };
          set(col.querySelector('[data-wf-vis]'), base);
          set(col.querySelector('[data-wf-num]'), base + 0.12);
          set(col.querySelector('[data-wf-title]'), base + 0.2);
        });
      };

      if (this.reduced) {
        hdr.forEach((el) => { if (el) { el.style.opacity = '1'; el.style.transform = 'none'; } });
        this.wfShown = true;
        for (const p of [this.wfLineRef.current, this.wfLineGlowRef.current]) { if (p) p.style.strokeDashoffset = '0'; }
        const cont = this.wfRef.current;
        if (cont) cont.querySelectorAll('[data-wf-vis],[data-wf-num],[data-wf-title]').forEach((el) => { el.style.opacity = '1'; el.style.transform = 'none'; });
        const bn = this.bnRef.current;
        if (bn) bn.querySelectorAll('[data-bn-item]').forEach((el) => { el.style.transition = 'none'; el.style.opacity = '1'; el.style.transform = 'none'; });
        this.bnShown = true;
        return;
      }

      if (this.hiwRef.current && 'IntersectionObserver' in window) {
        const io = new IntersectionObserver((ents) => {
          ents.forEach((e) => { if (e.isIntersecting) { showHdr(); revealWf(); io.disconnect(); } });
        }, { threshold: 0.18 });
        io.observe(this.hiwRef.current);
        this.hiwHdrIO = io;
      } else { showHdr(); revealWf(); }

      // benefits reveal — staggered fade-up when the lower half enters view
      const revealBn = () => {
        if (this.bnShown) return;
        this.bnShown = true;
        const bn = this.bnRef.current;
        if (!bn) return;
        Array.from(bn.querySelectorAll('[data-bn-item]')).forEach((el, i) => {
          el.style.transitionDelay = (i * 0.14) + 's';
          el.style.opacity = '1';
          el.style.transform = 'none';
        });
      };
      if (this.bnRef.current && 'IntersectionObserver' in window) {
        const io2 = new IntersectionObserver((ents) => {
          ents.forEach((e) => { if (e.isIntersecting) { revealBn(); io2.disconnect(); } });
        }, { threshold: 0.2 });
        io2.observe(this.bnRef.current);
        this.bnIO = io2;
      } else { revealBn(); }
    }

    // trace the connecting curve through the five numbered nodes (measured from the DOM)
    buildWfLine() {
      const cont = this.wfRef.current, svg = this.wfSvgRef.current;
      if (!cont || !svg) return;
      const nums = Array.from(cont.querySelectorAll('[data-wf-num]'));
      if (nums.length < 2) return;
      const cb = cont.getBoundingClientRect();
      if (cb.width < 2) return;
      svg.setAttribute('viewBox', '0 0 ' + cb.width.toFixed(1) + ' ' + cb.height.toFixed(1));
      const pts = nums.map((n) => { const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2 - cb.left, y: r.top + r.height / 2 - cb.top }; });
      let d = 'M' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || pts[i + 1];
        const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
        const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
        d += ' C' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ' ' + c2y.toFixed(1) + ' ' + p2.x.toFixed(1) + ' ' + p2.y.toFixed(1);
      }
      for (const p of [this.wfLineRef.current, this.wfLineGlowRef.current]) {
        if (!p) continue;
        p.setAttribute('d', d);
        const len = p.getTotalLength();
        p.style.strokeDasharray = len;
        if (!this.wfShown) p.style.strokeDashoffset = len;
      }
    }

    setupBrandJourney() {
      const reveal = (el, delay) => {
        if (!el) return;
        el.style.transition = 'opacity 1.5s cubic-bezier(0.22,1,0.36,1) ' + delay + 's, transform 1.6s cubic-bezier(0.22,1,0.36,1) ' + delay + 's';
        requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; });
      };
      const hdr = [this.bLabelRef.current, this.bHeadRef.current];
      const showHdr = () => { reveal(hdr[0], 0); reveal(hdr[1], 0.12); };

      this.buildBwLine();
      requestAnimationFrame(() => this.buildBwLine());
      setTimeout(() => this.buildBwLine(), 450);
      // debounced for the same reason as _wfResize
      this._bwResize = () => { clearTimeout(this._bwRT); this._bwRT = setTimeout(() => this.buildBwLine(), 150); };
      window.addEventListener('resize', this._bwResize);

      const revealBw = () => {
        if (this.bwShown) return;
        this.bwShown = true;
        for (const p of [this.bwLineRef.current, this.bwLineGlowRef.current]) {
          if (!p) continue;
          p.style.transition = 'stroke-dashoffset 1.9s cubic-bezier(.4,0,.2,1)';
          p.style.strokeDashoffset = '0';
        }
        const cont = this.bwRef.current;
        if (!cont) return;
        Array.from(cont.querySelectorAll('[data-bw-card]')).forEach((col, i) => {
          const base = 0.55 + i * 0.16;
          const set = (el, d) => { if (!el) return; el.style.transitionDelay = d + 's'; el.style.opacity = '1'; el.style.transform = 'none'; };
          set(col.querySelector('[data-bw-vis]'), base);
          set(col.querySelector('[data-bw-num]'), base + 0.12);
        });
      };

      const revealBb = () => {
        if (this.bbShown) return;
        this.bbShown = true;
        const bb = this.bbRef.current;
        if (!bb) return;
        Array.from(bb.querySelectorAll('[data-bb-item]')).forEach((el, i) => {
          el.style.transitionDelay = (i * 0.14) + 's';
          el.style.opacity = '1';
          el.style.transform = 'none';
        });
      };

      if (this.reduced) {
        hdr.forEach((el) => { if (el) { el.style.opacity = '1'; el.style.transform = 'none'; } });
        this.bwShown = true;
        for (const p of [this.bwLineRef.current, this.bwLineGlowRef.current]) { if (p) p.style.strokeDashoffset = '0'; }
        const cont = this.bwRef.current;
        if (cont) cont.querySelectorAll('[data-bw-vis],[data-bw-num]').forEach((el) => { el.style.opacity = '1'; el.style.transform = 'none'; });
        const bb = this.bbRef.current;
        if (bb) bb.querySelectorAll('[data-bb-item]').forEach((el) => { el.style.transition = 'none'; el.style.opacity = '1'; el.style.transform = 'none'; });
        this.bbShown = true;
        return;
      }

      if (this.brandRef.current && 'IntersectionObserver' in window) {
        const io = new IntersectionObserver((ents) => {
          ents.forEach((e) => { if (e.isIntersecting) { showHdr(); revealBw(); io.disconnect(); } });
        }, { threshold: 0.12 });
        io.observe(this.brandRef.current);
        this.brandIO = io;
      } else { showHdr(); revealBw(); }

      if (this.bbRef.current && 'IntersectionObserver' in window) {
        const io2 = new IntersectionObserver((ents) => {
          ents.forEach((e) => { if (e.isIntersecting) { revealBb(); io2.disconnect(); } });
        }, { threshold: 0.2 });
        io2.observe(this.bbRef.current);
        this.bbIO = io2;
      } else { revealBb(); }
    }

    // trace the brand workflow curve through the five numbered nodes
    buildBwLine() {
      const cont = this.bwRef.current, svg = this.bwSvgRef.current;
      if (!cont || !svg) return;
      const nums = Array.from(cont.querySelectorAll('[data-bw-num]'));
      if (nums.length < 2) return;
      const cb = cont.getBoundingClientRect();
      if (cb.width < 2) return;
      svg.setAttribute('viewBox', '0 0 ' + cb.width.toFixed(1) + ' ' + cb.height.toFixed(1));
      const pts = nums.map((n) => { const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2 - cb.left, y: r.top + r.height / 2 - cb.top }; });
      let d = 'M' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || pts[i + 1];
        const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
        const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
        d += ' C' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ' ' + c2y.toFixed(1) + ' ' + p2.x.toFixed(1) + ' ' + p2.y.toFixed(1);
      }
      for (const p of [this.bwLineRef.current, this.bwLineGlowRef.current]) {
        if (!p) continue;
        p.setAttribute('d', d);
        const len = p.getTotalLength();
        p.style.strokeDasharray = len;
        if (!this.bwShown) p.style.strokeDashoffset = len;
      }
    }

    // horizontal position of the living thread at parametric height v (0..1)
    centerX(v, t, tight) {
      const base = 120 + 52 * Math.sin(v * Math.PI * 3.1);
      const breath = (this.reduced ? 0 : 10) * Math.sin(t * 0.32 + v * 5.2) * (0.6 + 0.4 * (tight || 0));
      return base + breath;
    }

    buildRibbons() {
      const glowG = this.linesGlowRef.current, coreG = this.linesCoreRef.current;
      if (!glowG || !coreG) return;
      glowG.innerHTML = ''; coreG.innerHTML = '';
      const rnd = (s) => { const x = Math.sin(s * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
      const NS = 'http://www.w3.org/2000/svg';
      // assign each arc to top (-1) or bottom (+1) by its angular midpoint
      const items = ARCS.map((a, idx) => {
        const m = ((a.a0 + a.a1) / 2) % (Math.PI * 2);
        return Object.assign({ idx, side: Math.sin(m) < 0 ? -1 : 1 }, a);
      });
      for (const side of [-1, 1]) {
        const group = items.filter(it => it.side === side).sort((x, y) => y.r - x.r);
        const n = group.length;
        const spacing = Math.min(30, 148 / Math.max(1, n - 1));
        group.forEach((it, j) => {
          it.j = j;
          it.baseY = side < 0 ? 50 + j * spacing : 850 - j * spacing;
          it.widthFinal = Math.max(1.0, 3.8 - j * (2.7 / Math.max(1, n - 1)));
        });
      }
      this.ribbons = items.map((it) => {
        const sd = it.idx * 3.7 + (it.side < 0 ? 11.3 : 47.9);
        const rib = {
          r0: it.r, w0: it.w, a0: it.a0, a1: it.a1,
          rev: Math.cos(it.a0) > Math.cos(it.a1),
          side: it.side, baseY: it.baseY, widthFinal: it.widthFinal,
          trend: (rnd(sd + 1) - 0.5) * 32,
          cA: 9 + rnd(sd + 2) * 13,
          cK: Math.PI * 2 * (0.85 + rnd(sd + 3) * 0.8) / 1720,
          cP: (rnd(sd + 4) - 0.5) * 0.9,
          sA: 3.5 + rnd(sd + 5) * 5,
          sK: Math.PI * 2 * (1.7 + rnd(sd + 6) * 1.1) / 1720,
          sP: rnd(sd + 7) * 6.283,
          bSeed: rnd(sd + 8) * 6.283,
          bSpd: 0.25 + rnd(sd + 9) * 0.2,
          cStag: rnd(sd + 13) * 0.14,
          mStag: 0.45 * (it.r / 190)
        };
        const mk = () => {
          const p = document.createElementNS(NS, 'path');
          p.setAttribute('fill', 'none');
          p.setAttribute('stroke', 'url(#gcGold)');
          p.setAttribute('stroke-linecap', 'round');
          return p;
        };
        rib.glowEl = mk(); rib.glowEl.setAttribute('opacity', '0.14');
        rib.coreEl = mk();
        glowG.appendChild(rib.glowEl);
        coreG.appendChild(rib.coreEl);
        return rib;
      });
    }

    tick = (now) => {
      this.raf = requestAnimationFrame(this.tick);
      const t = (now - this.t0) / 1000;
      const frameMs = now - this.lastT;
      const dt = Math.min(0.05, frameMs / 1000);
      this.lastT = now;

      // adaptive quality governor: Telegram/Instagram WebViews run pages with
      // less GPU/CPU priority (plus injected scripts) — if the rolling frame
      // average stays above 25ms (<40fps) after warm-up, permanently ease the
      // hero's SVG load (fewer samples, no glow layer). One-way: no oscillation.
      if (this.isMobile && !this.lite && !this.reduced) {
        this.frameAvg += (Math.min(frameMs, 100) - this.frameAvg) * 0.05;
        if (t > 3 && this.frameAvg > 25) {
          this.lite = true;
          if (this.linesGlowRef.current) this.linesGlowRef.current.setAttribute('opacity', '0');
        }
      }
      const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
      const smooth = (u) => u * u * (3 - 2 * u);

      // --- progress target ---
      if (this.reduced) {
        this.pTarget = 1;
      } else if (this.auto) {
        this.pTarget = clamp((t - 1.8) / 12, 0, 1);
      } else if (!this.st) {
        const wrap = this.wrapRef.current;
        if (wrap) {
          const r = wrap.getBoundingClientRect();
          const range = r.height - window.innerHeight;
          this.pTarget = range > 0 ? clamp(-r.top / range, 0, 1) : 0;
        }
      }
      this.p += (this.pTarget - this.p) * Math.min(1, dt * 6);
      if (this.reduced) this.p = 1;
      const p = this.p;

      // --- intro fades (scene 1, time based) ---
      const introLogo = this.reduced ? 1 : smooth(clamp((t - 0.5) / 1.2, 0, 1));
      const introHint = this.reduced ? 0 : clamp((t - 2.2) / 0.8, 0, 1);

      // on phones, per-frame SVG work only runs while its section is on screen
      // (both flags are permanently true on desktop — behaviour unchanged there)
      const heroActive = !this.isMobile || this.reduced || this.stageVisible;
      const storyActive = !this.isMobile || this.reduced || this.storyVisible;

      // --- metallic shimmer: gradient slowly travels ---
      if (heroActive && this.gradRef.current) {
        const shift = Math.sin(t * 0.45) * 300;
        this.gradRef.current.setAttribute('gradientTransform', 'translate(' + shift.toFixed(1) + ' 0)');
      }

      // --- ribbons / arcs ---
      const inten = this.props.waveIntensity ?? 1;
      const pc = clamp(p / 0.30, 0, 1);
      const pm = clamp((p - 0.38) / 0.46, 0, 1);
      const M = this.lite ? 22 : (this.isMobile ? 36 : 56);
      if (heroActive) for (const rb of (this.ribbons || [])) {
        let r, w;
        if (pm <= 0) {
          const cu = clamp((pc - rb.cStag) / 0.86, 0, 1);
          r = rb.r0 * (1 - cu * cu * cu);
          w = 0;
        } else {
          const u = clamp((pm - rb.mStag) / 0.55, 0, 1);
          w = smooth(u);
          const g = clamp(u * 2.0, 0, 1);
          r = rb.r0 * (1 - Math.pow(1 - g, 3));
        }
        const s0 = rb.rev ? rb.a1 : rb.a0;
        const s1 = rb.rev ? rb.a0 : rb.a1;
        const breath = (this.reduced ? 0 : 5) * w * inten;
        let d = '';
        for (let k = 0; k < M; k++) {
          const tt = k / (M - 1);
          const th = s0 + (s1 - s0) * tt;
          const ax = 800 + r * Math.cos(th);
          const ay = 450 + r * Math.sin(th);
          let x = ax, y = ay;
          if (w > 0) {
            const wx = -70 + tt * 1740;
            const dx = (wx - 800) / 850;
            const wy = rb.baseY
              + rb.trend * (dx * dx * 1.5 - 0.45)
              + rb.cA * inten * Math.cos((wx - 800) * rb.cK + rb.cP)
              + rb.sA * inten * Math.sin(wx * rb.sK + rb.sP)
              + breath * Math.sin(t * rb.bSpd * 2 + rb.bSeed + wx * 0.0024);
            x = ax + (wx - ax) * w;
            y = ay + (wy - ay) * w;
          }
          d += (k ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
        }
        const sw = rb.w0 + (rb.widthFinal - rb.w0) * w;
        rb.coreEl.setAttribute('d', d);
        rb.coreEl.setAttribute('stroke-width', sw.toFixed(2));
        if (!this.lite) {
          rb.glowEl.setAttribute('d', d);
          rb.glowEl.setAttribute('stroke-width', (sw * 3.0).toFixed(2));
        }
      }
      if (heroActive && this.linesCoreRef.current) this.linesCoreRef.current.setAttribute('opacity', introLogo.toFixed(3));
      if (heroActive && !this.lite && this.linesGlowRef.current) this.linesGlowRef.current.setAttribute('opacity', introLogo.toFixed(3));

      // --- scene 3: pulse (quiet energy release) ---
      const tri = (v, a, b, c) => v <= a || v >= c ? 0 : (v < b ? (v - a) / (b - a) : 1 - (v - b) / (c - b));
      if (heroActive && this.pulseGlowRef.current) {
        this.pulseGlowRef.current.setAttribute('opacity', (tri(p, 0.29, 0.35, 0.48) * 0.85).toFixed(3));
      }
      if (heroActive && this.rippleRef.current) {
        const q = clamp((p - 0.34) / 0.11, 0, 1);
        const rr = 26 + (1 - Math.pow(1 - q, 3)) * 430;
        this.rippleRef.current.setAttribute('r', rr.toFixed(1));
        this.rippleRef.current.setAttribute('stroke-width', (1.6 * (1 - q) + 0.3).toFixed(2));
        this.rippleRef.current.setAttribute('opacity', (q > 0 && q < 1 ? (1 - q) * 0.55 : 0).toFixed(3));
      }

      // --- overlays ---
      if (heroActive && this.logoTextRef.current) {
        this.logoTextRef.current.setAttribute('opacity', (introLogo * (1 - clamp(p / 0.07, 0, 1))).toFixed(3));
      }
      if (heroActive && this.hintRef.current) {
        this.hintRef.current.style.opacity = (introHint * (1 - clamp(p / 0.04, 0, 1))).toFixed(3);
      }
      if (this.navRef.current) {
        // the nav must never be left at opacity 0 when hero work is paused
        // (e.g. a mid-page reload with scroll restoration)
        const nav = this.navRef.current;
        if (heroActive) nav.style.opacity = introLogo.toFixed(3);
        else if (nav.style.opacity !== '1') nav.style.opacity = '1';
      }
      if (heroActive && this.heroTopRef.current) {
        const ho = introLogo * (1 - clamp(p / 0.06, 0, 1));
        const ht = this.heroTopRef.current;
        ht.style.opacity = ho.toFixed(3);
        ht.style.pointerEvents = ho > 0.5 ? 'auto' : 'none';
      }
      if (heroActive && this.heroRef.current) {
        const hp = smooth(clamp((p - 0.84) / 0.13, 0, 1));
        const h = this.heroRef.current;
        h.style.opacity = hp.toFixed(3);
        h.style.transform = 'translateY(' + ((1 - hp) * 30).toFixed(1) + 'px)';
        h.style.pointerEvents = hp > 0.5 ? 'auto' : 'none';
      }

      // --- section: connecting ribbon (breathing + illuminating) ---
      this.ribLit += (this.ribLitTarget - this.ribLit) * Math.min(1, dt * 1.3);
      const lit = this.ribLit;
      if (storyActive && this.ribCoreRef.current && lit > 0.001) {
        const W = 1600, MY = 120, N = 64;
        const draw = (amp, dip, phase, spd) => {
          let d = '';
          for (let k = 0; k < N; k++) {
            const u = k / (N - 1);
            const x = u * W;
            const env = Math.sin(u * Math.PI);
            const y = MY
              + dip * env
              + amp * env * Math.sin(u * Math.PI * 2.1 + phase + t * spd)
              + (this.reduced ? 0 : 5 * env * Math.sin(t * 0.22 + phase));
            d += (k ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
          }
          return d;
        };
        const core = draw(20, -34, 0, 0.16);
        const echo = draw(26, -18, 1.7, 0.11);
        this.ribCoreRef.current.setAttribute('d', core);
        this.ribGlowRef.current.setAttribute('d', core);
        this.ribEchoRef.current.setAttribute('d', echo);
        // slow "catching light" shimmer travelling along the strand
        const shine = 0.5 + 0.5 * Math.sin(t * 0.5);
        this.ribCoreRef.current.setAttribute('opacity', (lit * (0.62 + 0.26 * shine)).toFixed(3));
        this.ribGlowRef.current.setAttribute('opacity', (lit * (0.05 + 0.09 * shine)).toFixed(3));
        this.ribEchoRef.current.setAttribute('opacity', (lit * 0.3).toFixed(3));
      }

      // --- section: How It Works — the living golden thread ---
      if (this.journeyRef.current) {
        // wave intelligence: waves tighten on fast scroll, relax when slow
        const sy = window.scrollY || window.pageYOffset || 0;
        const vel = Math.abs(sy - (this.lastSY == null ? sy : this.lastSY));
        this.lastSY = sy;
        this.waveTight += (clamp(vel / 70, 0, 1) - this.waveTight) * Math.min(1, dt * 3);
        const tight = this.reduced ? 0 : this.waveTight;

        let sp;
        if (this.reduced) sp = 1;
        else {
          const jr = this.journeyRef.current.getBoundingClientRect();
          sp = clamp((window.innerHeight * 0.82 - jr.top) / (jr.height * 0.62), 0, 1);
        }
        this.hiwMax = Math.max(this.hiwMax, sp);                 // scroll memory — never resets
        this.hiwDraw += ((this.reduced ? 1 : this.hiwMax) - this.hiwDraw) * Math.min(1, dt * 3.5);
        const drawn = this.reduced ? 1 : this.hiwDraw;
        const present = clamp(this.hiwMax * 4, 0, 1);
        const hShine = 0.5 + 0.5 * Math.sin(t * 0.5);

        if (this.hGradRef.current) {
          this.hGradRef.current.setAttribute('gradientTransform', 'translate(0 ' + (Math.sin(t * 0.3) * 260).toFixed(1) + ')');
        }

        // the thread, regenerated each frame — silk suspended underwater
        let d = '';
        const NSAMP = 96;
        for (let k = 0; k < NSAMP; k++) {
          const v = k / (NSAMP - 1);
          if (v > drawn) break;
          d += (k ? 'L' : 'M') + this.centerX(v, t, tight).toFixed(1) + ' ' + (v * 1600).toFixed(1);
        }
        if (drawn > 0 && drawn < 1) d += 'L' + this.centerX(drawn, t, tight).toFixed(1) + ' ' + (drawn * 1600).toFixed(1);
        if (!d) d = 'M' + this.centerX(0, t, tight).toFixed(1) + ' 0';
        if (this.hPathRef.current) this.hPathRef.current.setAttribute('d', d);
        if (this.hPathGlowRef.current) this.hPathGlowRef.current.setAttribute('d', d);

        // organic energy field flanking the thread
        for (const f of (this.hiwField || [])) {
          let fd = '';
          const freq = f.freq + tight * 1.4;
          const amp = f.amp * (1 - 0.28 * tight);
          for (let k = 0; k < 64; k++) {
            const v = k / 63;
            const env = Math.sin(v * Math.PI);
            const x = this.centerX(v, t, tight) + f.side * (f.off * env + amp * env * Math.sin(v * Math.PI * freq + t * f.spd * 2 + f.ph));
            fd += (k ? 'L' : 'M') + x.toFixed(1) + ' ' + (v * 1600).toFixed(1);
          }
          f.el.setAttribute('d', fd);
          f.el.setAttribute('opacity', (f.op * present * (0.7 + 0.3 * hShine)).toFixed(3));
        }

        // waypoints + steps — illumination is monotonic (scroll memory)
        for (let i = 0; i < (this.hiwNodes || []).length; i++) {
          const nd = this.hiwNodes[i];
          const nx = this.centerX(nd.f, t, tight), ny = nd.f * 1600;
          nd.dot.setAttribute('cx', nx.toFixed(1)); nd.dot.setAttribute('cy', ny.toFixed(1));
          nd.ring.setAttribute('cx', nx.toFixed(1)); nd.ring.setAttribute('cy', ny.toFixed(1));
          const e = smooth(clamp((drawn - nd.f + 0.03) / 0.05, 0, 1));
          const bre = 1 + 0.1 * Math.sin(t * 0.8 + i);         // breathing below perception
          nd.dot.setAttribute('opacity', (e * (0.72 + 0.28 * hShine)).toFixed(3));
          nd.dot.setAttribute('r', ((2 + e * 2.4) * bre).toFixed(2));
          nd.ring.setAttribute('opacity', (e * 0.42).toFixed(3));
          nd.ring.setAttribute('r', ((13 - e * 2) * bre).toFixed(2));
          const st = this.hiwSteps[i];
          if (st) {
            const se = smooth(clamp((drawn - nd.f + 0.06) / 0.09, 0, 1));
            st.style.opacity = se.toFixed(3);
            st.style.transform = 'translateY(' + ((1 - se) * 24).toFixed(1) + 'px)';
          }
        }
      }

      // --- screen label for comments ---
      const label = p < 0.02 ? 'Scene 1 — Logo' : p < 0.30 ? 'Scene 2 — Compression' : p < 0.38 ? 'Scene 3 — Golden pulse' : p < 0.84 ? 'Scene 4 — Morph to ribbons' : 'Scene 5 — Final layout';
      if (label !== this.lastLabel && this.stageRef.current) {
        this.stageRef.current.setAttribute('data-screen-label', label);
        this.lastLabel = label;
      }
    };
  }

  // ==== style-hover -> data-hover (identical visual effect) ====================
  function parseStyleDecls(str) {
    const out = [];
    for (const part of String(str).split(';')) {
      const i = part.indexOf(':');
      if (i === -1) continue;
      const prop = part.slice(0, i).trim();
      const val = part.slice(i + 1).trim();
      if (prop) out.push([prop, val]);
    }
    return out;
  }

  function wireHovers(root) {
    root.querySelectorAll('[data-hover]').forEach((el) => {
      const decls = parseStyleDecls(el.getAttribute('data-hover'));
      if (!decls.length) return;
      let saved = null;
      const enter = () => {
        saved = decls.map(([prop]) => [prop, el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)]);
        decls.forEach(([prop, val]) => el.style.setProperty(prop, val));
      };
      const leave = () => {
        if (!saved) return;
        saved.forEach(([prop, val, prio]) => {
          if (val) el.style.setProperty(prop, val, prio); else el.style.removeProperty(prop);
        });
        saved = null;
      };
      el.addEventListener('mouseenter', enter);
      el.addEventListener('mouseleave', leave);
      // keyboard focus parity for accessibility (links/buttons)
      el.addEventListener('focus', enter);
      el.addEventListener('blur', leave);
    });
  }

  // ==== onClick={noop} -> preventDefault on placeholder links ==================
  function wireNoop(root) {
    root.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[data-noop]');
      if (a) e.preventDefault();
    });
  }

  // ==== in-page nav: smooth-scroll to a section (About us -> Our Story, etc.) ===
  function smoothScrollTo(target) {
    const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const startY = window.scrollY || window.pageYOffset || 0;
    const endY = Math.max(0, startY + target.getBoundingClientRect().top);
    if (reduced) { window.scrollTo(0, endY); return; }
    const dist = Math.abs(endY - startY);
    const dur = Math.min(1100, Math.max(500, dist * 0.35)); // distance-aware, capped
    const t0 = performance.now();
    const ease = (u) => 1 - Math.pow(1 - u, 3); // easeOutCubic
    // the user can take over at any moment — a wheel tick, a touch or a key
    // cancels the animation instead of fighting them for the scrollbar
    let cancelled = false;
    const cancel = () => {
      cancelled = true;
      window.removeEventListener('wheel', cancel);
      window.removeEventListener('touchstart', cancel);
      window.removeEventListener('keydown', cancel);
    };
    window.addEventListener('wheel', cancel, { passive: true });
    window.addEventListener('touchstart', cancel, { passive: true });
    window.addEventListener('keydown', cancel);
    const step = (now) => {
      if (cancelled) return;
      const u = Math.min(1, (now - t0) / dur);
      window.scrollTo(0, startY + (endY - startY) * ease(u));
      if (u < 1) requestAnimationFrame(step); else cancel();
    };
    requestAnimationFrame(step);
  }

  function wireNavScroll(root) {
    root.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[data-scroll]');
      if (!a) return;
      const hash = a.getAttribute('href') || '';
      if (hash.charAt(0) !== '#' || hash.length < 2) return;
      const target = document.getElementById(hash.slice(1));
      if (!target) return;
      e.preventDefault();
      smoothScrollTo(target);
    });
  }

  // ==== fixed nav: show while scrolling DOWN, hide while scrolling UP ==========
  // (and always show at the very top, where the hero lives). Opacity is still
  // driven by the intro fade in tick(); here we only toggle the slide transform.
  function setupNavScrollReveal(nav) {
    if (!nav) return;
    const HIDDEN = 'translateY(-115%)';
    const SHOWN = 'translateY(0)';
    let lastY = window.scrollY || window.pageYOffset || 0;
    let hidden = false;
    let scrimmed = false;
    let ticking = false;
    const show = () => { if (hidden) { nav.style.transform = SHOWN; hidden = false; } };
    const hide = () => { if (!hidden) { nav.style.transform = HIDDEN; hidden = true; } };
    // subtle backdrop so the nav stays legible when floating over content —
    // absent at the very top so the hero keeps its original clean look.
    // backdrop-filter re-blurs the page behind the fixed bar on every scrolled
    // frame — cheap on desktop GPUs, a measurable per-frame cost on phones.
    // Phones get a slightly deeper plain gradient instead (no blur).
    const lite = !!(window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
    const scrimOn = () => {
      if (scrimmed) return; scrimmed = true;
      if (lite) {
        nav.style.background = 'linear-gradient(to bottom, rgba(8,6,5,0.72), rgba(8,6,5,0.32))';
      } else {
        // very light frosted glass: mostly transparent, content stays visible behind
        nav.style.background = 'linear-gradient(to bottom, rgba(8,6,5,0.28), rgba(8,6,5,0.06))';
        nav.style.backdropFilter = 'blur(6px) saturate(110%)';
        nav.style.webkitBackdropFilter = 'blur(6px) saturate(110%)';
      }
      nav.style.boxShadow = '0 1px 0 rgba(217,176,106,0.08)';
    };
    const scrimOff = () => {
      if (!scrimmed) return; scrimmed = false;
      nav.style.background = 'transparent';
      nav.style.backdropFilter = 'none';
      nav.style.webkitBackdropFilter = 'none';
      nav.style.boxShadow = 'none';
    };
    let acc = 0; // accumulated same-direction travel — hysteresis against touch jitter
    const update = () => {
      ticking = false;
      const y = window.scrollY || window.pageYOffset || 0;
      if (y <= 8) { show(); scrimOff(); lastY = y; acc = 0; return; }   // at the top → visible, no scrim (hero)
      scrimOn();
      const dy = y - lastY;
      lastY = y;
      if ((dy > 0 && acc < 0) || (dy < 0 && acc > 0)) acc = 0; // direction flip resets
      acc += dy;
      if (acc > 24) show();          // deliberate scroll down → visible
      else if (acc < -24) hide();    // deliberate scroll up   → hidden
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
  }

  function boot() {
    wireHovers(document);
    wireNoop(document);
    wireNavScroll(document);
    setupNavScrollReveal(document.querySelector('[data-ref="navRef"]'));
    const app = new GoldenCircle();
    window.__goldenCircle = app; // handy for debugging
    app.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
