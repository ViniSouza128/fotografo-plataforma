# PATCH-publico-v112.md
**Versão:** v1.0.12 · **Data:** 2026-05-11 · **Onda:** Quarta

---

## 1. Diagnóstico técnico do photo-grid (causa raiz da sobreposição)

### O que estava causando

O bug de sobreposição vertical entre linhas tinha **duas causas combinadas**:

1. **`grid-auto-rows` ausente** — sem essa propriedade declarada, o CSS Grid calcula a altura de cada linha implícita com base no conteúdo de *todos* os itens daquela linha. Quando `aspect-ratio` é usado nos tiles mas o grid não tem `grid-auto-rows: auto`, o navegador em alguns contextos pode calcular uma altura de linha menor do que o necessário para acomodar o aspect-ratio real do tile após renderização, causando overflow visual dos tiles para a linha seguinte.

2. **`align-items` ausente ou herdado incorretamente** — sem `align-items: start` declarado *diretamente* no `.photo-grid` (e não apenas via regra separada em `shared.css` que podia ser sobrescrita), cada tile se esticava para preencher a linha inteira do grid (`align-items: stretch` é o padrão), o que em combinação com `aspect-ratio` criava tensão de layout que resultava em sobreposição visual em colunas adjacentes.

### O que foi alterado

**`publico.html` — regra `.photo-grid`:**
- Adicionado `grid-auto-rows: auto` — força cada linha a ter altura determinada pelo conteúdo real.
- Adicionado `align-content: start` — empilha linhas a partir do topo sem distribuição de espaço extra.
- `align-items: start` já estava presente, mantido.

**`shared.css` — regra `.photo-tile`:**
- Adicionado `width: 100%; height: auto` — garante que o tile ocupa o slot horizontal completo sem forçar altura fixa.
- Adicionado `align-self: start` — reforça no nível do item que ele não deve esticar verticalmente.

Os tiles **não tinham** `position: absolute` extra, `margin` negativa, `transform: translateY` ou `grid-row: span N` — o problema era puramente de configuração do grid container sem `grid-auto-rows`.

---

## 2. Resumo tela por tela

### Tela 01 — Home Mobile
- Botões WA e Instagram tornados **icon-only** no mobile (sem texto, apenas SVG).
- `.home-cta-row` no mobile: `flex-wrap: nowrap; gap: 8px`.
- "Ver álbuns" com `flex: 1` ocupa o espaço restante.
- WA e IG com `min-width: 44px; min-height: 44px; flex-shrink: 0` — touch-target adequado.
- Os 3 botões cabem em uma linha sem quebra em 390px.

### Tela 02 — Página do evento

#### Combo-tiers
- `.combo-tier-card .tier-pct`: `font-weight: 700 → 500` (inativo).
- `.combo-tier-card.active .tier-pct`: `font-weight: 900 → 600` (ativo) — impactante mas elegante.

#### Photo-grid sobreposição
- Ver seção 1 acima — causa raiz identificada e corrigida.

#### Photo-tiles mobile = desktop
- Painel `data-tab-pane="mEvFotos"` agora usa `.photo-tile` puro sem `style="border-radius: var(--radius)"` inline redundante.
- Grid do painel: `grid-auto-rows: auto; align-items: start` adicionados.
- Botões `.cart-btn` com `data-cart-bump` para consistência com desktop.

#### Tabs mobile
- Já estavam funcionais via `data-tabs` / `data-tab-target` / `data-tab-pane` desde v1.0.11. Mantido.

### Telas 03 e 04 — Lightboxes

#### Desktop
- **Tela 03 (foto):** botão "Solicitar remoção" já estava com `class="btn danger"` desde v1.0.11. Mantido.
- **Tela 04 (vídeo):** botão "Solicitar remoção" estava com `class="btn"` simples — corrigido para `class="btn danger"`.

#### Mobile — drawers de comentários (Telas 03 + 04)
- Estrutura refatorada: `display: flex; flex-direction: column; top: 20%` — ocupa ~80% da tela a partir de 20% do topo.
- Header fixo com título "Comentários (N)" + botão fechar `position: static`.
- Lista de comentários com `flex: 1; overflow-y: auto` — scroll interno.
- Cada comentário: avatar circular, nome em negrito, timestamp mono cinza, texto, ações (♥ N · Responder) em linha.
- **Input de novo comentário** ancorado no bottom do drawer: `textarea` + botão "Enviar".

### Tela 05 — Carrinho Mobile
- Adicionado bloco **"Resumo do pedido"** completo após os cards de itens e cupom:
  - Header "Resumo do pedido"
  - Linhas por evento com subtotal (tabular-nums)
  - Linha combo desconto (verde)
  - Taxa Pix R$ 0,00 (verde)
  - Cupom aplicado com badge de código
  - Linha Total destacada (`font-display` 26px, verde)
  - Botão "Finalizar compra" full-width verde com sheen
  - Botão "Continuar comprando" ghost full-width
  - Mensagem de economia + "Gateway certificado PCI-DSS" em mono pequeno
- Sticky-bottom compacto mantido como confirmação visual rápida ao scrollar.

### Tela 13 — Erro 404 Mobile
- Criado layout mobile completo com `data-screen-label="Public · 404 Mobile"`.
- Logo VS compacto no `m-nav` superior.
- Conteúdo centralizado verticalmente: código `404` em `font-display` italic 96px (`var(--ink-600)`), título, parágrafo explicativo, botões "Voltar à home" (primary) e "Ver todos os álbuns" (ghost) em coluna full-width.
- Rodapé `m-foot` com copyright + links Termos · Privacidade · Autenticidade.

---

## Regras globais verificadas
- Zero hex inline — todos os valores usam `var(--token)`.
- `font-variant-numeric: tabular-nums` em todos os valores monetários novos.
- Focus-ring herdado via `.btn` e `.os-cta` existentes.
- Versão bumped para **v1.0.12** no comentário do `<head>`.
