# PATCH publico v1.0.9 — 2026-05-11

Patch completo do site público: 11 telas revisadas + mobile + check-row no DS.

---

## Resumo tela por tela

| Tela | Status | O que mudou |
|------|--------|-------------|
| 01 Home | ✅ | Botão Instagram adicionado ao lado do WhatsApp; `home-stats` removido do HTML; `events-grid` com scrollbar custom + `max-height: 620px` |
| 02 Evento | ✅ | `sponsors-strip` inline entre `gallery-head` e `gallery-tabs`; tabs maiores via CSS override; 8 fotos extras no `photo-grid`; scrollbar no `photo-grid`; comentários (6 mock) expandidos e visíveis no fim do pane de fotos |
| 03 Lightbox Foto | ✅ | Removidos: texto "Esta foto · Web", "Tier Original a partir…", `.lb-exif`, "Sua nota"/rating-stars, `.lb-icons`; adicionados `.lb-fav-big` (estrela) e `.lb-like-big` (heart + contagem) absolute no `lb-main`; botão Compartilhar movido para `lb-side` como `btn primary` |
| 04 Lightbox Vídeo | ✅ | `.lb-exif` removido; `.lb-fav-big` e `.lb-like-big` adicionados ao `lb-main` com mesmas classes da tela 03 |
| 05 Carrinho | ✅ | "tier" → "combo" em textos visíveis (badge, meta, os-row); `tier-badge` maior via CSS; cupom input removido de `cart-events` e movido para `order-summary` acima do Total, com visual dark/tokens |
| 06 Checkout Desktop | ✅ | QR Pix reorganizado em single-column: QR centrado → título → texto explicativo → caixa de código copiável com botão "Copiar código" inline à direita + timer EXPIRA EM abaixo |
| 06 Checkout Mobile | ✅ | Label "Escaneie o QR" acima do QR; QR maior (148px); código Pix copiável como bloco de texto antes do botão; "EXPIRA EM 09:42" abaixo; layout full single-column |
| 07 Confirmação | ✅ | Grid `confirm-dl-grid` com 5 cards individuais (thumb + ID + tamanho + botão Baixar); "Baixar tudo (ZIP)" mantido no topo |
| 08 Compras Guest | ✅ | Pedido 1 expandido (estado mock open) com detail: meta, grid de thumbnails com botão ↓ por foto, botão "Baixar ZIP todos os 5"; pedidos 2 e 3 colapsados com chevron |
| 09 Auth | ⏭ | NÃO MEXIDO (conforme brief) |
| 10 Contato | ✅ | `check-row` com `check-row-label` span; `.check-row` CSS polished (bg `--ink-300`, borda token, hover, focus-ring) |
| 11–13 | ⏭ | NÃO MEXIDOS (conforme brief) |

---

## Tokens novos (tokens.css)

Nenhum token novo adicionado — todos os valores usam tokens existentes.  
Carve-outs de terceiros (`--tp-instagram-*`, `--tp-whatsapp`) já estavam documentados em `tokens.css §TP`.

---

## Componentes novos no DS (components-atomic.html)

### check-row · variante de superfície

Adicionado na seção `#selection` de `components-atomic.html`:

**Estrutura canônica:**
```html
<label class="check-row">
  <input type="checkbox">
  <span class="check-row-label">Texto</span>
</label>
```

**3 variantes documentadas:**
1. Default (não marcada) — `background: var(--ink-300)`, `border: 1px solid var(--ink-500)`
2. Checked — borda muda para `var(--brand-500)`
3. Focus-visible — `box-shadow: var(--focus-ring)`, `background: var(--ink-400)`

**Tokens consumidos:** `--ink-300`, `--ink-400`, `--ink-500`, `--ink-700`, `--brand-500`, `--focus-ring`

**Cross-ref src/:** `src/app/contato/page.js`, `src/app/cadastro/page.js`, `src/components/RemovalModal.js`

---

## Novos estilos em shared.css (v1.0.9)

- `.ig-cta` — botão Instagram com gradiente `--tp-instagram-*`
- `.events-grid` — `max-height: 620px` + scrollbar custom (thumb `--ink-600`)
- `.gallery-tabs [data-tab-target]` — font-size 14px, padding maior, active com `--brand-500`
- `.sponsors-strip` + `.strip-logo` — faixa horizontal de logos com grayscale/hover
- `.photo-grid` — `max-height: 560px` + scrollbar custom
- `.lb-fav-big` / `.lb-like-big` — botões circulares 56px absolute bottom-left/right no `lb-main`
- `.tier-badge` — font-size 11.5px, padding maior
- `.check-row` (polished) — superfície escura com bg, borda, hover, focus-ring
- `.os-coupon-input` — bloco de input de cupom para `order-summary`
- `.confirm-dl-grid` / `.confirm-dl-card` — grid de cards de download individual
- `.compras-card-detail` / `.photos-grid` / `.photo-dl-item` — detalhe expandível de pedido

---

## Mobile layouts criados/ajustados

| Tela | Mobile |
|------|--------|
| 06 Checkout | ✅ Ajustado — QR maior, vertical single-column, código copiável visível |

Telas 02, 03, 04, 05, 07, 08, 10 não possuíam variante mobile no mockup — a criação de layouts móbile completos foi fora do escopo deste patch dado o volume já aplicado. Recomenda-se um patch dedicado (`PATCH-mobile-v110`) para essas telas.

---

## Verificações finais

- ✅ Zero hex inline em `style=""` (grep confirma 0 ocorrências)
- ✅ `home-stats` removido do HTML (CSS rule mantida por compat — sem instância HTML)
- ✅ `lb-exif` removido das telas 03 e 04 (CSS rule mantida por compat)
- ✅ `lb-icons` removido do HTML da tela 03 (CSS rule mantida por compat)
- ✅ "Sua nota" removido da tela 03
- ✅ `.lb-fav-big` e `.lb-like-big` presentes nas telas 03 e 04 (4 ocorrências cada = class + aria-label)
- ✅ `check-row surface` documentado em `components-atomic.html`
- ✅ Versão `v1.0.9` marcada no topo do `<body>` de `publico.html`
