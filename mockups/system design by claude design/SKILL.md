# Skill — Designing inside the Vinícius Souza system

When asked to design a new screen, component or flow for this project, follow these rules. They are extracted from the locked decisions across Prompts 01–05. **v1.0 · patch v1.0.7 · 2026-05-11** — see [REVIEW.md § 8](./REVIEW.md) for the audit that closed the v1.0 blockers.

## Always do

1. **Import the tokens.** Every HTML file must link `colors_and_type.css` (or `../colors_and_type.css`) — never redefine a colour or a type scale inline. Never introduce a hex code that isn't in the CSS variables.
2. **Check the kit before building.** Look in [`components-atomic.html`](./components-atomic.html), [`components-composite.html`](./components-composite.html) and [`layout-primitives.html`](./layout-primitives.html). If it's already there, reuse — don't fork.
3. **Match the surface kit.** A new screen for the public site goes into [`ui-kit-public.html`](./ui-kit-public.html), for the client into [`ui-kit-account.html`](./ui-kit-account.html), for admin into [`ui-kit-admin.html`](./ui-kit-admin.html). The surface kit is the source — the React in `src/` is downstream.
4. **Write Portuguese (BR).** Currency `R$ 28,80`, dates `22 mai 2026`, time 24 h `18:42`. Status strings are canonical and **byte-identical** to `src/lib/commerceUtils.js` — including `Simulacao/liberacao` (single aggregate label, no accents) emitted by `getFinancialStatus()`.
5. **Let photos lead.** On the public site and editorial work, the photograph is the hero. Design the frame, not the content.
6. **Respect the three surfaces:**
   - **Public** — editorial, confident, generous margins, large italic display headlines.
   - **Account** — calm, archival, sidebar 240 px + canvas, body 13–15 px.
   - **Admin** — dense, tabular, mono for IDs, badges for status, 1440 wide, desktop-first.
7. **Use placeholders over bad assets.** If you don't have the right photo/icon, leave a proportioned placeholder with a label — don't improvise art in SVG.
8. **Document an empty, loading and error state** for any new content surface. Cópia comes from [`content-style-guide.html`](./content-style-guide.html) — don't invent.
9. **Honour `prefers-reduced-motion`.** Use transition tokens (auto-reduced) or wrap keyframes in a `@media` fallback. See [`motion.html`](./motion.html).
10. **Add the keyboard shortcut to the catalogue** in [`accessibility.html`](./accessibility.html) the moment you wire one — before merging.

## Never do

- Don't use emoji as UI affordance. If you need an icon, use the 68-symbol catalogue in `components-atomic.html` (line-svg via `<use href="#i-...">`).
- Don't reach for gradients as a primary surface — the palette is already expressive. The single allowed gradient is `--glow-radial`, used **once per viewport** behind a hero.
- Don't introduce a new accent colour. If semantic meaning is missing, compose from existing tokens (brand, signal, warning, danger, sub-esportes, sub-natureza, sub-editorial, sub-fotografia).
- Don't introduce a new font family. Three families + Montserrat (LOGO ONLY). Closed.
- Don't introduce a new radius. The 7-step radii scale is sufficient.
- Don't fill space with fake content or "trust" sections. Every block earns its place.
- Don't use pure white — bone `#ede8e0` (`--ink-1000`) is the primary ink.
- Don't use `outline` for focus — always `box-shadow: var(--focus-ring)` so it respects `border-radius`.
- Don't write `--accent` / `--dur` / `--shadow` (no number) in new work — those are deprecated retrocompat aliases. Reach for `--brand-500`, `--duration-base`, `--shadow-2`.
- Don't write secret keyboard shortcuts — every keydown handler is catalogued.
- Em código novo, prefira primitivos (`--ink-300`, `--brand-500`) aos aliases semânticos (`--bg-card`, `--text-muted`). Aliases existem só pra compat com `src/`.

## Token cheat-sheet

```css
/* backgrounds, darkest → lightest */
var(--ink-50)    /* page bg (darkest, admin canvas) */
var(--ink-100)   /* standard page bg — public + cliente */
var(--ink-200)   /* elevated surface — sidebars, secondary */
var(--ink-300)   /* card */
var(--ink-400)   /* input · hovered card */

/* borders */
var(--ink-500)   /* standard divider · 1 px solid default */
var(--ink-600)   /* emphasised border · focused input */

/* text, dim → strong */
var(--ink-700)   /* disabled / timestamps · use sparingly */
var(--ink-800)   /* muted / meta · captions */
var(--ink-900)   /* body */
var(--ink-1000)  /* primary ink (bone white) */

/* accents */
var(--brand-500) /* primary interactive (Anchor Blue) */
var(--signal-500)/* money, confirm, success (Signal Green — reserved) */
var(--warning-500) var(--danger-500)

/* sub-brand triad (use only for vertical chips/stripes) */
var(--sub-esportes-500)  var(--sub-natureza-500)
var(--sub-editorial-500) var(--sub-fotografia-500)

/* type */
var(--font-display) /* Instrument Serif — italic headlines, prices */
var(--font-heading) /* General Sans — h1–h5 */
var(--font-body)    /* General Sans — UI default */
var(--font-mono)    /* JetBrains Mono — IDs, hashes, code, timestamps */
var(--font-brand)   /* Montserrat — LOGO ONLY · never UI */

/* the always-the-same defaults */
var(--radius)         /* 8 px · button, input, card-default */
var(--space-4)        /* 16 px · default gap */
var(--duration-base)  /* 200 ms · default transition */
var(--ease-out)       /* default easing */
var(--shadow-2)       /* card hover · dropdown */
var(--focus-ring)     /* always for :focus-visible */
```

## Picking a type size

| Use | Token | Notes |
|---|---|---|
| Billboard / cover | `--text-7xl` | clamp 80 – 152; very rare |
| Hero display | `--text-5xl` / `--text-6xl` | italic via `.type-display` |
| Page title | `--text-3xl` | weight 400 |
| Card title | `--text-lg` / `--text-xl` | weight 500 |
| Body | `--text-base` | weight 300, leading-relaxed |
| Eyebrow / labels | `--text-xs` | `tracking-widest`, uppercase |
| Prices | `--font-display` italic | `tabular-nums` via `.type-numeric` or `.type-price` |

## Picking a component

| Need | Use |
|---|---|
| Primary action | solid Anchor Blue button, `--radius` 8 |
| Success / pay / download | solid Signal Green button |
| Secondary | transparent with `--ink-500` border |
| Destructive | `--danger-dim` fill + `--danger-500` text |
| Status pill | badge w/ dim fill + 30 %-opacity border of same hue |
| Filter | chip — active state = solid Anchor Blue |
| Table header | uppercase `--text-xs`, `--ink-800`, `--tracking-wider`, mono |
| ID / order number | `--font-mono`, `--ink-900`, `--tracking-snug` |
| Container width | 1280 (public + cliente), 1440 (admin), 720 (prosa) |

## Picking a layout

- **Public site:** navbar 58 px sticky · content max 1280 · footer with sub-brand stripe.
- **Account:** sidebar 240 px left · canvas right · bottom-tab nav on mobile.
- **Admin:** sidebar 240 px (collapsible 64) · topbar with search + avatar · tables are the main surface.

## Modal button order

Always: **Cancelar à esquerda · primária à direita.** Destructive primary uses `btn-danger`. Confirmation phrase ends in `?` (decision) or `.` (info), never both.

## When exploring variations

If the user asks for multiple options on one screen, wrap each variant in a `<DCArtboard>` inside a `design_canvas.jsx` frame rather than forking HTML files — keeps comparisons side-by-side.

## Screen labels

Add `data-screen-label="<Surface> · <Screen>"` on each frame so user comments land on the right place. Follow the pattern already in the UI kits (e.g. `Public · Event Gallery`, `Admin · Album Manager`).

## When in doubt

1. Open [index.html](./index.html) — every artifact in the system is one click away.
2. Read [contribution.html § 06 · Defaults](./contribution.html) — the silent decisions that show up in every PR.
3. The simplest answer is almost always: **token, atom, composite, layout, surface** — in that order.
