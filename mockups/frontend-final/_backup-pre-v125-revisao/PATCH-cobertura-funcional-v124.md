# PATCH v1.0.24 — Cobertura funcional · 2026-05-12

Adiciona **38 telas novas** aos 3 mockups (`publico.html`, `cliente.html`, `admin.html`) para cobrir rotas e fluxos do produto real que não tinham representação visual, e corrige um atributo quebrado em `admin.html`.

## Mudanças por arquivo

### `publico.html` — 25 → 45 labels (+20 telas, +1070 linhas)

- 4 estados de checkout: `Public · Carrinho Vazio`, `Public · Checkout PIX Aguardando`, `Public · Checkout Boleto Gerado`, `Public · Checkout Pagamento Recusado` (todas com par mobile).
- 2 estados de galeria: `Public · Evento Sem Fotos` e `Public · Evento Privado` (com par mobile).
- 2 erros globais: `Public · 500 Erro Servidor` e `Public · Manutenção` (com par mobile).
- 1 estado de busca: `Public · Galeria Busca Sem Resultado` (com par mobile).
- 2 auxiliares só-desktop: `Public · Conta Bloqueada` e `Public · Cadastro Sucesso`.

### `cliente.html` — 12 → 21 labels (+9 telas, +1019 linhas)

- 4 empty states: `Cliente · Compras Vazio`, `Cliente · Favoritos Vazio`, `Cliente · Notificações Vazio`, `Cliente · Comentários Vazio`.
- 2 estados do detalhe de compra: `Cliente · Detalhe Compra · Reembolso` e `Cliente · Downloads Expirando`.
- 2 estados de reconhecimento: `Cliente · Reconhecimento Pre-Consent` e `Cliente · Reconhecimento Sem Referências`.
- 1 banner global: `Cliente · Sessão Expirada`.

### `admin.html` — 27 → 36 labels (+7 telas + 1 fix de atributo, +794 linhas)

- **FIX**: linha 2825 — atributo `data-screen-final-label` corrigido para `data-screen-label`. A tela `Admin · Configurações` voltou a ser visível em qualquer auditoria.
- 1 painel novo crítico: `Admin · Fila de Jobs` (worker de derivadas/poster/preview MP4 com tentativas/3 e mensagens reais como "ffmpeg timeout após 240s").
- 1 empty: `Admin · Evento Sem Fotos`.
- 2 estados de produção: `Admin · Dashboard Vazio` e `Admin · 403 Sem Permissão`.
- 2 rows expandidas: `Admin · Pedido com Reembolso` (timeline refund) e `Admin · Comentário em Moderação` (histórico + ações).
- 1 referência visual: `Admin · Toasts (referência)` (success/error/info/warning/undo — guia pro simulador funcional).

## Padrões respeitados

- Tokens apenas (`var(--ink-X)`, `var(--brand-X)`, `var(--signal-X)`, `var(--warning-X)`, `var(--font-*)`), nenhum hex inline.
- Classes existentes reaproveitadas (`.frame`, `.phone`, `.nav`, `.adm-topbar`, `.adm-side`, `.adm-main`, `.acc-side`, `.acc-main`, `.btn`, `.badge`, `.qr-pix`, etc).
- Avatares canonical: Vinícius `?img=12`, clientes `?img=33` e variações.
- Fotos `picsum.photos/seed/<tema>/W/H` com temas pt-BR (futebol, ciclismo, crossfit, casamento, surf, maratona).
- Status de pagamento byte-equal com `src/lib/commerceUtils.js` (`Pendente`, `Pago`, `Reembolsado`, `Reembolso solicitado`, `Simulacao/liberacao`).
- Conteúdo pt-BR realista (eventos, datas 2026-05-XX, valores, nomes de pessoas).
- Zero mojibake em todos os arquivos (grep verifica).

## Backup

`mockups/frontend-final/_backup-pre-v124-cobertura/` — 22 arquivos espelhados antes do patch. Pode ser restaurado para reverter integralmente.

## Próximos passos (não nesta versão)

- v1.0.25 cobre os P3 (filtros sem resultado, offline, empties P3, toolkits de skeleton/tooltip).
- O hub `index.html` (v0.2) ainda informa "~48 telas" — atualizar contagem na próxima.
- Mobiles unlabeled em `cliente.html` e `admin.html` (28 phones sem `data-screen-label`) — tagging pode ser feito como tarefa separada.

## Relatório completo

Detalhes do cross-reference (rotas src/ × telas mockup, fluxos × cobertura, componentes auxiliares), critério de priorização P1/P2/P3, decisões de borda registradas, e validações finais estão em [AUDIT-cobertura-funcional-v124.md](AUDIT-cobertura-funcional-v124.md).
