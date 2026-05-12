# PATCH-cross-pages-v119.md
**Data:** 2026-05-11  
**Versão:** v1.0.19  
**Arquivos modificados:** `admin.html`, `cliente.html`

---

## Pendência 1 — admin.html: `.adm-photo-grid` → photo-tile canonical

**Itens migrados:** 18 tiles desktop + 12 tiles mobile = 30 tiles totais  
**CSS removido:** ~18 linhas (`.adm-photo-grid`, `.adm-photo`, `.adm-photo.selected`, `.adm-photo .ph`, `.adm-photo .check`, `.adm-photo .id`, `.adm-photo .pricetag`, `.m-adm-photo-grid`, `.m-adm-photo` e variantes) → ~7 linhas novas  
**Wrapper:** `.adm-photo-grid` → `.photo-grid.is-admin` com `minmax(100px, 1fr)` (densidade admin).  
**Decisões contextuais:**
- O botão `cart` foi substituído por `photo-tile__check` (checkbox de seleção bulk) no canto superior direito — pois no contexto admin a ação relevante é seleção em massa, não adicionar ao carrinho.
- `.selected` foi migrado para `.is-admin-sel` para não colidir com `.in-cart` do canonical.
- A tile GRÁTIS usa `.is-free` corretamente.
- `aspect-ratio` original era `3/2`; o canonical usa `1/1` (square) conforme especificado — mantido sem desvio.

---

## Pendência 2 — admin.html: `.adm-video` → photo-tile.is-video

**Itens migrados:** 6 tiles desktop + 4 tiles mobile = 10 tiles totais  
**CSS removido:** ~9 linhas (`.adm-video`, `.adm-video .thumb`, `.adm-video .thumb .play`, `.adm-video .thumb .dur`, `.adm-video .body`, `.adm-video h4`, `.adm-video .meta`, versões mobile) → ~8 linhas novas  
**Decisões contextuais:**
- O título e metadados do vídeo (título, resolução 4K) eram parte do `.adm-video .body`. Como `photo-tile` é square sem espaço para body, foram colocados como `.photo-tile__admin-title` e `.photo-tile__admin-meta` fora da tile, em `.photo-tile-wrap` (wrapper flexbox coluna).
- O botão cart foi omitido — no admin não faz sentido adicionar ao carrinho; a ação é abrir modal de edição (mantido via `data-modal-open="videoAdminModal"`).
- O wrapper externo `display: grid; 4 colunas` foi preservado (não é substituído por `.photo-grid` para manter a densidade 4-col específica do admin, diferente das fotos).

---

## Pendência 3 — admin.html: status "LIBERADO"

**Contexto verificado:** A string `LIBERADO` aparecia na coluna **Status** da tabela de pedidos, na linha com forma de pagamento `"Liberação manual"` e valor `R$ 0,00`.  
**Decisão:** Esse é um status de *pagamento* (pedido criado sem cobrança via liberação manual admin), não status de download. A string canônica mais adequada é **"Simulacao/liberacao"** (corresponde a pedido gratuito/manual liberado pelo admin, sem simulação de pagamento real).  
**Mudanças:** 1 ocorrência alterada: `LIBERADO` → `Simulacao/liberacao` (dentro de `<span class="badge b-paid">`).

---

## Pendência 4 — admin.html: status comentários caps-lock

**Auditoria realizada:** Nenhuma string `PUBLICADO` ou `EM MODERAÇÃO` em caps-lock foi encontrada na seção de moderação de comentários de `admin.html`.  
**Resultado:** O sistema de moderação usa botões de ação ("Aprovar", "Ocultar", "Remover") em vez de badges de status por comentário. As tabs/chips usam "Pendentes · 5", "Aprovados · 142", etc. com capitalização já correta (primeira maiúscula).  
**Mudanças:** Nenhuma — pendência já estava em conformidade.

---

## Pendência 5 — cliente.html: `.fav-grid` → photo-tile canonical

**Itens migrados:** 10 tiles desktop + 6 tiles mobile = 16 tiles totais  
**CSS removido:** ~7 linhas (`.fav-grid`, `.fav`, `.fav .ph`, `.fav .id`, `.fav .heart`, `.m-fav-grid`, `.m-fav`, `.m-fav .heart`, `.m-fav .ph`) → ~8 linhas novas  
**Wrapper:** `.fav-grid` → `.photo-grid.is-favorite` com `repeat(5, 1fr)` desktop / `repeat(3, 1fr)` mobile.  
**Decisões contextuais:**
- O botão de coração (remover favorito) foi migrado para `.photo-tile__fav` no canto inferior direito (substituindo `.photo-tile__cart`), pois neste contexto o CTA principal é "remover dos favoritos", não "adicionar ao carrinho".
- Não foi adicionado modifier `.is-favorite` na tile individual — apenas no wrapper grid — pois não há badge adicional necessário.
- `aspect-ratio` original era `3/2`; migrado para `1/1` conforme canonical.
- Preços `R$ 28,80` foram adicionados às tiles (não constavam no original desktop — o `.fav` não mostrava preço). Decisão: incluir `photo-tile__price` pois é parte da estrutura canonical e o contexto de favoritos no app real incluiria o preço.

---

## Resumo de CSS removido (totais)

| Arquivo | Classes removidas | Linhas CSS removidas |
|---|---|---|
| admin.html | `.adm-photo-grid`, `.adm-photo` e 7 sub-regras, `.adm-video` e 6 sub-regras, versões mobile correspondentes | ~27 linhas |
| cliente.html | `.fav-grid`, `.fav` e 3 sub-regras, `.m-fav-grid`, `.m-fav`, `.m-fav .heart`, `.m-fav .ph` | ~9 linhas |

## Classes canônicas adicionadas

- `.photo-grid.is-admin` — grid 100px para densidade admin
- `.photo-tile__check` — checkbox de seleção bulk (admin-specific)
- `.photo-tile.is-admin-sel` — estado selecionado admin
- `.photo-tile__admin-title`, `.photo-tile__admin-meta` — metadados de vídeo fora da tile
- `.photo-tile__fav` — botão de remover favorito (cliente-specific)
- `.photo-grid.is-favorite` — grid 5-col favoritos
