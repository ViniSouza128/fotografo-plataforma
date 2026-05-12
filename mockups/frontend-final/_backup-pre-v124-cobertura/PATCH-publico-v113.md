# PATCH-publico-v1.0.13
**Data:** 2026-05-11 · Quinta onda — bugs recorrentes

---

## 1. Photo-grid — diagnóstico final

### HTML real de um `.photo-tile` (Tela 02, linha ~1263)
```html
<div class="photo-tile in-cart">
  <img src="https://picsum.photos/seed/p001/600/400" alt=""/>
  <span class="id">001</span>
  <span class="price-tag">R$ 28,80</span>
  <button class="cart-btn" type="button" data-cart-bump>✓</button>
</div>
```
Estrutura correta: `img` direta + labels com `position: absolute`. Sem `figcaption` ou `<div class="meta">` no flow. Hipóteses (c) e (d) descartadas.

### Regras CSS conflitantes encontradas

**`shared.css` linha 926 — ANTES do patch:**
```css
.photo-grid {
  max-height: 560px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--ink-600) transparent;
  align-items: start;   /* inócuo: sem display declarado */
}
```
**Sem `display: grid`, sem `grid-auto-rows`, sem `grid-template-columns`.**
O `align-items: start` sozinho não faz nada em elemento sem modelo de grid/flex definido.

**`publico.html` `<style>` inline linha 191 — regra correta, mas isolada:**
```css
.photo-grid { padding: 18px 32px 36px; display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  grid-auto-rows: auto; gap: var(--space-12);
  align-items: start; align-content: start; … }
```

### Causa raiz identificada
O `display: grid` com `grid-auto-rows: auto` existia **apenas** no `<style>` inline da Tela 02 — não estava em `shared.css`. Qualquer contexto que carregue só o shared (preview isolado, DevTools sem o inline) renderiza `.photo-grid` como bloco normal, sem grid, fazendo tiles empilharem com alturas naturais inconsistentes entre colunas.

### Correção aplicada (`shared.css` linha 925)
```css
/* fix v1.0.13 */
.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  grid-auto-rows: auto;
  gap: var(--space-12);
  align-items: start;
  align-content: start;
  max-height: 560px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--ink-600) transparent;
}
```
`display: grid` + `grid-auto-rows: auto` agora vivem no shared como regra canônica. O inline da Tela 02 reforça sem conflito.

---

## 2. Telas 03 e 04 mobile — layout e comentários

### Estrutura final do `.phone-screen` (flex column)

**Antes:** mídia com `flex-shrink: 0` (altura fixa 280px/240px) + bottom sheet com `flex: 1` (crescia para preencher tudo — mídia comprimida, infos não ancoradas no fundo).

**Depois:**
- Div de mídia: `flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; min-height: 0` — ocupa espaço restante acima, centraliza foto/vídeo com `object-fit: contain`
- Bottom sheet: `flex-shrink: 0; max-height: 55%; overflow-y: auto` — sempre visível na base, scrollável se conteúdo exceder

Aplicado identicamente em Tela 03 (foto) e Tela 04 (vídeo).

### JS de comentários — status
O `app.js` usa delegação de evento global: `click → closest('[data-drawer-open]') → getElementById(id) → classList.add('open')`. Os botões têm `data-drawer-open="lbCommentsDrawer03"` e `data-drawer-open="lbCommentsDrawer04"` respectivamente. Os drawers têm `id` correspondentes e `display: none` inline — o CSS `.m-drawer.open { display: flex }` sobrescreve ao abrir. **Fluxo funcional — nenhuma alteração necessária no JS.**

---

## 3. Tela 05 mobile — cupom dentro do resumo

**Antes:** bloco `os-coupon-input` estava entre os cards de evento e o div de resumo (fora do resumo, no flow da lista de itens).

**Depois:** removido da posição externa; inserido dentro do `div` de resumo do pedido, após a linha de "cupom aplicado" (FOTO10) e **antes** da linha de Total — mesmo padrão visual do desktop: `input` dark com tokens `--ink-400 / --ink-600 / --font-mono`, botão `btn sm primary` "Aplicar" ao lado.

---

## Arquivos alterados
- `mockups/frontend-final/shared.css` — `.photo-grid` com `display: grid` canônico
- `mockups/frontend-final/publico.html` — v1.0.13; Telas 03M/04M layout invertido; Tela 05M cupom movido para resumo
