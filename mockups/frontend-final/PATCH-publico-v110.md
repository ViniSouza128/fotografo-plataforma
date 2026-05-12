# PATCH publico.html — v1.0.10
Data: 2026-05-11

## Resumo tela por tela

### Tela 01 — Home Desktop
- `.wa-cta` agora usa `background: var(--tp-whatsapp)` (verde #25D366) com `border: 0`. Mesmo padrão visual do botão Instagram (preenchido e colorido).

### Tela 02 — Event Gallery Desktop
- Tabs: textos alterados para `Fotos (1900)`, `Vídeos (18)`, `Comentários (32)` — contadores inline, sem `.num` separado.
- Tab "Patrocinadores" removida do `gallery-tabs` (seção `sponsors-strip` permanece).
- `.gallery-tools` removido de ambas as abas (Fotos e Vídeos).
- Comentários expandidos no fim do `photo-grid` removidos — acessíveis apenas via tab.
- `photo-grid`: `grid-template-columns: repeat(auto-fill, minmax(180px, 1fr))` e `gap: var(--space-12)`.
- `.combo-tiers` adicionado entre `sponsors-strip` e `gallery-tabs`: 4 cards (2/3+/5+/8+ fotos) com tiers de desconto (-10%/-20%/-28%/-35%). Card "3+ Fotos" marcado como ativo com borda `var(--brand-500)` e glow.
- Carrinho drawer expandido: grupo por evento com badge de combo, subtotal por evento, input de cupom, faixa upgrade-alert, total calculado, botão "Finalizar compra".

### Tela 03 — Lightbox Foto
- `.lb-like-big` substituído por `.lb-heart-pill` — retângulo pill `border-radius: 9999px`, número grande (24px bold) à esquerda + ícone coração (28px) à direita, posicionado `bottom-right` do `lb-main`.
- `.lb-fav-big` mantido circular em `bottom-left`.
- Tiers de resolução (Social/Web/Original) removidos do painel lateral.
- Preço simplificado: apenas `Preço · R$ 28,80` com `font-variant-numeric: tabular-nums`.
- Botões Compartilhar (azul `btn primary`, largura total) e Solicitar remoção (ghost, largura total) empilhados verticalmente.

### Tela 04 — Lightbox Vídeo
- Mesmo padrão `.lb-heart-pill` aplicado (número 82).
- Tiers de formato removidos; preço simplificado `R$ 49,90`.
- Botão Compartilhar com ícone share (azul, full-width) + Solicitar remoção (ghost, full-width) empilhados.

### Tela 05 — Cart Review
- Elementos canônicos verificados e presentes: badges de combo (-20%), upgrade-alert, cupom aplicado, subtotais por evento, total destacado, "Ir para o pagamento" com sheen. Sem grandes alterações — paridade mantida.

### Tela 06 — Checkout Desktop
- Card Entrega simplificado: título "Entrega digital", texto direto sobre disponibilidade na área do cliente e download ilimitado em alta resolução. Remoção de menção a RAW/JPEG/tier.
- Input de cupom adicionado no `order-summary` acima da linha Total, usando `.os-coupon-input`.
- Inputs mobile (Nome, CPF, WhatsApp) corrigidos com `type` correto e class `input`; CSS `.phone-screen .field input` garante bg dark, border token, color bone-white.

### Tela 07 — Confirmação
- Sem alterações (conforme instrução).

### Tela 08 — Minhas Compras Guest
- Layout completamente refeito. Removidas as sobreposições e `.thumbs-stack` quebrado.
- Nova estrutura: lista vertical com `gap: 16px`, cada `purchase-card` com `position: relative`.
- Header clicável (`<button aria-expanded>`) com chevron + ID + data + itens + valor + badge status.
- Pedido 1 expandido: detalhe com grid scrollável de 5 thumbnails (90px cada, `flex overflow-x: auto`), botão `↓` individual por item, botão "Baixar ZIP · todos os 5" full-width.
- Pedido 2 colapsado: PIX PENDENTE · 23H (laranja).
- Pedido 3 colapsado: PAGO (verde).
- Banner sessão guest mantido com estilo `.info-block`.

### Tela 10 — Contato
- Checkbox LGPD com custom visual: `<input>` opacity:0 + `<span class="checkbox-visual">` CSS puro.
- Estado `:checked` → bg `var(--brand-500)` + checkmark SVG via `::after`.
- Estado `:focus-visible` → `var(--focus-ring)`.
- Hover sutil com `border-color: var(--brand-400)`.

---

## Mobiles criados (6 de 7 prioritários)

| Tela | Label | Status |
|------|-------|--------|
| 02 | `Public · Event Gallery Mobile` | ✅ |
| 03 | `Public · Lightbox Foto Mobile` | ✅ |
| 04 | `Public · Lightbox Vídeo Mobile` | ✅ |
| 05 | `Public · Cart Review Mobile` | ✅ |
| 08 | `Public · Compras Guest Mobile` | ✅ |
| 10 | `Public · Contato Mobile` | ✅ |
| 07 | Confirmação Mobile | — (tela 07 sem alterações conforme instrução) |

---

## CSS adicionado

### `shared.css`
- `.lb-heart-pill` — pill de curtidas com número grande e ícone coração
- `.checkbox-visual` — custom checkbox CSS puro (checked + focus-visible + hover)
- `.phone-screen .field input` — fix inputs mobile checkout bg dark

### `publico.html` (estilos inline na `<style>`)
- `.combo-tiers` — grid 4 colunas de cards de desconto progressivo
- `.combo-tier-card` — card base com variantes `.active`, `.green`, `.blue`, `.neutral`

---

## Verificações finais

- [x] Botão WhatsApp tem `background: var(--tp-whatsapp)`
- [x] Tabs tela 02: "Fotos (1900)", "Vídeos (18)", "Comentários (32)"
- [x] Comentários expandidos no fim do photo-grid REMOVIDOS
- [x] `.combo-tiers` presente entre sponsors-strip e gallery-tabs
- [x] Heart pill com número visível em telas 03 e 04
- [x] Card Entrega tela 06 simplificado para digital
- [x] Tela 08 refeita sem sobreposições
- [x] 6 de 6 mobiles prioritários criados
- [x] Zero hex inline — tudo via `var(--token)`
- [x] `tabular-nums` em todos os valores R$
- [x] `aria-label` em botões icon-only
- [x] `aria-expanded` nos headers de cards expansíveis (tela 08)
- [x] Versão bumped para v1.0.10
