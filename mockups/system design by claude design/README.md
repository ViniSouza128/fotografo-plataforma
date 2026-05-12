# Vinícius Souza — Design System

A dark, editorial design system for a Brazilian photographer's three-surface business: the **public site** where clients buy event photos, the **client account** where they re-download past purchases, and the **admin dashboard** where Vinícius runs his operation.

**Audience:** event-goers (rodeio, corrida, festival, equestre) buying their own photos; plus the photographer himself managing albums, prices and payouts.
**Voice:** Brazilian Portuguese (pt-BR), editorial, confident, direct. No business jargon. *"Encontre-se nas fotos do seu evento em minutos."*
**Positioning:** editorial photojournalism — not a wedding-style glamour site, not a generic stock-photo marketplace. The brand wears its obsidian darkroom aesthetic on its sleeve.

> **Start here:** [index.html](./index.html) is the canonical landing. It groups everything into five sections: Foundations · Brand · Atomic · Composite + Layout · Surfaces & cross-cutting. Every other file in this folder is one click from there.

---

## Surfaces

```
┌─────────────────────────────────────────────────────────────────────┐
│  VINÍCIUS SOUZA · DESIGN SYSTEM · v1.0                              │
│                                                                     │
│  colors_and_type.css   ← single source of truth (tokens · fonts)    │
│         │                                                           │
│         ├──→ Foundations   colors · typography · spacing · motion   │
│         ├──→ Brand         logo · cards · voice · photography       │
│         ├──→ Atomic        button · input · chip · badge · icon     │
│         ├──→ Composite     photo-card · cart · KPI · table · modal  │
│         ├──→ Layout        navbar · sidebar · footer · grids        │
│         │                                                           │
│         └──→ Surfaces ┌── ui-kit-public.html   (1280 · 768 · 390)   │
│                       ├── ui-kit-account.html  (1280 · 390)         │
│                       └── ui-kit-admin.html    (1440)               │
│                                                                     │
│  Cross-cutting: accessibility · motion · content · contribution     │
└─────────────────────────────────────────────────────────────────────┘
```

| Surface | Width | Mood | Primary job |
|---|---|---|---|
| **Public site** | 1280 content | Editorial, cinematic, darkroom | Find your event → select photos → pay |
| **Client account** | 1280 content | Calm, archival, readable | Re-download past purchases, manage profile |
| **Admin** | 1440 content | Dense, operational, data-rich | Publish albums, see revenue, move money |

All three share `colors_and_type.css` — changes there propagate everywhere.

---

## Content fundamentals

- **Language:** Portuguese (Brazil). Dates as `22 mai 2026`, currency as `R$ 28,80` (comma decimal, period thousands), time as 24h `18:42`.
- **Tone rules:**
  - Write to a reader, not about one. *"Seus dados", "Seu carrinho", "Seu pedido"*.
  - Never say *"fotos profissionais"* — the brand *is* the profession. Just *"fotos"*.
  - Numbers earn their place: include them only when they let the reader decide or act (*"1.581 fotos"*, *"entrega < 48 h"*). Avoid invented stats.
  - Money is a clear act: *"R$ 28,80"*, not *"R$ 28,80 BRL"*.
- **Taxonomy:** events are categorised as **Rodeio · Corrida · Equestre · Festival · Futebol · Outros**.
- **Never:** emoji as decoration, filler *"explore more"* sections, double headers, cookie-banner copy at the top of pages.

See [voice-tone.html](./voice-tone.html) for the full set of principles and [content-style-guide.html](./content-style-guide.html) for prescriptive microcopy rules + the canonical CTA dictionary.

## Visual foundations

- **Obsidian palette** — a 12-step dark ramp from `--ink-0` (#000) to `--ink-1000` (#ede8e0, warm bone ink). Body copy is bone-white, not pure white — it nods to film.
- **Anchor Blue** (`#1f7ae0`, `--brand-500`) is the single primary accent, pulled from the word *EDITORIAL* in the logo. **Signal Green** (`#22c55e`, `--signal-500`) is reserved for money, confirmation and success.
- **Typography:** **Instrument Serif** for display and italic headlines (loves large sizes at 400), **General Sans** for UI and body at weight 300 default, **JetBrains Mono** for IDs, order numbers, timestamps, SHA hashes. Montserrat is **LOGO ONLY** — never UI.
- **Layout DNA:** 4-px spacing grid, 720 / 1280 / 1440 content maxes, generous breathing room at the top of marketing pages, dense and tabular in admin. Corner radii cap at 14 px (pill only for tags/buttons). Shadows are darkroom-deep and used sparingly.
- **Imagery:** the photos *are* the design. Compositions should leave room for them. Never place imagery behind bright gradients or apply saturation filters.
- **Brand architecture:** one mother mark (*Vinícius Souza · FOTOGRAFIA*) and three verticals — **Esportes** (scarlet), **Natureza** (forest), **Editorial** (anchor blue). Verticals share the wordmark and swap only the descriptor line and accent colour.

---

## File index

**Entry points**
- [`index.html`](./index.html) — DS landing, 5 sections, one click to anywhere.
- [`SKILL.md`](./SKILL.md) — how an agent should use this system when asked for new work (do/never list, token cheat-sheet).
- [`colors_and_type.css`](./colors_and_type.css) — single source of truth for visual tokens.

**Foundations**
- [`colors.html`](./colors.html) — obsidian ramp, brand, signal, semantic, sub-brand triad, WCAG pairing table.
- [`typography.html`](./typography.html) — three families, 13 sizes, three surface measures.
- [`spacing-elevation-motion.html`](./spacing-elevation-motion.html) — 16 spaces, 7 radii, 7 shadows, 4 durations × 3 easings, 5 breakpoints.

**Brand**
- [`brand-logo.html`](./brand-logo.html) — master mark + 3 verticals, 1 X construction, lockups, snippets.
- [`business-cards.html`](./business-cards.html) — 4 cards (mother + 3 verticals), social specs, QR.
- [`voice-tone.html`](./voice-tone.html) — 6 principles, surface tones, formats, 33 canonical strings, forbidden phrases.
- [`photography-style.html`](./photography-style.html) — composition, post rules, WM policy, surface crops.

**Atomic**
- [`components-atomic.html`](./components-atomic.html) — buttons, inputs, selection, badges, chips, tags, avatars, 68 icons, loading, dividers, links, tooltips.
- [`preview/`](./preview/) — 16 isolated cards (one per atom family + photo-card + event-card + KPI + cart).

**Composite + Layout**
- [`components-composite.html`](./components-composite.html) — photo card (8 variants), video card, folder, event card, cart summary, KPI, lists, tables, modals, toasts, states.
- [`layout-primitives.html`](./layout-primitives.html) — containers, rhythm, page header, admin sidebar, admin toolbar, public navbar, public footer, forms, grid recipes.

**Surfaces**
- [`ui-kit-public.html`](./ui-kit-public.html) — 12 screen families × 3 breakpoints (1280 / 768 / 390).
- [`ui-kit-account.html`](./ui-kit-account.html) — 8 screen families × 2 breakpoints (1280 / 390).
- [`ui-kit-admin.html`](./ui-kit-admin.html) — 14 screen families × 1 breakpoint (1440, desktop-first).

**Cross-cutting**
- [`accessibility.html`](./accessibility.html) — focus ring, tab order, 12 catalogued keyboard shortcuts (referenced to `src/`), ARIA patterns, contrast, reduced-motion, PR checklist.
- [`motion.html`](./motion.html) — in-context animations, page transition, modal/toast in, drag-drop, upload progress, skeleton, "don't animate" list.
- [`content-style-guide.html`](./content-style-guide.html) — per-surface writing rules, ~70 CTA strings indexed by location, microcopy rules, 18 empty/loading/error formulas, i18n plan.
- [`contribution.html`](./contribution.html) — 5 steps to add a component, token-first rule, naming conventions, deprecation log (12 items), SemVer policy.

**Folders**
- [`assets/`](./assets/) — logos, imagery, brand reference.
  - `assets/logos/` — SVG wordmarks, monogram, viewfinder mark.
  - `assets/imagery/` — sample photography used across mockups.
  - `assets/brand/` — legacy/reference plates.
- [`preview/`](./preview/) — single-component preview cards.
- [`uploads/`](./uploads/) — source screenshots and reference material from the user.

---

## Versioning

The DS is **v1.0 · patch v1.0.7** as of 2026-05-11 — Foundations · Brand · Atomic · Composite · Layout · Surfaces all locked. See [contribution.html § 05](./contribution.html) for the SemVer policy (when major / minor / patch bumps), and [§ 04 · Deprecation log](./contribution.html) for items marked to die (mostly retrocompat aliases for `src/`).

**v1.0.7 patch (2026-05-11)** fecha os 5 minors do REVIEW.md v1.0.6: i-wifi-off + i-image-off promovidos ao sprite canônico (**68** ícones); aliases locais dos UI-kits renomeados para o canônico (i-arrow-l/r → i-arrow-left/right, i-cal → i-calendar, i-up → i-upload); disclaimer de button states reescrito; narrativa v1.0.3 anotada; atalhos reconciliados para **12**.

**v1.0.6 patch (2026-05-10)** propaga a versão canônica entre README / SKILL / index / colors_and_type.css e adiciona wraps locais de `@media (prefers-reduced-motion: reduce)` em `components-atomic.html`, `components-composite.html` e `preview/components-loading.html` (sprite canônico era **66** ícones).

Next iteration (`v1.x`) is migration work in `src/` to consume v1.0 tokens — the live codebase still uses Inter/Space Grotesk and a green accent. That migration is **production work**, not DS work; the DS is stable.
