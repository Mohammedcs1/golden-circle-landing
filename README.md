# Golden Circle — Website

The live website for **Golden Circle**, a marketplace that connects premium brands with
content creators (UGC). This is the production build of the original Claude "Design"
export, converted to a self-contained static site with **zero build step** and every
visual detail (animations, colors, curved gold lines, timings) preserved exactly.

## Structure

```
site/
  index.html                     # landing page (hero + Our Story + Creator/Brand journeys + footer)
  pages/
    coming-soon.html             # placeholder for not-yet-built account/dashboard pages
  assets/
    css/base.css                 # reset + @keyframes (verbatim from the design)
    js/golden-circle.js          # ported hero + scroll animation logic
```

The original design lives one level up in `../Copy of Golden Circle Hero Animation/`
and is kept as the reference to diff against — it is not used at runtime.

## How it works

- The hero logo is 31 SVG arcs traced from the original logo. On scroll they
  **compress → emit a golden pulse → morph into flowing ribbons**, then the hero text
  fades in. This is driven by a `requestAnimationFrame` loop in `golden-circle.js` plus
  **GSAP ScrollTrigger**.
- Sections below the hero reveal on scroll via `IntersectionObserver`; the two 5-step
  timelines draw their connecting gold line through the numbered dots (measured live
  from the DOM, so they stay correct at any width).
- `prefers-reduced-motion` is respected — the page shows the static end-state.

### External dependencies (loaded from CDN)

- **GSAP 3.12.5** + **ScrollTrigger** (cdnjs)
- **Google Fonts**: Cinzel, Cormorant Garamond, Jost

These can be self-hosted later for full offline/independence without changing any
visuals. An internet connection is required for the animation on first load.

## Run locally

From the repo root, serve the `site/` folder over HTTP (opening `index.html` via
`file://` also works, but a local server matches production and avoids any CORS quirks):

```bash
# Python
python -m http.server 5173 --directory site

# or Node
npx serve site
```

Then open <http://localhost:5173/>.

## Deploy

The site is fully static, so it deploys anywhere:

- **Vercel / Netlify**: point the project at this folder; set the publish/output
  directory to `site` and use no build command.
- **GitHub Pages / any static host / cPanel**: upload the contents of `site/`.

## Editing / adding pages

New design exports are converted with the same recipe used for `index.html`:

1. Move `<helmet>` contents (fonts, GSAP, `<style>`) into `<head>`.
2. `ref="{{ xRef }}"` → `data-ref="xRef"`.
3. `style-hover="…"` → `data-hover="…"` (handled by `wireHovers` in the JS).
4. `onClick="{{ noop }}"` → `href="#" data-noop` (handled by `wireNoop`).
5. Bake `data-props` defaults in as constants.
6. Keep all inline styles, SVG, and animation math byte-for-byte.

## Roadmap

- **Now:** faithful landing page (done).
- **Next:** convert additional design pages as they arrive.
- **Later:** the functional platform — brand & creator registration + auth, dashboards,
  campaigns, messaging, payments (needs a backend, database, and payment provider;
  stack + hosting chosen when the first functional design is ready).
