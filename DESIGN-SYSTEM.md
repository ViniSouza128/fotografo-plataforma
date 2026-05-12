# DESIGN-SYSTEM.md

The visual system for this repo lives in **[`mockups/system design by claude design/`](./mockups/system%20design%20by%20claude%20design/)** — v1.0 since 2026-05-10.

**Start there:** [`mockups/system design by claude design/index.html`](./mockups/system%20design%20by%20claude%20design/index.html) is the landing. Five sections (Foundations · Brand · Atomic · Composite + Layout · Surfaces), every artifact one click away.

## What's locked

- **Tokens** — `colors_and_type.css` is the single source of truth. Obsidian 12-step ramp, Anchor Blue `--brand-500`, Signal Green `--signal-500` (money/confirm only), three sub-brands.
- **Fonts** — Instrument Serif (display italic), General Sans (UI/body), JetBrains Mono (IDs/numbers). Montserrat **LOGO ONLY**.
- **Surfaces** — 1280 public · 1280 cliente · 1440 admin · 720 prose. Dark only.

## Live `src/` vs DS

The production code (`src/app/base.css` and friends) still uses the older accent green + Inter/Space Grotesk. **That migration is out of scope of the DS** — see [contribution.html § 04 · Deprecation log](./mockups/system%20design%20by%20claude%20design/contribution.html) for what dies and when. Until migrated, `--accent`, `--dur-*` and `--shadow` (no number) remain as retrocompat aliases.

## Where to look for what

| If you need… | Open |
|---|---|
| A token reference | `colors_and_type.css` |
| A canonical UI string | `voice-tone.html` + `content-style-guide.html` |
| A component spec | `components-atomic.html` · `components-composite.html` |
| A keyboard shortcut policy | `accessibility.html` |
| Rules to add a new piece | `contribution.html` |
| The agent skill | `SKILL.md` |

One screen of content. The rest is in the DS folder.
