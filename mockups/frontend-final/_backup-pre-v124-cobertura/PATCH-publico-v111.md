# PATCH publico.html — v1.0.11
**Data:** 2026-05-11  
**Arquivo principal:** `publico.html` + `tokens.css` + `shared.css`

---

## Tela 01 — Home

- **`--tp-whatsapp`** trocado de `#25D366` para `#128C7E` (verde bandeira escuro oficial WhatsApp) em `tokens.css` §TP. Contraste forte com texto branco bone.
- **Mobile:** removido bloco `.stats` (142 Álbuns / 38k Fotos / < 48h). Substituído pelo padrão `.home-cta-row` com botões Ver álbuns + WhatsApp + Instagram, igual ao desktop.
- **Estilo `.ig-cta`** adicionado no `<style>` inline: gradiente `--tp-instagram-1 → 3 → 5`, texto branco.

## Tela 02 — Página do evento

- **Combo-tiers desktop:** layout trocado de `grid repeat(4, 1fr)` para `display: flex; justify-content: center` com cards `width: fit-content; min-width: 110px; padding: 14px var(--space-4)`. Grupo centralizado horizontalmente.
- **Fonte dos percentuais:** trocada de `font-display / weight 400` para `font-heading / weight 700`. Tier neutro: cor `--ink-700` (antes `--ink-300` — ilegível).
- **Tier ativo (−20%):** `font-size: 36px; font-weight: 900` via `.combo-tier-card.active .tier-pct`. Os outros 3 ficam em 26px/700.
- **Photo-grid:** adicionado `align-items: start` tanto no `<style>` inline do `.photo-grid` quanto em `shared.css`. Diagnóstico: grid sem `align-items: start` em contexto de `aspect-ratio` fixo faz os tracks de linha stretchar irregularmente causando gaps visuais. Fix: `align-items: start` força cada item a ocupar somente sua altura natural.
- **Tabs mobile funcionais:** adicionado `data-tabs` no container, `data-tab-target` em cada botão, `data-tab-pane` em cada painel. Painel Fotos: grid 2 colunas existente. Painel Vídeos: 6 video-cards mock 2 colunas. Painel Comentários: 6 comentários mock verticais com avatar, nome, timestamp, texto, like. JS existente em `app.js` (seção 3 — Tabs) já suporta o padrão — sem alteração necessária no JS.

## Tela 03 — Lightbox foto

- **"Solicitar remoção" desktop:** `class="btn"` → `class="btn danger"`.
- **"Solicitar remoção" mobile:** idem.
- **Botão comentários mobile:** adicionado `<button data-drawer-open="lbCommentsDrawer03">Comentários (32)</button>` + drawer `id="lbCommentsDrawer03"` com 4 comentários mock (avatar iniciais, nome, timestamp, texto, like). Drawer usa o padrão existente `.m-drawer` + `data-drawer-close`.

## Tela 04 — Lightbox vídeo

- **"Solicitar remoção" desktop e mobile:** `class="btn danger"` (replace_all cobriu as 3 restantes).
- **Botão comentários mobile:** análogo à tela 03 — `data-drawer-open="lbCommentsDrawer04"` + drawer com 4 comentários mock de vídeo.

## Tela 05 — Carrinho

- **Strike-through desktop:** item 001 (Bull-riding) agora mostra `was: R$ 28,80 / now: R$ 23,04`. Item VID-002 agora mostra `was: R$ 49,90 / now: R$ 39,92`. Items 004 (GRÁTIS) e 008 já tinham `.was`. Todas as fotos do álbum com −20% têm preço original riscado.
- **Mobile — detalhes completos:** adicionados acima do resumo sticky: header "Seu carrinho" + meta 5 fotos · 2 eventos, faixa upgrade, card Safra 2026 (4 itens com strike-through em todos), card Festival Pop Rural (1 item sem combo), campo cupom. O resumo sticky permanece no bottom.

## Tela 06 — Checkout

- **Ordem bloco QR corrigida:** antes era QR → texto. Agora: `<h3>` Escaneie o QR → `<p>` instrução 30s → `<div class="qr-pix">` 200px → bloco código copia-e-cola + Copiar + EXPIRA EM. QR levemente maior (180px → 200px).

## Tela 07 — Confirmação mobile

- **Criada do zero** (`data-screen-label="Public · Confirmation Mobile"`, num `07M`): ícone check verde + "Pagamento confirmado!", bloco detalhes do pedido (ID/data/valor/status), botão "Baixar tudo (ZIP)" full-width, grid 2 colunas de 5 cards individuais (thumb + ID + tamanho + botão Baixar), CTAs secundários ("Ver minhas compras", "Voltar à galeria"), bloco "Próximo passo" com CTA criar conta.

## Tela 10 — Contato mobile

- **Seção canais expandida:** substituído bloco compacto (só WA + e-mail) por seção completa com 5 itens: Instagram (`@viniciussouza.foto`, gradiente §TP), WhatsApp (`(64) 99999-0000`, `--tp-whatsapp`), E-mail (`contato@viniciussouza.foto`), Estúdio (`Rua das Aroeiras, 142 · Itajá · GO`), Atendimento (`Seg–Sex · 9h–18h · Sáb · 9h–13h`). Cada item: ícone circular 34px + label + valor. Dados espelhados da segunda coluna do desktop.

---

## Tokens / globals

- Zero hex inline — todos os valores usam `var(--token)`.
- `--tp-whatsapp` atualizado em `tokens.css`.
- `shared.css`: `align-items: start` adicionado em `.photo-grid`.
- Versão bumped para **v1.0.11** no comentário no topo do `publico.html`.

---

## Decisões / ambiguidades

| Ponto | Decisão |
|---|---|
| Cor tier neutro (`--ink-300` era quase invisível) | Trocado para `--ink-700` — legível sem sair do sistema |
| VID-002 no carrinho — desconto aplicável? | Sim, incluso no álbum Safra 2026 com −20%, logo `was/now` adicionado |
| Tela 07M — section num | `07M` (padrão estabelecido por `04M` e `10M`) |
| Drawer comentários telas 03/04 | Bottom-sheet via `.m-drawer` existente — sem novo componente |
| ig-cta no mobile | Estilos inline `style=` para manter consistência com o padrão dos outros botões mobile inline |
