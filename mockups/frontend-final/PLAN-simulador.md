# PLAN — simulador.html (v0.4 · 2026-05-12)

**Objetivo:** SPA single-file que se comporta como o produto real (não revisão lado-a-lado). 139 telas dos 3 mockups consolidadas em 83 rotas com hash routing, state simulado (cart/role/lightbox/viewport), barra de testador no topo.

## Build

```bash
cd mockups/frontend-final
node build-simulador.js   # gera simulador.html
node audit-simulador.js   # verifica mojibakes, sections vazias, links, etc.
```

Re-rodar sempre que os 3 mockups originais mudarem.

## Contagens reais (2026-05-12 v0.4)

- **45 telas com `data-screen-label`** no `publico.html` (28 desktop + 17 mobile com label)
- **21 telas com label** no `cliente.html` (21 desktop) + **21 mobiles SEM label** (descobertos via parser)
- **35 telas com label** no `admin.html` (35 desktop) + **17 mobiles SEM label** + 1 descartado (Toasts referência)
- **139 telas extraídas total** (84 desktop + 55 mobile = 84 + 21 + 17 + 17 phones inheridos)
- **83 rotas únicas**: 28 público + 21 cliente + 34 admin
- **56 rotas com par desktop+mobile** · **27 só desktop** · **0 só mobile**
- **1 descartada**: `Admin · Toasts (referência)`

## Como o build funciona

1. **extractScreens()**: parser balanced-tag (sem deps) que pega:
   - todo `<div ... data-screen-label="..." class="...frame|phone...">`
   - todo `<div class="phone">` SEM data-screen-label
2. Os phones unlabel-ados **herdam o label do último frame label antes** (por offset no arquivo). Isso encontra mobiles que nunca foram rotulados em cliente/admin.
3. **lookupRoute(label)**: tenta match exato no `routeMap`, fallback strip de sufixo " Mobile" se houver.
4. Pra cada rota:
   - `frame` → slot `desktop`
   - `phone` → slot `mobile`
   - Primeiro ganha. Se 3 frames consecutivos têm 1 phone depois (caso "Detalhe Evento" com 3 tabs), o phone vai pro PRIMEIRO frame (que é a rota mais natural).
5. Gera HTML com sections empilhadas, hidden por padrão. Router hash-based mostra a section ativa.

## Viewport switcher (v0.4 novo)

- 3 botões na topbar: `Auto` · `🖥` (force desktop) · `📱` (force mobile)
- Atalhos: `m` alterna mobile/auto, `d` alterna desktop/auto
- Aplica classe `sim-force-desktop` ou `sim-force-mobile` em `<html>`
- CSS sobrepõe os `@media` defaults
- Em force-mobile no desktop: section vira 410px centralizada com phone shell visual (border-radius, shadow)
- Em rotas que só têm desktop e user força mobile: aparece banner "Esta tela ainda não tem versão mobile dedicada"
- State persiste em localStorage

## Don't-touch

- Não editar `simulador.html` manualmente — sempre regenerar via build
- Não modificar os 3 mockups (publico/cliente/admin) sem que o build acompanhe
- O build NÃO inclui referência aos arquivos `legacy-*.html`
- Os scripts `build-simulador.js` e `audit-simulador.js` ficam no projeto principal (NÃO no repo GH Pages)
