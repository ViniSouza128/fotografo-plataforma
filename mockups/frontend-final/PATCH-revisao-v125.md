# PATCH v1.0.25 — Revisão da v1.0.24 · 2026-05-12

Segunda rodada de auditoria sobre os mockups, focada em **pareamento desktop+mobile**, **imagens placeholder em cards**, e **completude do mobile vs desktop**. Corrige 30 issues encontradas na revisão das 38 telas adicionadas na v1.0.24.

## Mudanças por arquivo

### `publico.html` — 21 edits

**P1 — pareamento `.pair` canônico:**
- 9 wrappers `<div style="grid-template-columns: auto auto; ...">` substituídos por `<div class="pair">` (linhas 3846, 3937, 4079, 4215, 4353, 4455, 4547, 4611, 4696). Contagem `class="pair"` subiu de **2 → 11**.

**P1 — informações de suporte nos mobiles:**
- Pix Aguardando Mobile: adicionado `Pedido #VS-2026-04-182` em font-mono.
- Boleto Gerado Mobile: idem.
- Pagamento Recusado Mobile: adicionados `REF: tx_a1b2c3d4_5678` + `PEDIDO: #VS-2026-04-182` (críticos pra atendimento).
- 500 Erro Servidor Mobile: REF expandida com `PATH /evento/maratona-sao-paulo-2026`.

**P2 — hero em `Public · Evento Privado`:**
- Desktop (L.4458) e Mobile: cover com `picsum/seed/casamento-mh-privado` + título italic "Casamento Mariana & Henrique" + data + local. Antes a tela só tinha cadeado sem identificar o álbum.

**P2 — resumo financeiro completo nos mobiles de checkout:**
- Pix, Boleto, Recusado Mobile: bloco com Subtotal + Tier + Cupom antes do Total no sticky bottom.

**P2 — mini-thumbs no `.order-summary` desktop:**
- Pix, Boleto, Recusado desktops: faixa de 5 imagens 38×38 (seeds maratonasp01..05), igual ao Checkout original.

### `cliente.html` — 8 edits

**P1 — 2 mobile companions criados (`.phone` subiu de 19 → 21):**
- `Cliente · Downloads Expirando` mobile: banner amarelo de expiração + breadcrumb + título "Pedido #2147 · Maratona SP 2026" + lista de 6 fotos (DSC_0142..DSC_0405.jpg, seeds maratona01..06) com Baixar + aviso pós-expiração.
- `Cliente · Sessão Expirada` mobile: phone-screen blurred + banner topo amarelo + modal central com ícone relógio + botão "Fazer login" + "REDIRECIONANDO EM 3s…".

**P2 — `lucas@gmail.com` padronizado em 6 navs desktop:**
- Favoritos Vazio, Notificações Vazio, Detalhe Compra · Reembolso, Reconhecimento Pre-Consent, Comentários Vazio, Reconhecimento Sem Referências. Total no arquivo: **1 → 9** ocorrências.

### `admin.html` — 1 edit

**P2 — avatar Patrícia em Pedido com Reembolso:**
- Linha da tabela do pedido `#200000042` (L.4191): texto puro "Patrícia S. Almeida" virou bloco `flex + avatar 24×24 (?img=48) + nome + email`, padrão das outras tabelas admin.

## Validações

| Métrica | publico | cliente | admin |
|---|---:|---:|---:|
| `data-screen-label` (inalterado) | 45 ✓ | 21 ✓ | 36 ✓ |
| `class="pair"` | 2 → 11 ✓ | 21 (=) | 23 (=) |
| `class="phone"` | 19 (=) | 19 → 21 ✓ | 17 (=) |
| `data-screen-final-label` (admin) | — | — | 0 ✓ |
| `grid auto auto` wrappers | 0 ✓ | — | — |
| `lucas@gmail.com` (cliente) | — | 1 → 9 ✓ | — |
| Mojibake | 0 ✓ | 0 ✓ | 0 ✓ |

## Backup

`mockups/frontend-final/_backup-pre-v125-revisao/` — 5 arquivos (3 HTML + 2 MD) congelados antes do patch. Pode restaurar a v1.0.24 integralmente.

## P3 deferred (para v1.0.26+)

Itens registrados no AUDIT mas adiados:
- Carrossel "Álbuns recentes" em busca vazia.
- Avatar do usuário desativado em Conta Bloqueada.
- `nav-cart` em 4 telas client adicionais.
- Mobile dedicado para Pedido/Comentário no admin (layouts densos).
- Thumb do evento na Fila de Jobs.
- Hub `index.html` desatualizado.

## Relatório completo

Detalhes da auditoria (3 agents em paralelo · achados por arquivo · cross-reference) e validações finais estão em [AUDIT-cobertura-funcional-v124.md](AUDIT-cobertura-funcional-v124.md) — seção "2ª RODADA — v1.0.25".
