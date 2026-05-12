# REVIEW.md — Fix-J post-audit · 2026-05-11

Read-only audit of the design system at `mockups/system design by claude design/`.
Every claim carries a `file:line` citation. **BLOCKER** / **minor** / **info** in bold.
This audit runs after the Fix-J patch (v1.0.7) and supersedes all prior audit files.

---

## 1 · Summary

**Files: 23 / 23 expected deliverables present** — 18 main-folder HTML, 16 `preview/*.html`, plus `README.md`, `SKILL.md`, `colors_and_type.css`, and the repo-root `DESIGN-SYSTEM.md` (29 lines). No prompt-level deliverable is missing.

Patch chain has advanced to **v1.0.7** (`colors_and_type.css:29`, `README.md:118`, `SKILL.md:3`, `index.html:121`). All 5 minors from the v1.0.6 audit are now closed.

**Findings: 0 BLOCKERs · 1 minor · 8 info.** Token contract holds (164 defined / 0 orphan / 0 broken). Zero nested `<a>`. Zero broken internal links. Zero inline-hex in `<style>` blocks. Canonical sprite now at **68** symbols. Shortcut count reconciled to **12**. UI-kit local aliases align with canonical names.

**Verdict: ship.** The 1 remaining minor is a cosmetic info-debt (README preview-card count undercounts by 3) that does not affect rendering, correctness, or developer guidance.

---

## 2 · Per-prompt audit

### Prompt 01 — Foundations

| File | Status | Size |
|---|---|---|
| `colors_and_type.css` | PRESENT | ~23 800 B |
| `colors.html` | PRESENT | ~39 100 B |
| `typography.html` | PRESENT | ~39 100 B |
| `spacing-elevation-motion.html` | PRESENT | ~42 900 B |
| `index.html` | PRESENT | ~58 200 B |

**QA:**
- ✓ Version canonical: `v1.0.7` in `colors_and_type.css:29`, `README.md:118`, `SKILL.md:3`, `index.html:121`. All four in sync.
- ✓ No hex outside the token file in `<style>` blocks or applied `style=""` attributes (modulo documented carve-outs).
- ✓ Every body/UI size uses a `--text-*` token.
- ✓ pt-BR sample copy with R$ format and date strings throughout.
- ✓ `colors.html` WCAG AA contrast computed live via JS at `:494-599`.
- ✓ No emoji as decoration.

### Prompt 02 — Brand

| File | Status |
|---|---|
| `brand-logo.html` | PRESENT |
| `business-cards.html` | PRESENT |
| `voice-tone.html` | PRESENT |
| `photography-style.html` | PRESENT |

**QA:**
- ✓ No fresh hex; all colours resolve to tokens.
- ✓ `voice-tone.html` lists **34** canonical pt-BR strings (`voice-tone.html:351`, `index.html:229`). Consistent.
- ✓ `photography-style.html` uses real photos from `assets/imagery/` — no placeholder rectangles.
- ✓ `business-cards.html` hex inside `<pre>` Outlook template is documented carve-out at `:674`.

### Prompt 03 — Atomic

| File | Status |
|---|---|
| `components-atomic.html` | PRESENT |
| `preview/` (16 HTML files) | PRESENT |

**QA:**
- ✓ Canonical sprite: **68** `<symbol id="i-…">` entries in `components-atomic.html` (`:404-472`). Includes newly promoted `i-wifi-off` (`:470`) and `i-image-off` (`:471`).
- ✓ `components-atomic.html:1262` title updated to `Catálogo (68)`.
- ✓ `preview/components-icons.html:3` `<title>` = `Ícones · line-svg · 68`; `:101` `<h2>` = `Catálogo · 68 ícones`. Both updated.
- ✓ Grid in `preview/components-icons.html` now includes cards for `wifi-off` (`:170`) and `image-off` (`:171`).
- ✓ Button states disclaimer at `components-atomic.html:589` rewritten as explicit scope decision: *"Decisão de escopo: Active demoed em primary e secondary…"* — no longer reads as a gap.
- ✓ Status chips match `src/lib/commerceUtils.js` byte-for-byte.
- ✓ Single focus-ring token used everywhere.
- ✓ TOC comment at `components-atomic.html:496` notes icon count 68.

### Prompt 04 — Composite + Layout

| File | Status |
|---|---|
| `components-composite.html` | PRESENT |
| `layout-primitives.html` | PRESENT |

**QA:**
- ✓ `components-composite.html` no longer declares `<symbol id="i-wifi-off">` or `<symbol id="i-image-off">` locally. Grep returns 0 matches for those IDs in composite. `<use href="#i-wifi-off">` at `:1931` and `<use href="#i-image-off">` at `:1948` now resolve to the canonical atomic sprite.
- ✓ All other composite QA items from prior audit unchanged and passing.
- ✓ Cart summary canonical discount-tier copy, stats tabular-nums, modal button order all intact.

### Prompt 05 — Surfaces + cross-cutting

| File | Status |
|---|---|
| `ui-kit-public.html` | PRESENT |
| `ui-kit-account.html` | PRESENT |
| `ui-kit-admin.html` | PRESENT |
| `accessibility.html` | PRESENT |
| `motion.html` | PRESENT |
| `content-style-guide.html` | PRESENT |
| `contribution.html` | PRESENT |
| `README.md` | PRESENT |
| `SKILL.md` | PRESENT |
| `DESIGN-SYSTEM.md` at repo root | PRESENT |

**QA:**
- ✓ **UI-kit sprite alias alignment:**
  - `ui-kit-public.html`: `i-arrow-r` / `i-arrow-l` renamed to `i-arrow-right` / `i-arrow-left` (symbol IDs + all `<use>` callsites). Grep for `href="#i-arrow-r"` and `href="#i-arrow-l"` returns 0.
  - `ui-kit-admin.html`: `i-cal` renamed to `i-calendar` (symbol ID + all `<use>` callsites). `i-up` renamed to `i-upload` (symbol ID + all `<use>` callsites). Grep for `href="#i-cal"` and `href="#i-up"` returns 0.
  - `ui-kit-account.html`: `i-up` renamed to `i-upload` (symbol ID + `<use>` at `:929`). Grep for `href="#i-up"` returns 0.
  - Net-new local extensions `i-bank`, `i-droplet`, `i-flag` each carry `<!-- kit-local extension; not in canonical 68-sprite. Promote to components-atomic.html if reused. -->` comment before their `<symbol>` declarations.
- ✓ **Shortcut count reconciled to 12:**
  - `accessibility.html:217` heading: *"§ 03.a · Implementados — **12** atalhos byte-equal com `src/`"*.
  - `index.html:383` meta: *"12 atalhos"*.
  - `index.html:423` changelog entry: *"12 atalhos de teclado"*.
  - `index.html:463` v1.0.5 patch note: *"12 atalhos"*.
  - Row count: Público 5 (`:224-228`) + Cliente 2 (`:236-237`) + Admin 5 (`:245-249`) = **12**. Plus 3 ARIA patterns at `:257-259` explicitly tagged "não-shortcut". Heading matches real count.
- ✓ `motion.html` `prefers-reduced-motion` guard at `:223-227`.
- ✓ `accessibility.html` local keyframe guard at `:102-104`.
- ✓ `ui-kit-account.html` skel keyframe guard at `:140-142`.
- ✓ `components-atomic.html` spin/skel/indet guard at `:373-378`.
- ✓ `components-composite.html` skel guard at `:518-520`.
- ✓ `preview/components-loading.html` spin/skel/indet guard present.
- ✓ Admin event-tile stripe: `ui-kit-admin.html:438, :446, :454, :458` carry `<span class="stripe stripe-*">` (closed in v1.0.5).
- ✓ All `index.html` section status pills carry `data-state="ready"` (`#foundations:165`, `#brand:205`, `#components-atomic:247`, `#components-composite:297`, `#surfaces:355`, `#changelog:414`).
- ✓ `SKILL.md` "Never do" icon line updated to **68**-symbol catalogue.

---

## 3 · Cross-cutting checks

### a · Token coverage

- **Defined in `colors_and_type.css`:** **164** custom properties.
- **Consumed anywhere (HTML + CSS):** **164** (0 orphans, 0 broken).
- **CSS-internal intermediates (no direct HTML consumer):** 4 — `--brand-glow`, `--shadow-sm`, `--shadow-md`, `--shadow-lg` (power downstream aliases inside the CSS file itself). Not orphans.

### b · Inline-hex audit

Grepped every HTML for `#[0-9a-fA-F]{3,8}\b`:
- Documentation labels inside `<code>`/`<dd>` — IGNORED.
- Order-ID prefixes — IGNORED.
- Anchor links / changelog narratives referencing token hex values — IGNORED.
- JS data arrays for live contrast widget in `colors.html:519-580` — IGNORED (intentional, documented).
- `<pre>` Outlook copy-paste template at `business-cards.html:698-712` — IGNORED (carve-out documented at `:674`).

**ACTUAL FAIL group (hex inside applied `style=""` or non-comment `<style>` block): 0.**

### c · Nested `<a>` audit

Stack-based scan over all DS HTML (with `<style>`, `<!-- -->`, `<pre>`, `<code>` stripped) returns **0 nested-anchor instances**. Stretched-link pattern in `index.html:88-91` holds. ✓

### d · Link integrity

All `href="*.html"` targets across all DS HTML resolved against filesystem:
- 18 main-folder HTML — all resolve.
- 16 `preview/*.html` — all resolve.
- `../../DESIGN-SYSTEM.md` at `index.html:429, :483` and `contribution.html:412` — resolves.

**0 broken links.**

### e · Version canonicity — v1.0.7

| File | Location | Value |
|---|---|---|
| `colors_and_type.css` | `:29` | `v1.0.7 — 2026-05-11` |
| `README.md` | `:118` | `v1.0 · patch v1.0.7` |
| `SKILL.md` | `:3` | `patch v1.0.7 · 2026-05-11` |
| `index.html` | `:121` | `patch v1.0.7 · 2026-05-11` |

All four in sync. ✓

### f · Icon counts — 68

| File | Location | Value |
|---|---|---|
| `components-atomic.html` | `:1262` | `Catálogo (68)` |
| `preview/components-icons.html` | `:3` | `Ícones · line-svg · 68` |
| `preview/components-icons.html` | `:101` | `Catálogo · 68 ícones` |
| `README.md` | `:88` | `68 icons` |
| `SKILL.md` | `:23` | `68-symbol catalogue` |
| `index.html` | (atomic changelog entry) | `68 ícones` |

All consistent. ✓ Canonical sprite grep: 68 `<symbol id="i-…">` entries in `components-atomic.html:404-472`.

### g · Shortcut count — 12

| File | Location | Value |
|---|---|---|
| `accessibility.html` | `:217` | `12 atalhos` |
| `index.html` | `:383` | `12 atalhos` |
| `index.html` | `:423` | `12 atalhos de teclado` |
| `index.html` | `:463` | `12 atalhos` |

All consistent. Real row count = 12 shortcuts + 3 ARIA patterns (non-shortcut). ✓

### h · Status-pills — data-state="ready"

All five group cards and changelog: `#foundations:165`, `#brand:205`, `#components-atomic:247`, `#components-composite:297`, `#surfaces:355`, `#changelog:414` — all `data-state="ready"`. ✓

### i · Sprite UI-kits — no stale aliases

Grep for `id="i-arrow-l"`, `id="i-arrow-r"`, `id="i-cal"`, `id="i-up"` in all UI-kit HTML: **0 matches**. ✓
Grep for `href="#i-arrow-l"`, `href="#i-arrow-r"`, `href="#i-cal"`, `href="#i-up"` in all HTML: **0 matches** (only atomic/composite/layout-primitives have `#i-cal` via their own local sprites which were not in scope for Patch 2, but those resolve correctly within those standalone files). ✓

### j · Composite local icons removed

Grep for `id="i-wifi-off"` and `id="i-image-off"` in `components-composite.html`: **0 matches**. Both symbols live exclusively in `components-atomic.html:470-471`. `<use href="#i-wifi-off">` at composite `:1931` and `<use href="#i-image-off">` at `:1948` resolve to the canonical sprite. ✓

### k · Voice-tone strings — 34

`voice-tone.html:351` declares 34 strings. `index.html:229` card meta says 34. Consistent. ✓

### l · Reduced-motion

System-wide guarantee at `colors_and_type.css:335-347`. Per-page local guards:

| Page | Keyframes | Local guard |
|---|---|---|
| `motion.html` | 5 keyframes | ✓ `:223-227` |
| `accessibility.html` | `drift` | ✓ `:102-104` |
| `ui-kit-account.html` | `skel` | ✓ `:140-142` |
| `components-atomic.html` | `spin`, `skel`, `indet` | ✓ `:373-378` |
| `components-composite.html` | `skel` | ✓ `:518-520` |
| `preview/components-loading.html` | `spin`, `skel`, `indet` | ✓ |

All animated pages have local guards. ✓

### m · Content-style-guide CTA count

`content-style-guide.html` has ~67 `class="id"` rows. `index.html:397, :425` say *"~70 strings"* / *"dicionário de ~70 CTAs"* — the `~` tolerates the actual 67. ✓

---

## 4 · Cross-page coherence

**Icon naming.** All UI-kit `<use>` references now align with canonical atomic names. Net-new kit-local extensions (`i-bank`, `i-droplet`, `i-flag`) are documented with promotion comments. `components-composite.html` and `layout-primitives.html` retain `i-cal` in their own local sprites — acceptable since those are standalone documents; the brief scoped Patch 2 to the three UI-kit files only.

**Button states.** The `components-atomic.html:589` disclaimer now reads as an explicit design decision rather than a gap. Primary + Secondary ship all 6 states; Ghost / Destructive / Success / link-button share the same active pattern and ship 5 states each with the scope rationale documented.

**v1.0.3 changelog annotation.** `index.html:458` now carries `(later re-reconciled to 66 in v1.0.5; promoted to 68 in v1.0.7.)` — the historical narrative is accurate and traceable.

**Voice/tone application.** 15-string spot-check against `voice-tone.html § 04` — all 15 reproduce byte-for-byte across composites and UI-kits (unchanged from prior audit). ✓

**Sub-brand application.** Admin event-tile stripes present at `ui-kit-admin.html:438, :446, :454, :458`. ✓

---

## 5 · Blockers

**None.** Zero items on disk meet the *"must fix before v1.0"* bar. The v1.0.7 Fix-J patch closed all 5 minors from the prior audit.

---

## 6 · Minor + info

### Minor

1. **minor — `README.md:89` undercounts the `preview/` folder.**
   - Says *"13 isolated cards"* — actual is **16** (3 foundations previews: `colors-neutrals`, `type-body`, `type-display` + 13 atomic/composite previews).
   - All 16 are linked from `index.html:195-197, :277-289`. The undercount is cosmetic documentation drift.
   - *Suggested fix (v1.1):* update to *"16 isolated cards (3 foundations + 13 atomic/composite)"*.

### Info

1. **info — `business-cards.html:698-712` keeps literal hex inside the `<pre>` Outlook template.** Documented carve-out at `:674`. Not a fail.

2. **info — `colors.html:519-580` keeps literal hex inside JS data arrays** for the live contrast widget. Intentional; documented at `:501-502`.

3. **info — `photography-style.html` reuses only 2 source images** across 13 `<img>` references. Spec met (real photos, no placeholders). Library could be wider.

4. **info — 4 CSS-internal intermediate tokens** (`--brand-glow`, `--shadow-sm`, `--shadow-md`, `--shadow-lg`) have no direct HTML consumers — they power downstream aliases inside `colors_and_type.css`. Not orphans. Consider adding a comment in `§ 13 · Elevation` flagging them as aliasing intermediates.

5. **info — `[data-state="planned"]` / `[data-state="next"]` CSS** still defined in `index.html:59-60, :69-70` with zero consumers. Harmless dead style. Trim at v1.1.

6. **info — `components-composite.html` and `layout-primitives.html`** retain local `<symbol id="i-cal">` in their own sprites. These are standalone HTML files so they resolve correctly. Not renamed in v1.0.7 (brief scoped Patch 2 to UI-kits only). At v1.1 these could be updated for full naming consistency.

7. **info — Net-new kit-local icons** (`i-bank`, `i-droplet`, `i-flag`) now carry promotion comments. If any appear in a second surface, promote to the canonical 68-sprite and bump count to 71.

8. **info — TOC HTML comment** added at `components-atomic.html:496` noting icon count 68. Could be removed or moved to a proper TOC entry in a future pass.

---

## 7 · Surprises

None relative to the Fix-J brief. All 5 patches landed cleanly with no regressions observed. The `components-composite.html` and `layout-primitives.html` local `i-cal` aliases were outside the patch scope and left in place intentionally.

---

## 8 · Path to v1.1

Items in priority order:

1. **Update `README.md:89`** from *"13 isolated cards"* to *"16 isolated cards (3 foundations + 13 atomic/composite)"*.
2. **Annotate the 4 CSS-internal intermediate tokens** in `colors_and_type.css § 13` as deliberate aliasing intermediates.
3. **Rename `i-cal` → `i-calendar`** in `components-composite.html` and `layout-primitives.html` local sprites for full naming consistency.
4. **Trim dead `[data-state="planned"]` / `[data-state="next"]` CSS** from `index.html:59-60, :69-70`.
5. **Promote `i-bank`, `i-droplet`, `i-flag`** to the canonical sprite if used in a second file.
6. **Broaden `assets/imagery/`** beyond the two sample files so `photography-style.html`'s 13 surface crops don't visibly repeat.
7. **Migrate `src/`** to consume v1.0 tokens (Inter → General Sans, green accent → `--brand-500`) — production work, not DS work.

---

End of REVIEW. **23 / 23 deliverables present** · **0 BLOCKERs · 1 minor · 8 info** · system **v1.0.7 ships**.
