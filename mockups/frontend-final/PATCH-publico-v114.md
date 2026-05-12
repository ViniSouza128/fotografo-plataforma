# PATCH publico v1.0.14 — 2026-05-11

## 1. Photo-tile — investigação profunda e fix real

### HTML real dos tiles (Tela 02 desktop, linhas 1263–1287)

```html
<!-- tile normal -->
<div class="photo-tile">
  <img src="https://picsum.photos/seed/p002/600/400" alt=""/>
  <span class="id">002</span>
  <span class="price-tag">R$ 28,80</span>
  <button class="cart-btn" type="button" data-cart-bump>+</button>
</div>

<!-- tile .in-cart -->
<div class="photo-tile in-cart">
  <img src="https://picsum.photos/seed/p001/600/400" alt=""/>
  <span class="id">001</span>
  <span class="price-tag">R$ 28,80</span>
  <button class="cart-btn" type="button" data-cart-bump>✓</button>
</div>

<!-- tile free -->
<div class="photo-tile">
  <img src="https://picsum.photos/seed/p005/600/400" alt=""/>
  <span class="id">005</span>
  <span class="price-tag free">GRÁTIS</span>
  <button class="cart-btn" type="button" data-cart-bump>+</button>
</div>
```

Estrutura idêntica entre `.in-cart`, normal e free — nenhum `style=""` inline nos tiles.

### Causa raiz real

O CSS anterior tinha:

```css
.photo-tile { aspect-ratio: 3/2; … }
.photo-tile img { width: 100%; height: 100%; object-fit: cover; }
```

`height: 100%` em **flow normal** (sem `position: absolute`) cria um loop circular: o pai tenta ter altura pelo `aspect-ratio`, mas a altura da img depende da altura do pai. O browser resolve usando a **altura intrínseca da imagem** (picsum 600×400 = ratio 3:2), resultando em tiles com altura ditada pela img carregada, não pelo `aspect-ratio` declarado.

Adicionalmente, o `aspect-ratio` estava `3/2` (paisagem) quando o design pede `3/4` (portrait).

### Todas as regras que afetavam altura (antes do fix)

| Regra | Valor | Impacto |
|---|---|---|
| `.photo-tile { aspect-ratio }` | `3/2` | Ignorado — loop circular com img em flow |
| `.photo-tile { height }` | `auto` | Ok, mas sem efeito real |
| `.photo-tile img { height }` | `100%` | **Causa**: em flow, resolve para altura intrínseca |
| `.photo-grid { grid-auto-rows }` | `auto` | Ok — grid não é o culpado |

### Fix aplicado (shared.css)

```css
.photo-tile {
  aspect-ratio: 3/4;          /* portrait correto */
  min-height: 0; height: auto;
  position: relative; display: block;
}
.photo-tile img {
  position: absolute; inset: 0;   /* ÚNICO fix real */
  width: 100%; height: 100%;
  object-fit: cover;
}
```

Com `position: absolute`, a img sai do flow. O tile tem altura 100% definida pelo `aspect-ratio: 3/4` sem competição. Todos os tiles terão exatamente a mesma proporção independente da dimensão natural da imagem servida.

---

## 2. Tabs mobile — diagnóstico e fix

**Problema**: panes `mEvFotos`/`mEvVideos`/`mEvComentarios` tinham `style="display: grid"` ou `style="display: flex"` inline. O JS faz `p.hidden = true` para esconder panes inativos, mas o atributo `[hidden]` tem especificidade CSS menor que `style=""` inline — o pane não sumia.

**Fix** (shared.css):
```css
[data-tab-pane]:not(.active) { display: none !important; }
```

A regra com `!important` sobrescreve qualquer `display` inline. O JS já gerencia `.active` corretamente via `classList.toggle('active', match)`.

---

## 3. Drawer comentários (Telas 03 + 04 mobile) — diagnóstico e fix

**Problema**: `lbCommentsDrawer03` e `lbCommentsDrawer04` tinham `style="display: none"` inline. O CSS define:

```css
.m-drawer          { display: none; }   /* default */
.m-drawer.open     { display: flex; }   /* quando aberto */
```

Quando o JS adicionava `.open`, o `display: flex` da classe era sobrescrito pelo `display: none` inline (inline style > class style). O drawer nunca aparecia.

**Fix** (publico.html): removido `display: none` dos dois drawers. O CSS `.m-drawer { display: none }` já cobre o estado fechado sem precisar de inline.

---

## Resumo das alterações v1.0.14

| Arquivo | Mudança |
|---|---|
| `shared.css` | `.photo-tile` aspect-ratio `3/2 → 3/4`; img `position:absolute inset:0` |
| `shared.css` | `[data-tab-pane]:not(.active) { display:none !important }` |
| `publico.html` | Removido `display:none` inline de `#lbCommentsDrawer03` e `#lbCommentsDrawer04` |
| `publico.html` | Header bump para v1.0.14 |
