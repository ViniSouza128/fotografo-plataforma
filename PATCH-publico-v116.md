# PATCH-publico-v116.md

## Dados ANTES (3 tiles — Public · Event Gallery desktop)

```json
[
  {"tw":201,"th":201,"fit":"contain","cartw":36,"carth":36,"cartPad":"1px 6px","square":true},
  {"tw":201,"th":201,"fit":"contain","cartw":36,"carth":36,"cartPad":"1px 6px","square":true},
  {"tw":201,"th":201,"fit":"contain","cartw":36,"carth":36,"cartPad":"1px 6px","square":true}
]
```

Tiles já eram quadrados e fit:contain funcionava. Único desvio: `padding: 1px 6px` no botão cart (vindo do user-agent stylesheet do browser, sem `padding: 0 !important` para sobrescrever).

## Conflitos CSS identificados

- `shared.css:583` — `.photo-tile__cart` sem `!important` nas dimensões e sem `padding: 0 !important`, permitindo que o UA stylesheet do browser injetasse `padding: 1px 6px`.
- `shared.css:537` — `.photo-tile__media img` sem `max-width: none; max-height: none` (defensivo contra resets globais).
- `shared.css:511` — Faltavam `width: 100%; height: auto; display: block` no `.photo-tile` (defensivo).
- `shared.css:612` — `.photo-tile.in-cart .photo-tile__cart::after` usava `position: absolute; inset: 0; display: flex` em vez do simples `line-height: 1` — mais frágil.
- CSS v1.0.15 em `shared.css:1006` era apenas `.photo-grid` (grid layout), sem conflito direto com `.photo-tile`.

## Fix aplicado

Substituído o bloco `/* §X · Photo tile — canonical v1.0.16 */` em `shared.css` (linhas 511–623) pelo bloco canônico completo especificado:

- `width: 36px !important; height: 36px !important; min/max-width/height: 36px !important; padding: 0 !important` no `.photo-tile__cart`
- Seletor duplo `.photo-tile__media img, .photo-tile img` com `max-width: none; max-height: none`
- `.photo-tile` recebeu `width: 100%; height: auto; display: block`
- `::after` do check simplificado para `font-size: 18px; font-weight: 700; line-height: 1`
- `.photo-tile__cart svg` com `width: 18px; height: 18px; flex-shrink: 0`
- `__id` e `__price` unificados em regra base + overrides individuais

Arquivo modificado: `H:\Programas\projeto-fotografo\mockups\frontend-final\shared.css`

## Dados DEPOIS (3 tiles — desktop 1280×800)

```json
[
  {"tw":201,"th":201,"fit":"contain","cartw":36,"carth":36,"cartPad":"0px","square":true},
  {"tw":201,"th":201,"fit":"contain","cartw":36,"carth":36,"cartPad":"0px","square":true},
  {"tw":201,"th":201,"fit":"contain","cartw":36,"carth":36,"cartPad":"0px","square":true}
]
```

## Dados DEPOIS (3 tiles — mobile 390×800)

```json
[
  {"tw":170,"th":170,"fit":"contain","cartw":36,"carth":36,"square":true},
  {"tw":170,"th":170,"fit":"contain","cartw":36,"carth":36,"square":true},
  {"tw":170,"th":170,"fit":"contain","cartw":36,"carth":36,"square":true}
]
```

## Verificação

| Spec | Desktop | Mobile |
|------|---------|--------|
| tile.w === tile.h (quadrado) | 201 === 201 ✓ | 170 === 170 ✓ |
| cart 36×36 | 36×36 ✓ | 36×36 ✓ |
| cart padding: 0 | 0px ✓ | 0px ✓ |
| object-fit: contain | contain ✓ | contain ✓ |

## Iterações: 1
