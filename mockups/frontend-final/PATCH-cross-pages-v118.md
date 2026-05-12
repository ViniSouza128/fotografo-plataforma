# PATCH-cross-pages-v118.md
**Data:** 2026-05-11 · **Arquivos:** `admin.html` + `cliente.html` → bumped to v1.0.18

---

## Resumo das correções automáticas

### Sticky bar z-index
| Arquivo | Seletor | Antes | Depois |
|---|---|---|---|
| admin.html | `.m-adm-topbar` | `z-index: 4` | `z-index: 50` |
| cliente.html | `.m-acc-tabs` | `z-index: 3` | `z-index: 50` |

### Tokenização de hex literais — CSS
| Arquivo | Seletor / contexto | Hex removido | Token aplicado |
|---|---|---|---|
| admin.html | `.adm-photo .check`, `.m-adm-photo .check` | `rgba(0,0,0,.7)`, `rgba(255,255,255,.2)` | `var(--scrim-dark)`, `var(--scrim-light)` |
| admin.html | `.adm-photo .pricetag`, `.m-adm-photo .pricetag` | `#fff` | `var(--ink-1000)` |
| admin.html | `.adm-photo.selected .check`, `.m-adm-photo.selected .check` | `color: #fff` | `color: var(--ink-1000)` |
| admin.html | `.adm-video .thumb .dur`, `.m-adm-video .thumb .dur` | `rgba(0,0,0,.7)` | `var(--scrim-dark)` |
| admin.html | `.bulk-bar`, `.m-adm-bulk` | `rgba(31,122,224,.35)` | `var(--brand-glow)` |
| admin.html | `.danger-zone`, `.m-adm-danger` | `rgba(224,85,79,0.05/0.3)` | `var(--danger-dim)` / `var(--danger-600)` |
| admin.html | `.m-adm-event-card .cover .cat` | `rgba(0,0,0,.65)`, `#fff` | `var(--scrim-dark)`, `var(--ink-1000)` |
| admin.html | `.face-match .pct`, `.face-match.weak .pct` | `#04130a`, `#1a1304` | `var(--signal-text)` |
| cliente.html | `.bubble.out` | `color: #fff` | `color: var(--ink-1000)` |
| cliente.html | `.m-cart-summary .pay-btn` | `color: #04130a` | `color: var(--signal-text)` |
| cliente.html | `.fav .id`, `.fav .heart` | `rgba(0,0,0,.65)`, `rgba(0,0,0,.7)` | `var(--scrim-dark)` |
| cliente.html | `.m-fav .id` | `rgba(0,0,0,.65)`, `#fff` | `var(--scrim-dark)`, `var(--ink-1000)` |
| cliente.html | `.m-chat-head .avatar`, `.acc-side .who .avatar` | `color: #fff` | `color: var(--ink-1000)` |
| cliente.html | `.notif.unread`, `.m-notif.unread` | `rgba(31,122,224,.04/.05)` | `var(--brand-dim)` |
| cliente.html | `.m-selfie::before` | `rgba(31,122,224,.5)` | `var(--brand-glow)` |
| cliente.html | `.face-match .pct` | `#04130a`, `#1a1304` | `var(--signal-text)` |
| cliente.html | `.m-face-grid .match .pct` | `rgba(0,0,0,.7)` | `var(--scrim-dark)` |

### Tokenização de hex literais — HTML inline styles
| Arquivo | Linha (aprox.) | Hex | Token |
|---|---|---|---|
| admin.html | múltiplas linhas avatar | `color: #fff` | `color: var(--ink-1000)` |
| admin.html | pricetag GRÁTIS / FREE | `color: #04130a` | `color: var(--signal-text)` |
| admin.html | badge BRONZE | `color: #c98a5a` | `color: var(--warning-600)` |
| admin.html | `.notif.unread` row inline | `rgba(31,122,224,.04)` | `var(--brand-dim)` |
| admin.html | info banner | `rgba(31,122,224,.3)` | `var(--brand-glow)` |
| admin.html | zona perigo header | `rgba(224,85,79,.3/.04)` | `var(--danger-600)` / `var(--danger-dim)` |
| cliente.html | "Ir para o pagamento" btn | `color: #04130a` | `color: var(--signal-text)` |
| cliente.html | avatar divs inline | `color: #fff` | `color: var(--ink-1000)` |
| cliente.html | danger zone card borders | `rgba(224,85,79,0.2/0.25)` | `var(--danger-600)` |

### Platform color token — WhatsApp button
- **admin.html** (2 botões): `<button class="btn sm primary">WhatsApp</button>` → `<button class="btn sm" style="background: var(--tp-whatsapp); ...">WhatsApp</button>`

### font-variant-numeric: tabular-nums
| Arquivo | Regra adicionada |
|---|---|
| admin.html | `td.num, .m-adm-row .v { font-variant-numeric: tabular-nums; }` |
| cliente.html | `.m-stat .v` e `.m-order .total` receberam `font-variant-numeric: tabular-nums` |

### Carve-outs documentados (rgba mantidos explicitamente)
- `--scrim-dark` / `--scrim-light` / `--signal-text`: definidos em `:root` local de cada arquivo com comentário de carve-out
- `.adm-video .thumb .play`: overlay `.4` — anotado como `/* carve-out: overlay translúcido médio */`
- `.wm-preview .wm.tile`: padrão gráfico de fundo decorativo — sem token equivalente

---

## Itens para revisão humana (não alterados)

1. **Estrutura `.adm-photo-grid` / `.adm-photo`** — aspect-ratio `3/2` (não `1/1`), classes customizadas vs. `.photo-tile` canônico. Decisão de layout.
2. **Estrutura `.fav-grid` / `.fav`** — aspect-ratio `3/2` desktop. Decisão de layout.
3. **`.adm-video`** — não migrado para `.photo-tile.is-video`. Decisão estrutural.
4. **Status "LIBERADO"** (admin.html, tabela pedidos) — canônico seria "Liberado" ou "Simulacao/liberacao". Aguarda decisão de voz/tom.
5. **Focus-ring global** — `:focus-visible` sem `var(--focus-ring)` em ambos os arquivos. Pertence a `shared.css`, fora do escopo deste patch.
6. **Status de comentários** — "PUBLICADO", "EM MODERAÇÃO": verificar alinhamento com voice-tone canônico.
