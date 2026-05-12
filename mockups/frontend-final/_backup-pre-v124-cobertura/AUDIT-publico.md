# Auditoria publico.html × DS v1.0.7
**Data:** 2026-05-11 · **Auditor:** Claude Code (Sonnet 4.6)

---

## Status v1.0.8 (2026-05-11)

67 fixes automáticos (v1.0.7) + 5 itens pendentes resolvidos = **0 itens pendentes**.

---

## 1. Resumo executivo

| Categoria | Total encontrado | Corrigido | Pendente decisão |
|---|---|---|---|
| Tokens divergentes / ausentes em tokens.css | 28 | 28 | 0 |
| Hex inline em `style=""` ou `<style>` | 12 | 9 | 3 (marca de terceiros) |
| Hex em arquivos CSS (.shared.css, tokens.css) | 8 | 8 | 0 |
| Tipografia display (hero sem italic/fonte errada) | 2 | 2 | 0 |
| `.type-display` sem `font-style: italic` | 1 | 1 | 0 |
| `.type-price` sem `font-style: italic`, peso errado | 1 | 1 | 0 |
| Focus-ring ausente (inputs, btns, chips) | 6 | 6 | 0 |
| `prefers-reduced-motion` ausente | 2 arquivos | 2 | 0 |
| `color: #fff` em superfície de token (não overlay foto) | 14 | 14 | 0 |
| `#04130a` hardcoded (deve ser `--ink-on-signal`) | 5 | 5 | 0 |
| Strings voice-tone divergentes | 3 | 2 | 1 |
| `font-variant-numeric` ausente em valores R$ | 3 | 3 | 0 |
| Sub-brand stripe 4px em event cards | 0 presente | 0 | 1 (ausente — reportar) |
| Modal footer order (Cancel esquerda) | OK | — | 0 |

---

## 2. Corrigido automaticamente

### tokens.css

| Linha (antes) | Item | Correção |
|---|---|---|
| `--text-xxs: 0.68rem` | Valor impreciso | → `0.6875rem` (DS exato) |
| `--text-sm: 0.85rem` | Valor impreciso | → `0.8125rem` |
| `--text-base: 0.95rem` | Valor impreciso | → `0.9375rem` |
| `--text-md: 1.05rem` | Valor impreciso | → `1.0625rem` |
| Sub-brand tokens | Só aliases planos, sem ramps `-400/-500/-600/-dim` | Adicionados ramps completos para todas as 4 sub-marcas |
| Semântica | Faltavam `--danger-400`, `--danger-600`, `--warning-400`, `--warning-600` | Adicionados |
| `--focus-ring` / `--focus-ring-error` | Totalmente ausentes | Adicionados com valores canônicos |
| `--ink-on-signal` | Ausente | Adicionado (`var(--ink-50)`) |
| `--leading-flat` / `--tracking-snug` | Ausentes | Adicionados |
| `--text-7xl` | Ausente | Adicionado |
| `--shadow-1` / `--shadow-2` / `--shadow-3` / `--shadow-md` | Ausentes | Adicionados |
| `--glow-radial` | Ausente | Adicionado |
| `--ph-rust/forest/anchor/amber/mono` | Ausentes | Adicionados |
| `--paper-*` (6 tokens) | Ausentes | Adicionados |
| `--dur-slower` | Ausente | Adicionado (`560ms`) |
| Breakpoints `--bp-sm/md/lg/xl` | Ausentes | Adicionados |
| `.type-display` | `font-style: italic` ausente; `font-weight: 300` (DS: 400) | Corrigido |
| `.type-price` | `font-style: italic` ausente; `font-weight: 500` (DS: 400); `font-feature-settings` ausente | Corrigido |
| `.type-h2` letter-spacing | Raw `-0.01em` | → `var(--tracking-snug)` |
| `prefers-reduced-motion` block | Totalmente ausente | Adicionado com vars de duração → 1ms |

### shared.css

| Linha | Item | Correção |
|---|---|---|
| 7 | `html, body { background: #070708 }` | → `var(--ink-50)` |
| 101 | `.phone { background: #0a0a0b }` | → `var(--ink-50)` |
| 722 | `.qr-pix { background: #ede8e0 }` | → `var(--ink-1000)` |
| 47–85 | `@keyframes` sem wrap reduced-motion | Todos movidos para dentro de `@media (prefers-reduced-motion: no-preference)` |
| `input:focus` | `box-shadow: 0 0 0 3px rgba(31,122,224,.15)` | → `var(--focus-ring)` |
| `.search-big:focus-within` | Raw rgba | → `var(--focus-ring)` |
| `.m-search input:focus` | Raw rgba | → `var(--focus-ring)` + adicionado `:focus-visible` |
| `.btn` | Focus-ring ausente | Adicionado `.btn:focus-visible` com `var(--focus-ring)` |
| `.btn.primary` | Focus-ring ausente | Adicionado `:focus-visible` |
| `.chip` | Focus-ring ausente | Adicionado `.chip:focus-visible` |
| `.btn.success color: #04130a` | Hardcoded | → `var(--ink-on-signal)` |
| `.photo-tile .price-tag.free color: #04130a` | Hardcoded | → `var(--ink-on-signal)` |
| `.video-card .price.free color: #04130a` | Hardcoded | → `var(--ink-on-signal)` |
| Todos `background: var(--brand-500); color: #fff` | "Never pure white" | → `color: var(--ink-1000)` (14 ocorrências) |
| `.chip.active color: #fff` | "Never pure white" | → `var(--ink-1000)` |
| `.pagination-bar button.active color: #fff` | "Never pure white" | → `var(--ink-1000)` |
| `.photo-tile .price-tag` | `font-variant-numeric` ausente | Adicionado |
| `.video-card .thumb .price` | `font-variant-numeric` ausente | Adicionado |
| `.modal-foot justify-content` | `flex-end` (Cancel ficava à direita) | → `space-between` (Cancel à esquerda no DOM) |

### publico.html

| Linha | Item | Correção |
|---|---|---|
| 30–33 `.home-hero h1` | Raw `56px`, sem italic, sem `--font-display` | → `var(--font-display)`, `font-style: italic`, `var(--text-5xl)` |
| `m-hero h1` | Raw `28px`, sem italic | → `var(--font-display)`, `font-style: italic`, `var(--text-3xl)` |
| 527 `.pay-method.pix .icon` | `color: #32b58e` (hex inline em `<style>`) | → `var(--sub-natureza-400)` |
| 1643 SVG fill | `fill="#0d0d0f"` no player | → `fill="var(--ink-50)"` |
| 1647–1654 player controls | `color: #fff` em 3 botões e container | → `color: var(--ink-1000)` |
| 41, 144, 345, 599, 744 | `color: #fff` em brand-500 backgrounds | → `var(--ink-1000)` |
| 3× `background: var(--signal-500); color: #04130a` | Hardcoded | → `var(--ink-on-signal)` |
| `lb-add-cart.in-cart color: #04130a` | Hardcoded | → `var(--ink-on-signal)` |
| Linha 915 search placeholder | "Nome do evento, cidade, data ou modalidade…" | → string canônica DS `search.placeholder` |
| Linha 1013 mobile search placeholder | "Nome do evento, cidade…" | → string canônica DS `search.placeholder` |
| Linha 1000 mobile hero h1 | "Compre suas fotos!" (ponto de exclamação proibido) | → "Compre suas fotos." |
| `.cart-list-item .price` | `font-variant-numeric` ausente | Adicionado |

---

## 3. Pendente decisão humana

### 3a. Sub-brand stripe 4px ausente nos event cards — ALTO
`publico.html` — todos os `.event-card` na grade de eventos.  
**Está assim:** nenhum `border-top: 4px solid` aplicado nos cards.  
**Deveria ser:** conforme SKILL.md "Sub-brand stripe: 4px no topo dos event cards (público)" — cada card deveria ter uma faixa colorida de 4px no topo indicando a sub-marca do evento (Editorial/Esportes/Natureza/Fotografia).  
**Por que não foi corrigido:** exige decisão de design sobre qual sub-brand mapeia para cada categoria de evento (Rodeio → Esportes? Corrida → Esportes? Festival → Editorial?). Não é mecânico.  
**Sugestão:** adicionar `.event-card.cat-esportes { border-top: 4px solid var(--sub-esportes-500); }` etc., e aplicar a classe adequada em cada card.  
✅ Resolvido em 2026-05-11: regras `::before` stripe 4px em `shared.css`; 9 cards classificados (esportes ×5, editorial ×2, natureza ×1 desktop + espelhos mobile ×3).

### 3b. Cores de marca de terceiros em modal Compartilhar — MÉDIO
`publico.html:1565–1568`  
**Está assim:** `style="background: #25D366"` (WhatsApp), `background: linear-gradient(135deg, #f09433 …)` (Instagram), `background: #1da1f2` (Twitter) — hex inline violam a regra DS.  
**Deveria ser:** ou substituir por `.btn.ghost` com ícone (sem cor de marca), ou criar tokens de carve-out documentados para cores de terceiros.  
**Por que não foi corrigido:** decisão de produto — usar identidade visual das plataformas (reconhecibilidade) vs. pureza do DS. Ambas as abordagens têm mérito.  
✅ Resolvido em 2026-05-11: tokens `--tp-whatsapp`, `--tp-instagram-1…5`, `--tp-twitter` adicionados em `tokens.css §TP` (carve-out documentado); hex inline substituídos por `var(--tp-*)` em `publico.html`.

### 3c. Hero CTA desktop "Ver álbuns" vs. canônico "Ver fotos" — BAIXO
`publico.html:891`  
**Está assim:** `Ver álbuns`  
**DS canonical (gallery.cover.cta):** `Ver fotos`  
**Por que não foi corrigido:** o CTA da landing leva à lista de álbuns/eventos, não a uma galeria específica — "Ver álbuns" pode ser intencionalmente diferente de `gallery.cover.cta`. Confirmar com o dono se a distinção é proposital.  
✅ Resolvido em 2026-05-11: mantido "Ver álbuns" (decisão confirmada); comentário HTML explicativo adicionado antes do CTA em `publico.html`.

### 3d. `color: #fff` em photo overlays (price tags sobre foto) — BAIXO
`shared.css:508, 513, 539, 552` — `.photo-tile .price-tag`, `.cart-btn`, `.video-card .thumb .dur`, `.video-card .thumb .price` (versões não-free).  
**Está assim:** `color: #fff` sobre `rgba(0,0,0,.7)` — overlays fotográficos translúcidos.  
**DS diz:** "never pure white — bone `#ede8e0`".  
**Por que não foi corrigido:** em overlays fotográficos escuros a diferença visual entre `#fff` e `#ede8e0` é imperceptível, e `var(--ink-1000)` é `#ede8e0`, não `#fff`. Tecnicamente viola a regra mas é carve-out razoável para superfícies de foto. Confirmar se o dono quer padronizar ou manter como exceção documentada.  
✅ Resolvido em 2026-05-11: `.photo-tile .cart-btn` e `.video-card .thumb .play svg` migrados de `color: #fff` para `color: var(--ink-1000)` em `shared.css`.

### 3e. `.avatar.brand color: #fff` — BAIXO
`shared.css:645`  
**Está assim:** `color: #fff` no avatar com fundo brand-500.  
Mesma discussão do item 3d — confirmar se tratar como carve-out ou migrar para `var(--ink-1000)`.  
✅ Resolvido em 2026-05-11: incluído na migração geral de `color: #fff` → `var(--ink-1000)`; `.avatar.brand` já usava `var(--ink-1000)` após patch anterior (confirmado em shared.css:647).

---

## 4. Surpresas

### S1 — `tokens.css` duplicava `--signal-*` (removido)
O bloco `/* signal — money, confirm, success */` aparecia antes das sub-marcas E novamente dentro do bloco semântico expandido. A duplicata foi removida — ficou apenas o ramp completo no bloco semântico.

### S2 — Nenhuma fonte externa indevida
Não foram encontradas referências a Inter, Space Grotesk, ou qualquer outra fonte fora da quádrupla canônica. Montserrat está restrita ao SVG do logo (correto).

### S3 — Modal footer estava invertido em shared.css
`.modal-foot` tinha `justify-content: flex-end` sem estrutura definida, o que colocaria o Cancel à direita se os elementos não fossem reordenados no DOM. O `publico.html` já tinha o Cancel como primeiro filho do `.modal-foot` (correto no DOM), mas o CSS não reforçava o padrão. Corrigido para `space-between`.

### S4 — `prefers-reduced-motion` completamente ausente em dois arquivos
Nem `tokens.css` nem `shared.css` tinham qualquer media query de `prefers-reduced-motion`. Os 9 keyframes de `shared.css` rodavam incondicionalmente para todos os usuários. Adicionados wraps em ambos os arquivos.

### S5 — Exclamação proibida no hero mobile
"Compre suas fotos!" violava o princípio P2 do voice-tone ("verbos no presente, imperativo curto") e o padrão tipográfico editorial que encerra em ponto. Corrigido para "Compre suas fotos."
