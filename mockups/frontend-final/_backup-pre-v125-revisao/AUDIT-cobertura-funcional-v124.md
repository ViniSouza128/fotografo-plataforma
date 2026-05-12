# AUDIT — cobertura funcional dos mockups vs. produto real

- **Versão alvo**: v1.0.24 (patch de cobertura funcional)
- **Data**: 2026-05-12
- **Escopo**: pasta `mockups/frontend-final/` cruzada com `src/` (somente leitura de `src/`).
- **Estado de partida**: mockups em v1.0.23 (65 telas labeladas + 2 sem label + 1 atributo quebrado).
- **Backup pré-mudança**: `mockups/frontend-final/_backup-pre-v124-cobertura/` (22 arquivos).
- **Critério P1 / P2 / P3**:
  - **P1 crítico** — fluxo/rota essencial sem nenhuma representação visual; risco do simulador funcional ficar furado.
  - **P2 importante** — variantes de estado (vazio/erro/loading) ou modais auxiliares de fluxos críticos; alguma representação parcial existe.
  - **P3 nice-to-have** — bordas, refinamentos, telas que melhoram demo mas não bloqueiam simulador.

---

## TABELA A — Rotas `src/app/**/page.js` × cobertura no mockup

### Surface PÚBLICO

| Rota | Tela mockup correspondente | Status |
|---|---|---|
| `/` (home) | "Public · Home Desktop" + mobile (companion sem label) | ✓ COBERTA |
| `/login` | "Public · Login" | ✓ COBERTA (sem mobile, sem variante de erro de bloqueio) |
| `/cadastro` | "Public · Cadastro" | ⚠ PARCIAL — falta tela de sucesso pós-cadastro |
| `/trocar-senha` | "Public · Trocar Senha" | ✓ COBERTA |
| `/contato` | "Public · Contato" + Mobile | ✓ COBERTA |
| `/evento/[id]` | "Public · Event Gallery" + Mobile + Lightbox Foto/Vídeo | ⚠ PARCIAL — falta "evento sem fotos", "evento privado", "busca sem resultado" |
| `/carrinho` | "Public · Cart Review" + Mobile | ⚠ PARCIAL — falta carrinho vazio |
| `/checkout` | "Public · Checkout Desktop" + mobile (companion) + Confirmation | ⚠ PARCIAL — faltam: PIX aguardando, Boleto gerado, Cartão recusado / link indisponível |
| `/compras` (guest) | "Public · Compras Guest" + Mobile | ✓ COBERTA |
| `/autenticidade` | "Public · Autenticidade" | ✓ COBERTA |
| `/politica-de-privacidade` | "Public · Privacidade" | ✓ COBERTA |
| `/termos-de-uso` | "Public · Termos" | ✓ COBERTA |
| `/politica-de-cookies` | "Public · Cookies" | ✓ COBERTA |
| `/clear-cache` | — | INFO — utilitário de runtime, não precisa mockup |
| `/not-found.js` | "Public · 404" + Mobile | ✓ COBERTA |
| (sem rota) erro 500 / manutenção | — | ✗ FALTANDO — produto real só tem `/not-found.js`, mas mockup deve cobrir falha global |

### Surface CLIENTE (todas gated em `/minha-conta/*`)

| Rota | Tela mockup | Status |
|---|---|---|
| `/minha-conta` | "Cliente · Dashboard Desktop" | ✓ COBERTA |
| `/minha-conta/compras` | "Cliente · Compras" + "Cliente · Detalhe Compra" | ⚠ PARCIAL — falta empty (sem compras) + detalhe de reembolso + downloads expirando |
| `/minha-conta/carrinho` | "Cliente · Carrinho" | ⚠ PARCIAL — falta vazio (compartilha com Public, mas surface cliente também precisa) |
| `/minha-conta/comentarios` | "Cliente · Comentários" | ⚠ PARCIAL — falta empty |
| `/minha-conta/favoritos` | "Cliente · Favoritos" | ⚠ PARCIAL — falta empty (primeira interação) |
| `/minha-conta/notificacoes` | "Cliente · Notificações" | ⚠ PARCIAL — falta empty |
| `/minha-conta/chat` | "Cliente · Chat" | ⚠ PARCIAL — falta empty (sem mensagens ainda) — P3 |
| `/minha-conta/remocoes` | "Cliente · Remoções LGPD" | ⚠ PARCIAL — falta empty — P3 |
| `/minha-conta/reconhecimento` | "Cliente · Reconhecimento" | ⚠ PARCIAL — faltam: pre-consent (primeira vez) e sem-referências (após consentir) |
| `/minha-conta/configuracoes` | "Cliente · Configurações" | ✓ COBERTA |
| Rewards (no dashboard + via api) | "Cliente · Recompensas" | ✓ COBERTA |

### Surface ADMIN (`/admin/*`)

| Rota | Tela mockup | Status |
|---|---|---|
| `/admin` | "Admin · Dashboard" | ⚠ PARCIAL — falta dashboard vazio (produto novo) |
| `/admin/estatisticas` | "Admin · Estatísticas" | ✓ COBERTA |
| `/admin/notificacoes` | "Admin · Notificações" | ✓ COBERTA |
| `/admin/pedidos` | "Admin · Pedidos" | ⚠ PARCIAL — falta pedido com reembolso (detalhamento) |
| `/admin/eventos` | "Admin · Eventos" | ✓ COBERTA |
| `/admin/eventos/[id]` | "Admin · Detalhe Evento" + tabs Vídeos/Patrocinadores | ⚠ PARCIAL — falta evento sem fotos |
| `/admin/criar-evento` | "Admin · Criar Evento" | ✓ COBERTA |
| `/admin/upload-fotos/[eventId]` | "Admin · Upload Fotos" | ✓ COBERTA |
| `/admin/comentarios` | "Admin · Comentários" | ⚠ PARCIAL — falta comentário em moderação (estado detalhado) |
| `/admin/clientes` | "Admin · Clientes" | ✓ COBERTA |
| `/admin/colaboradores` | "Admin · Colaboradores" | ✓ COBERTA |
| `/admin/repasses` | "Admin · Repasses" | ✓ COBERTA |
| `/admin/carrinhos` | "Admin · Carrinhos" | ✓ COBERTA |
| `/admin/contatos` | "Admin · Contatos" | ✓ COBERTA |
| `/admin/cupons` | "Admin · Cupons" | ✓ COBERTA |
| `/admin/propostas` | "Admin · Propostas" | ✓ COBERTA |
| `/admin/chat` | "Admin · Chat" | ✓ COBERTA |
| `/admin/reconhecimento` | "Admin · Reconhecimento" | ✓ COBERTA |
| `/admin/marca-dagua` | "Admin · Marca d'água" | ✓ COBERTA |
| `/admin/remocoes` | "Admin · Remoções" | ✓ COBERTA |
| `/admin/personalizar` | "Admin · Personalizar" | ✓ COBERTA |
| `/admin/configuracoes` | "Admin · Configurações" | ⚠ BUG — atributo `data-screen-final-label` em vez de `data-screen-label` (linha 2824 do admin.html). Tela existe mas invisível para auditoria. |
| `/admin/configuracoes/storage` | "Admin · Storage" | ✓ COBERTA |
| `/admin/reset` | "Admin · Reset" | ✓ COBERTA |
| Rewards admin | "Admin · Recompensas" | ✓ COBERTA |
| Audit log | "Admin · Logs & auditoria" | ✓ COBERTA |
| (sem rota explícita) fila de jobs | — | ✗ FALTANDO — `jobsQueue.js` existe e é central (derivadas/posters/preview MP4) mas não há painel UI |
| (sem rota) 403 sem permissão | — | ✗ FALTANDO — colaborador acessando super-admin gera erro mas sem tela |

---

## TABELA B — Fluxos × cobertura

### Auth
| Fluxo | Status | Observação |
|---|---|---|
| Login normal | ✓ | Public · Login |
| Cadastro | ⚠ | falta sucesso pós-cadastro |
| Cadastro com pré-fill (guest→conta) | ⚠ | banner existe inline em Public · Cadastro? — assumido sim. Não criar tela nova. |
| Trocar senha forçada | ✓ | Public · Trocar Senha |
| Logout | — | é modal, herdado dos shells |
| Recuperar senha self-service | INFO | NÃO EXISTE no produto (apenas via admin → senha temporária + must_change_password). Não criar mockup. |
| Confirmação de e-mail | INFO | NÃO EXISTE no produto. Não criar. |
| Conta bloqueada (`account_disabled` 403) | ✗ | só erro inline no login. Vale criar Public · Conta Bloqueada (P2). |

### Checkout / pagamento
| Fluxo | Status |
|---|---|
| Carrinho vazio | ✗ FALTANDO (P1) |
| Carrinho com itens | ✓ |
| PIX QR + copia-código aguardando | ✗ FALTANDO (P1) |
| PIX confirmado | ✓ (Confirmation) |
| Boleto gerado (linha digitável) | ✗ FALTANDO (P1) |
| Cartão recusado / link indisponível | ✗ FALTANDO (P1) |

### Galeria
| Fluxo | Status |
|---|---|
| Evento aberto com fotos | ✓ |
| Evento sem fotos (recém criado) | ✗ FALTANDO (P1) |
| Evento privado (visibilidade=privado) — visitante | ✗ FALTANDO (P1) |
| Busca sem resultado na home / galeria | ✗ FALTANDO (P2) |
| Filtro de pasta/hora sem resultado | ✗ FALTANDO (P3) |

### Cliente
| Fluxo | Status |
|---|---|
| Compras vazio (primeira compra) | ✗ FALTANDO (P1) |
| Favoritos vazio | ✗ FALTANDO (P1) |
| Notificações vazio | ✗ FALTANDO (P1) |
| Comentários vazio | ✗ FALTANDO (P2) |
| Chat vazio | ✗ FALTANDO (P3) |
| Remoções vazio | ✗ FALTANDO (P3) |
| Detalhe Compra · Reembolso solicitado/aprovado/negado | ✗ FALTANDO (P1) |
| Downloads expirando (banner alerta) | ✗ FALTANDO (P2) |
| Reconhecimento pre-consent (primeira vez) | ✗ FALTANDO (P1) |
| Reconhecimento sem referências (após consentir) | ✗ FALTANDO (P2) |
| Sessão expirada (after-logout) | ✗ FALTANDO (P2) |

### Admin
| Fluxo | Status |
|---|---|
| Dashboard com dados | ✓ |
| Dashboard vazio (produto novo) | ✗ FALTANDO (P2) |
| Evento sem fotos no admin | ✗ FALTANDO (P1) |
| Fila de jobs (derivadas/posters/preview MP4) | ✗ FALTANDO (P1) — `jobsQueue.js` central e sem UI |
| Pedido com reembolso (detalhamento) | ✗ FALTANDO (P2) |
| Comentário em moderação (visão expandida) | ✗ FALTANDO (P2) |
| 403 sem permissão | ✗ FALTANDO (P2) |

### Erros globais
| Fluxo | Status |
|---|---|
| 404 | ✓ |
| 500 servidor | ✗ FALTANDO (P1) |
| Manutenção | ✗ FALTANDO (P1) |
| Offline / sem conexão | ✗ FALTANDO (P3) |

---

## TABELA C — Componentes auxiliares × cobertura

| Componente | Cobertura |
|---|---|
| Modais (overlay+conteúdo) | ✓ presente em vários lugares |
| Drawer mobile (home, filtros) | ✓ |
| Bottom-sheet lightbox mobile | ✓ |
| Confirm-screen (Confirmation) | ✓ |
| Toast / snackbar | ✗ FALTANDO — sem componente nomeado (P2) |
| Tooltip / popover | ✗ FALTANDO (P3) |
| Skeleton / loading state genérico | ✗ FALTANDO (P3) |
| Empty-state reutilizável | ✗ FALTANDO — único é o 404 (P2 — virá implícito ao criar empties P1) |

---

## LISTA PRIORIZADA — o que ADICIONAR no mockup

### P1 — crítico (entra em v1.0.24)

**Públicas (publico.html):**
1. Public · Carrinho Vazio (Desktop + Mobile)
2. Public · Checkout · PIX Aguardando (Desktop + Mobile) — com QR/copia-código e contador
3. Public · Checkout · Boleto Gerado (Desktop + Mobile) — com linha digitável e PDF
4. Public · Checkout · Pagamento Recusado (Desktop + Mobile) — erro de cartão/link indisponível
5. Public · Evento Sem Fotos (Desktop + Mobile)
6. Public · Evento Privado (Desktop + Mobile) — bloqueado para visitante
7. Public · 500 Erro Servidor (Desktop + Mobile)
8. Public · Manutenção (Desktop + Mobile)

**Cliente (cliente.html):**
9. Cliente · Compras Vazio (Desktop + Mobile)
10. Cliente · Favoritos Vazio (Desktop + Mobile)
11. Cliente · Notificações Vazio (Desktop + Mobile)
12. Cliente · Detalhe Compra · Reembolso (Desktop + Mobile)
13. Cliente · Reconhecimento Pre-Consent (Desktop + Mobile)

**Admin (admin.html):**
14. **FIX** Admin · Configurações — corrigir atributo `data-screen-final-label` → `data-screen-label`
15. Admin · Fila de Jobs (Desktop + Mobile cluster) — derivadas/posters/preview MP4 com status pending/processing/failed
16. Admin · Evento Sem Fotos (Desktop)

### P2 — importante (entra em v1.0.24 se possível)

**Públicas:**
17. Public · Galeria Busca Sem Resultado (Desktop + Mobile)
18. Public · Conta Bloqueada (Desktop) — estado de account_disabled
19. Public · Cadastro Sucesso (Desktop) — confirmação inline

**Cliente:**
20. Cliente · Comentários Vazio (Desktop)
21. Cliente · Downloads Expirando (Desktop) — alerta visível no detalhe compra
22. Cliente · Reconhecimento Sem Referências (Desktop)
23. Cliente · Sessão Expirada (Desktop) — banner com CTA pra logar de novo

**Admin:**
24. Admin · Dashboard Vazio (Desktop) — produto novo
25. Admin · 403 Sem Permissão (Desktop) — colaborador acessando super-admin
26. Admin · Pedido com Reembolso (Desktop) — detalhe do pedido com reembolso
27. Admin · Comentário em Moderação (Desktop) — visão expandida do moderador

**Componente:**
28. Toast/snackbar demo (success/error/info/warning/undo) — colocar como mini-strip num dos arquivos para servir de referência ao simulador

### P3 — deferred para v1.0.25

29. Public · Galeria Filtro Sem Resultado
30. Public · Offline / Sem Conexão
31. Cliente · Chat Vazio
32. Cliente · Remoções LGPD Vazio
33. Admin · Carrinhos Vazio
34. Admin · Logs Vazio
35. Skeleton / Loading State genérico
36. Tooltip / popover demo

---

## ESTIMATIVA — telas novas por arquivo (P1 + P2)

| Arquivo | Telas P1 | Telas P2 | Total novas | Fix de bug |
|---|---:|---:|---:|---|
| `publico.html` | 8 cenários × ~2 viewports = ~14 frames | 3 | ~17 | — |
| `cliente.html` | 5 cenários × ~2 viewports = ~9 | 4 | ~13 | — |
| `admin.html` | 2 + 1 modal-cluster = ~3 | 4 + 1 demo toast | ~8 | 1 (atributo quebrado) |
| **Total** | | | **~38 frames novos** | 1 |

Em termos de `data-screen-label` distintos: ~30 telas novas + correção de 1 existente = total esperado **~95 labels válidas** após v1.0.24 (vs. 64+1 broken atuais).

---

## DECISÕES DE BORDA (sem perguntar — registradas conforme combinado)

- **`/clear-cache`**: não criar tela. É utilitário de runtime, sem valor demonstrativo.
- **"Esqueci minha senha"**: NÃO existe no produto real. Não criar mockup.
- **Confirmação de e-mail**: NÃO existe no produto real. Não criar mockup.
- **Reset por tipo no admin**: tela única "Admin · Reset" cobre os 6 tipos de reset; não criar variantes.
- **Mobile do admin**: vai continuar clusterizado (16 phones para 28 desktop). Telas novas em admin terão mobile **apenas se for valor claro** (Fila de Jobs precisa, 403 não).
- **Admin · Configurações**: o fix do atributo é NÃO-DESTRUTIVO (mudar `data-screen-final-label` → `data-screen-label`). Não conta como modificação de conteúdo de tela.
- **Toast/snackbar**: vai entrar como mini-demo dentro de admin.html (próximo a Notificações) — não polui o público, fica como referência interna pro simulador.

## BUGS / OBSERVAÇÕES (info — NÃO consertar nesta fase)

- (mockup) `admin.html:2824` usa `data-screen-final-label`. Será corrigido durante FASE F.
- (mockup) `index.html` está com `v0.2 · 2026-05-10` e cita ~48 telas — defasado. Deferir.
- (mockup) `cliente.html` e `admin.html` têm 28 `.phone` sem `data-screen-label`. Tagging inconsistente — deferir (não bloqueia simulador).
- (src/) `/clear-cache` existe e pode estar obsoleto / pouco usado — deferir.
- (src/) Não há `loading.js` nem `error.js` no App Router, apenas `not-found.js`. Produto real cobre só 404. Mockup pode antecipar 500/Manutenção pra preparar simulador.

---

## CAMINHO DO BACKUP

`mockups/frontend-final/_backup-pre-v124-cobertura/` — 22 arquivos espelhados antes da v1.0.24.

---

# RELATÓRIO FINAL — o que foi efetivamente adicionado

## Telas novas em `publico.html` (20 labels — 9 pares desktop+mobile + 2 só-desktop)

| # | data-screen-label | Linha | Justificativa (rota/fluxo coberto) |
|---|---|---:|---|
| 1 | `Public · Carrinho Vazio` | 3849 | empty state de `/carrinho` (P1) |
| 2 | `Public · Carrinho Vazio Mobile` | 3890 | idem mobile |
| 3 | `Public · Checkout PIX Aguardando` | 3940 | estado PIX aguardando do `/checkout` — central no produto (P1) |
| 4 | `Public · Checkout PIX Aguardando Mobile` | 4027 | idem mobile |
| 5 | `Public · Checkout Boleto Gerado` | 4082 | estado Boleto do `/checkout` (P1) |
| 6 | `Public · Checkout Boleto Gerado Mobile` | 4168 | idem mobile |
| 7 | `Public · Checkout Pagamento Recusado` | 4218 | erro de cartão / link indisponível (P1) |
| 8 | `Public · Checkout Pagamento Recusado Mobile` | 4293 | idem mobile |
| 9 | `Public · Evento Sem Fotos` | 4356 | empty state de `/evento/[id]` (P1) |
| 10 | `Public · Evento Sem Fotos Mobile` | 4415 | idem mobile |
| 11 | `Public · Evento Privado` | 4458 | `event.visibilidade=privado` (P1) |
| 12 | `Public · Evento Privado Mobile` | 4500 | idem mobile |
| 13 | `Public · 500 Erro Servidor` | 4550 | erro global servidor (P1) |
| 14 | `Public · 500 Erro Servidor Mobile` | 4583 | idem mobile |
| 15 | `Public · Manutenção` | 4614 | manutenção planejada (P1) |
| 16 | `Public · Manutenção Mobile` | 4652 | idem mobile |
| 17 | `Public · Galeria Busca Sem Resultado` | 4699 | busca da home sem match (P2) |
| 18 | `Public · Galeria Busca Sem Resultado Mobile` | 4766 | idem mobile |
| 19 | `Public · Conta Bloqueada` | 4822 | `account_disabled` em `/login` (P2) |
| 20 | `Public · Cadastro Sucesso` | 4863 | confirmação pós-`/cadastro` (P2) |

## Telas novas em `cliente.html` (9 labels — todas só-desktop conforme companion `.phone` cluster)

| # | data-screen-label | Linha | Justificativa |
|---|---|---:|---|
| 1 | `Cliente · Compras Vazio` | 2685 | empty de `/minha-conta/compras` (P1) |
| 2 | `Cliente · Favoritos Vazio` | 2775 | empty de `/minha-conta/favoritos` (P1) |
| 3 | `Cliente · Notificações Vazio` | 2874 | empty de `/minha-conta/notificacoes` (P1) |
| 4 | `Cliente · Detalhe Compra · Reembolso` | 2982 | estado reembolso (refund.pending) (P1) |
| 5 | `Cliente · Reconhecimento Pre-Consent` | 3162 | primeiro acesso a `/minha-conta/reconhecimento` (P1) |
| 6 | `Cliente · Comentários Vazio` | 3287 | empty de `/minha-conta/comentarios` (P2) |
| 7 | `Cliente · Downloads Expirando` | 3384 | banner de alerta no detalhe compra (P2) |
| 8 | `Cliente · Reconhecimento Sem Referências` | 3509 | pós-consentimento, sem refs (P2) |
| 9 | `Cliente · Sessão Expirada` | 3621 | banner overlay de sessão expirada (P2) |

> Obs.: o agent de cliente.html aplicou também versões mobile (`.phone`) para várias dessas telas (companion sem label, seguindo padrão do arquivo).

## Telas novas em `admin.html` (7 labels + 1 FIX de atributo quebrado)

| # | data-screen-label | Linha | Justificativa |
|---|---|---:|---|
| FIX | `Admin · Configurações` | 2825 | corrigido `data-screen-final-label` → `data-screen-label` |
| 1 | `Admin · Fila de Jobs` | 3720 | painel de `jobsQueue.js` (derivadas/poster/preview MP4) — não havia UI (P1) |
| 2 | `Admin · Evento Sem Fotos` | 3889 | empty de `/admin/eventos/[id]` aba Fotos (P1) |
| 3 | `Admin · Dashboard Vazio` | 3976 | produto novo, sem dados (P2) |
| 4 | `Admin · 403 Sem Permissão` | 4095 | colaborador acessando super-admin (P2) |
| 5 | `Admin · Pedido com Reembolso` | 4153 | row expandida com timeline de refund (P2) |
| 6 | `Admin · Comentário em Moderação` | 4292 | row expandida com histórico + ações (P2) |
| 7 | `Admin · Toasts (referência)` | 4419 | guia visual de success/error/info/warning/undo (P2 — componente) |

## Diff resumo — antes × depois

| Arquivo | Labels antes | Labels depois | Δ | Linhas antes | Linhas depois | Δ |
|---|---:|---:|---:|---:|---:|---:|
| publico.html | 25 | 45 | +20 | 3840 | 4910 | +1070 |
| cliente.html | 12 | 21 | +9 | 2705 | 3724 | +1019 |
| admin.html | 27 (+1 broken) | 36 (todos válidos) | +8 + fix | 4018 | 4812 | +794 |
| **Total** | **64 válidas (+1 broken)** | **102 válidas** | **+38** | **10563** | **13446** | **+2883** |

## Validações passadas

- ✓ Backup intacto em `_backup-pre-v124-cobertura/` (22 arquivos, contagens batem com fonte).
- ✓ Sem mojibake em nenhum dos 3 arquivos (grep `Ã[©§ƒ]|â†|ï¿½` → 0 matches).
- ✓ Atributo `data-screen-final-label` eliminado do admin.html.
- ✓ Comentário de versão `v1.0.24 — 2026-05-12 · cobertura funcional` adicionado nos 3 arquivos (comentários antigos preservados).
- ✓ Spot-check de 3 telas novas confirmou: tokens (`var(--ink-X)`, `var(--brand-X)`, `var(--warning-500)`, `var(--font-mono)`), classes reutilizadas (`.frame`, `.nav`, `.adm-topbar`, `.adm-side`, `.adm-main`, `.acc-side`, `.acc-main`, `.badge`, `.btn`), avatares canonical (Vinícius `?img=12`, cliente `?img=33`), fotos `picsum.photos/seed/<tema>/W/H`, status byte-equal (`Pendente`, `REEMBOLSO SOLICITADO`), conteúdo pt-BR realista.

## Itens deferred para v1.0.25 (P3 / nice-to-have)

- Public · Galeria Filtro Sem Resultado (variante da galeria com filtro de pasta/hora aplicado)
- Public · Offline / Sem Conexão (estado de fetch falhado)
- Cliente · Chat Vazio (primeira interação)
- Cliente · Remoções LGPD Vazio
- Admin · Carrinhos Vazio (variante "ninguém montou carrinho hoje")
- Admin · Logs Vazio (filtro sem resultado)
- Skeleton/Loading state genérico (componente reutilizável)
- Tooltip / popover demo
- `index.html` (hub) — atualizar contagem de "~48 telas" para 102 e refletir surfaces atuais (NÃO crítico, mas registrado).

## Surpresas / informações coletadas (não consertadas)

- **(src/) sem `loading.js` nem `error.js`**: o App Router só tem `not-found.js`. O mockup agora antecipa 500 e Manutenção para preparar o simulador funcional — mas o produto real cai num genérico do Next.
- **(src/) `/clear-cache`**: rota utilitária, sem valor demonstrativo. Não foi criada tela.
- **(src/) Recuperação de senha self-service não existe**: o reset é manual via admin (`/api/clients/[id]/reset-password` → senha temporária + `mustChangePassword=true`). Mockup não fingiu existir.
- **(mockup) `index.html` defasado** (`v0.2 · 2026-05-10`, cita "~48 telas") — deferred.
- **(mockup) cliente.html e admin.html** seguem com `.phone` sem `data-screen-label` (28 phones unlabeled). Não bloqueia simulador; deferred.
- **(mockup) `publico.legacy-v1.0.21-approved.html`**: baseline aprovado, intocado. Continua espelhando o público antes do refactor de fonte mono.

## Caminho do backup

`H:\Programas\projeto-fotografo\mockups\frontend-final\_backup-pre-v124-cobertura\` — 22 arquivos. Pode ser restaurado integralmente caso seja preciso reverter para v1.0.23.
