# Roadmap — varredura comparativa do simulador

> **Para rodar numa NOVA sessão do Claude Code**, separada da `simulador full`.

## Nome sugerido para a nova sessão

**`varredura comparativa`** (recomendado — descreve a essência: comparar real ↔ mockup ↔ simulador, página por página)

Alternativas se preferir:
- `auditoria de paridade`
- `polimento por área`
- `review de cobertura`
- `alinhamento mockup-projeto`

---

## Contexto

A sessão `simulador full` deixou o simulador robusto (v0.10):
- 83 rotas com mobile dedicado
- Sidebars canônicas
- Ícones Lucide
- QR Pix real
- 8 abas em `/admin/eventos/123`
- Build script em `mockups/frontend-final/build-simulador.js`

**Esta nova sessão** vai pegar grupo por grupo de páginas e comparar:
1. **Projeto real** — `src/app/**/page.js` (Next.js, código que está rodando)
2. **Mockup** — `mockups/frontend-final/{publico,cliente,admin}.html`
3. **Simulador** — `mockups/frontend-final/simulador.html` (gerado)

E aplicar mudanças nos mockups e/ou no build do simulador onde houver divergência problemática.

---

## Como usar este roadmap

1. Abrir sessão nova `varredura comparativa` em `H:\Programas\projeto-fotografo`
2. Colar **PROMPT 0** (setup) e esperar Claude responder
3. Colar **PROMPT 1**, esperar conclusão, revisar relatório, pedir ajustes se necessário
4. Repetir para prompts 2 → 14
5. Após blocos lógicos, colar os **CHECKPOINTS A, B, C** para mediar coerência
6. No final, **PROMPT FINAL** consolida e faz deploy

Cada prompt é colado inteiro como mensagem do user. Claude tem ferramentas pra ler arquivos, rodar build, validar, etc. Não precisa intervir entre operações.

---

## Regras firmes para o Claude (incluídas em cada prompt)

- **NUNCA modificar `src/`** — é o código real do projeto. Só leitura para entender o que existe.
- **Modificações sempre em** `mockups/frontend-final/{publico,cliente,admin}.html` e/ou `build-simulador.js`
- **Após qualquer mudança nos mockups**: `node mockups/frontend-final/build-simulador.js && node mockups/frontend-final/audit-simulador.js`
- **Validar visual no preview** quando faz sentido (rotas observáveis): subir `npx http-server mockups/frontend-final -p 8765 -c-1 --silent` e abrir `/simulador.html#/rota`
- **Commitar localmente** após cada grupo concluído, mas **NÃO fazer push** até o checkpoint final (deploy de uma vez no fim economiza builds do GH Pages)
- **Relatório por grupo**: lista de mudanças aplicadas, justificativa de cada uma, e o que ficou pendente
- **Não inventar funcionalidades**: se o real (`src/`) não tem, o mockup também não deve

---

## PROMPT 0 — Setup da sessão

```
Sou Vinícius, leigo em programação. Responda em pt-BR.

Estou abrindo uma sessão nova do Claude Code só pra fazer uma VARREDURA COMPARATIVA do simulador. A sessão anterior ("simulador full") deixou o simulador em v0.10 — 83 rotas com mobile dedicado. Agora quero pegar grupo por grupo de páginas e comparar com o projeto real (src/) e com o mockup, decidindo o que precisa ajustar.

ANTES de fazer qualquer coisa:
1. Ler H:\Programas\projeto-fotografo\CLAUDE.md inteiro
2. Ler C:\Users\softk\.claude\projects\H--Programas-projeto-fotografo\memory\MEMORY.md e os arquivos que ele referencia
3. Ler H:\Programas\projeto-fotografo\mockups\frontend-final\ROADMAP-varredura.md (este arquivo) inteiro
4. Ler H:\Programas\projeto-fotografo\mockups\frontend-final\PLAN-simulador.md
5. Listar H:\Programas\projeto-fotografo\src\app — me dizer quantos e quais subdiretórios existem
6. Confirmar pra mim em 5 linhas:
   - O que entendeu da estrutura geral
   - Onde fica o projeto REAL (src/)
   - Onde ficam os MOCKUPS
   - Onde fica o SIMULADOR e como regerá-lo
   - Que regras vai seguir (não tocar em src/, só commit local, etc.)

Não execute nenhum prompt da varredura ainda. Só faça este setup e confirme. Os próximos PROMPTS virão um por um.
```

---

## PROMPT 1 — Público · Home & Descoberta

```
VARREDURA — Grupo 1 de 14 · Público · Home & Descoberta

ESCOPO (6 rotas):
- / (home)
- /evento/safra-2026 (galeria de evento)
- /evento-sem-fotos
- /evento-privado
- /busca-sem-resultado
- (componente recorrente: nav pública + footer público)

FONTES PARA COMPARAR:
1. Real:
   - src/app/page.js (home)
   - src/app/evento/[id]/page.js (galeria)
   - src/components/* relevantes (nav, footer)
2. Mockup:
   - mockups/frontend-final/publico.html — seções com data-screen-label="Public · Home Desktop", "Public · Event Gallery", "Public · Event Gallery Mobile", "Public · Evento Sem Fotos", "Public · Evento Privado", "Public · Galeria Busca Sem Resultado" (+ mobiles correspondentes)
3. Simulador: mockups/frontend-final/simulador.html, hash #/, #/evento/safra-2026, etc.
4. URL live (se quiser comparar): https://vinisouza128.github.io/fotografo-mockups-preview/simulador.html

O QUE ANALISAR pra cada rota:
- O REAL tem alguma seção/feature que NÃO está no mockup?
- O MOCKUP mostra algo que o REAL não faz?
- O SIMULADOR está pegando o conteúdo certo do mockup (sem corte)?
- DESKTOP e MOBILE estão coerentes entre si (não dar a impressão de telas diferentes)?
- Inputs, botões, badges, ícones — coerentes entre rotas do mesmo grupo?
- pt-BR limpo (sem mojibake)?

DECISÕES POSSÍVEIS:
A. Aceitar como está (justificar)
B. Ajustar APENAS visual no mockup (publico.html)
C. Ajustar funcionalidade no simulador (build-simulador.js) — ex: adicionar interação que o real tem
D. Adicionar rota nova se faltar (raro)
E. Marcar como "discutir depois" (com motivo) se for grande demais

PASSOS:
1. Ler os src/ relevantes e descrever em ~5 bullets o que o REAL faz em cada rota
2. Ler os trechos do mockup (publico.html) — bullets do que o mockup mostra
3. Comparar e listar divergências por rota
4. Aplicar mudanças nos arquivos certos (publico.html ou build-simulador.js — NUNCA em src/)
5. Regerar simulador: `cd mockups/frontend-final && node build-simulador.js && node audit-simulador.js`
6. Validar visual no preview (subir http-server local se ainda não estiver rodando)
7. Commit local: `git add mockups/frontend-final/{publico.html,build-simulador.js,simulador.html} && git commit -m "review[g1-publico-home]: <breve>"`
   - NÃO fazer push agora
8. Reportar:
   - O que mudou (lista bullet)
   - Por que mudou (1 linha por item)
   - O que ficou pendente
   - Print do simulador na rota principal (/) — descrever via preview_snapshot, NÃO precisa screenshot

Aviso: este é um dos 14 prompts da varredura. Foque APENAS neste grupo. Os outros virão depois.
```

---

## PROMPT 2 — Público · Lightbox & Mídia

```
VARREDURA — Grupo 2 de 14 · Público · Lightbox & Mídia

ESCOPO (2 rotas):
- /foto/safra-2026/0421 (lightbox de foto)
- /video/safra-2026/v07 (lightbox de vídeo)

FONTES:
1. Real:
   - src/components/* que renderizam o lightbox (procurar Lightbox, PhotoModal, VideoModal)
   - src/app/evento/[id]/page.js — onde abre o modal
2. Mockup: publico.html — data-screen-label="Public · Lightbox Foto" / "Lightbox Foto Mobile" / "Lightbox Vídeo" / "Lightbox Vídeo Mobile"
3. Simulador: rotas #/foto/safra-2026/0421 e #/video/safra-2026/v07; lightbox do simulador (overlay open via JS) é OUTRO componente — não confundir

O QUE ANALISAR:
- Diferença entre o LIGHTBOX nativo do simulador (overlay com close/prev/next/add-cart) e a TELA mockada de lightbox
- Funcionalidades reais: zoom? favoritar? compartilhar? curtir? comentar? ver outras fotos do cliente?
- Vídeo: preview MP4 com watermark? barra de progresso? autoplay?
- Mobile: gestos (swipe pra próximo)? tap pra fechar? sheet de ações?
- Avatar canonical do Vinícius (pravatar ?img=12) em comentários se houver

DECISÕES:
A. Aceitar
B. Ajustar mockup
C. Melhorar simulador (ex: clique em foto da galeria abre o lightbox NATIVO do simulador, não a tela mockada)
D. Pendente

PASSOS:
Igual ao Grupo 1 (ler real → mockup → comparar → aplicar → build → validar → commit local sem push → reportar).

Commit: `review[g2-publico-lightbox]: <breve>`
```

---

## PROMPT 3 — Público · Compra (carrinho → checkout)

```
VARREDURA — Grupo 3 de 14 · Público · Compra (carrinho → checkout)

ESCOPO (7 rotas):
- /carrinho
- /carrinho-vazio
- /checkout
- /checkout/pix
- /checkout/boleto
- /checkout/confirmado
- /checkout/recusado

FONTES:
1. Real:
   - src/app/carrinho/page.js
   - src/app/checkout/page.js
   - src/lib/commerceUtils.js (regras de status: "Simulacao/liberacao" sem acento — intencional)
   - src/lib/cartPricePolicy.js, src/lib/pricing.js (descontos progressivos)
2. Mockup: publico.html — "Public · Cart Review" (+ Mobile), "Public · Checkout Desktop", "Public · Checkout PIX Aguardando" (+ Mobile), "Public · Checkout Boleto Gerado" (+ Mobile), "Public · Confirmation" (+ Mobile), "Public · Checkout Pagamento Recusado" (+ Mobile), "Public · Carrinho Vazio" (+ Mobile)
3. Simulador

ESPECIAL ATENÇÃO:
- Status de pagamento DEVE ser byte-equal com commerceUtils.js (inclusive "Simulacao/liberacao" sem acento, intencional — não corrigir)
- QR Pix REAL no /checkout/pix (v0.5 adicionou via lib qrcode) — validar que renderiza
- Tiers de desconto progressivo no carrinho — confere com pricing.js
- Combo-tiers e heart-pill (v1.0.10 do mockup)
- Mobile: drawer com resumo do pedido stick no bottom?

PASSOS: iguais. Commit: `review[g3-publico-compra]: <breve>`
```

---

## PROMPT 4 — Público · Auth & Cadastro

```
VARREDURA — Grupo 4 de 14 · Público · Auth & Cadastro

ESCOPO (6 rotas):
- /login
- /cadastro
- /cadastro-sucesso
- /recuperar-senha
- /conta-bloqueada
- /compras-guest (compras como visitante, sem login)

FONTES:
1. Real:
   - src/app/login/page.js, /cadastro/page.js, /trocar-senha/page.js
   - src/app/compras/page.js (verifica se aceita guest)
   - src/lib/auth* se existir
2. Mockup: publico.html — "Public · Login", "Public · Cadastro", "Public · Cadastro Sucesso", "Public · Trocar Senha", "Public · Conta Bloqueada", "Public · Compras Guest" (+ Mobile)
3. Simulador: /login, /cadastro, etc.

ESPECIAL:
- O simulador FAZ login simulado quando o user clica em "Entrar" no form (bindNavLinks). Verificar que: email com "admin" → /admin; outros → /cliente
- Inputs com tema dark (shared.css v1.0.26 inputs[type=email] etc.)
- "Compras guest" — pode procurar compra por código + email sem precisar logar; é fluxo público importante
- Mobile auth: forms stacked, botão full-width

PASSOS: iguais. Commit: `review[g4-publico-auth]: <breve>`
```

---

## PROMPT 5 — Público · Conteúdo & Legais

```
VARREDURA — Grupo 5 de 14 · Público · Conteúdo & Legais

ESCOPO (5 rotas):
- /contato
- /autenticidade
- /termos
- /privacidade
- /cookies

FONTES:
1. Real:
   - src/app/contato/page.js (form de contato)
   - src/app/autenticidade/page.js (verificar autoria por hash)
   - src/app/termos/page.js, /privacidade/page.js, /cookies/page.js (texto)
2. Mockup: publico.html — Public · Contato (+ Mobile), Autenticidade, Termos, Privacidade, Cookies

ESPECIAL:
- Autenticidade: texto + input pra colar hash SHA-256 + retorno se confere
- Contato: form (nome, email, mensagem) + opções de WhatsApp/Instagram direto
- Legais: texto rolável com headings — está atualizado com data (versão de YYYY-MM-DD)?
- Mobile dos legais: scroll vertical com headings ancorados

PASSOS: iguais. Commit: `review[g5-publico-legais]: <breve>`
```

---

## PROMPT 6 — Público · Erros & Estados

```
VARREDURA — Grupo 6 de 14 · Público · Erros & Estados

ESCOPO (3 rotas):
- /404
- /500
- /manutencao

FONTES:
1. Real:
   - src/app/not-found.js (ou /404/page.js)
   - src/app/error.js (500)
   - middleware.js (manutenção)
2. Mockup: publico.html — Public · 404 (+ Mobile), Public · 500 Erro Servidor (+ Mobile), Public · Manutenção (+ Mobile)

ESPECIAL:
- Ícone, mensagem amigável, link de volta pra home, fonte General Sans
- Texto em pt-BR sem mojibake (verificar especificamente caracteres acentuados)
- Mobile: tela centralizada, max-width estreito, padding generoso
- Botão "Voltar pro início" com handler do simulador (data-sim-route='/')

PASSOS: iguais. Commit: `review[g6-publico-erros]: <breve>`
```

---

## CHECKPOINT A — Após grupo público (entre prompts 6 e 7)

```
CHECKPOINT A — coerência do público

Você acabou de varrer os 6 grupos do público (Home, Lightbox, Compra, Auth, Legais, Erros). Antes de passar pro cliente, faça um checkup de coerência GERAL no público:

1. Listar TODAS as mudanças feitas até agora (resumo por grupo)
2. Rebuildar simulador e rodar audit
3. Navegar pelas rotas públicas no preview em ordem (#/, #/evento, #/foto, #/carrinho, #/checkout, #/checkout/pix, #/checkout/confirmado, #/login, #/cadastro, #/contato, #/autenticidade, #/termos, #/404, #/500, #/manutencao) — observar:
   a) Header da nav é IDÊNTICO entre rotas? Logo no mesmo lugar? Carrinho counter atualizado?
   b) Footer aparece em todas as rotas exceto erros/manutenção?
   c) Tipografia consistente (Instrument Serif italic em headlines, General Sans em texto, JetBrains Mono em IDs/preços)?
   d) Cor brand igual em todos os CTAs?
   e) Mobile coerente entre rotas (mesma topbar, mesmo padding, mesma estrutura)?
4. Procurar ESPECIFICAMENTE:
   - Mojibake (Ã, ðŸ, â€)
   - Hex inline novo em style=""
   - Imagens quebradas (verificar via.placeholder ou broken refs)
5. Listar problemas residuais
6. Aplicar correções rápidas se forem pontuais
7. Reportar: o que está sólido, o que ainda precisa atenção, e dar um "✓ PÚBLICO OK" se tudo passou
8. Commit local: `review[checkpoint-A-publico]: <resumo>`

Não passe pro cliente sem reportar. Não faça push.
```

---

## PROMPT 7 — Cliente · Hub & Compras

```
VARREDURA — Grupo 7 de 14 · Cliente · Hub & Compras

ESCOPO (6 rotas):
- /cliente (dashboard)
- /cliente/compras (lista)
- /cliente/compras/123 (detalhe)
- /cliente/compras/124-reembolso (detalhe c/ reembolso)
- /cliente/compras-vazio
- /cliente/downloads-expirando

FONTES:
1. Real:
   - src/app/minha-conta/page.js (ou /cliente/page.js)
   - src/app/compras/page.js (lista) + /compras/[id]/page.js (detalhe)
   - src/lib/downloadPolicy.js (regras de expiração)
2. Mockup: cliente.html — "Cliente · Dashboard Desktop", "Cliente · Compras", "Cliente · Detalhe Compra", "Cliente · Detalhe Compra · Reembolso", "Cliente · Compras Vazio", "Cliente · Downloads Expirando"
3. Simulador

ESPECIAL:
- O cliente vê SUAS compras (não as de outros). Verificar isolation.
- Download expira em X dias (downloadPolicy.js define quantos) — banner amarelo no detalhe?
- Reembolso parcial: mostrar quais fotos foram reembolsadas (overlay X em cima)
- Re-download disponível X vezes? mostra contador?
- Avatar canonical Vinícius pravatar.cc/?img=12 quando logado como ele

PASSOS: iguais. Commit: `review[g7-cliente-compras]: <breve>`
```

---

## PROMPT 8 — Cliente · Engajamento

```
VARREDURA — Grupo 8 de 14 · Cliente · Engajamento

ESCOPO (8 rotas):
- /cliente/carrinho (carrinho do cliente logado, persiste cross-device)
- /cliente/favoritos
- /cliente/favoritos-vazio
- /cliente/comentarios
- /cliente/comentarios-vazio
- /cliente/notificacoes
- /cliente/notificacoes-vazio
- /cliente/chat

FONTES:
1. Real:
   - src/app/carrinho (cliente persistido)
   - src/app/favoritos (curtidas/salvos)
   - src/app/comentarios (lista, threading)
   - src/app/notificacoes
   - src/app/chat
2. Mockup: cliente.html — Cliente · Carrinho, Favoritos, Comentários, Remoções LGPD, Notificações, Chat, Favoritos Vazio, Notificações Vazio, Comentários Vazio
3. Simulador

ESPECIAL:
- Salvos (privados) vs Curtidas (públicas) — explicar distinção
- Comentários em árvore (replies)
- Notificações: vendas, comentários, downloads expirando, sistema
- Chat: conversa com fotógrafo, lista lateral de conversas (?)
- Estados vazios com CTA pra ação (explorar álbuns, etc.)

PASSOS: iguais. Commit: `review[g8-cliente-engajamento]: <breve>`
```

---

## PROMPT 9 — Cliente · Conta & Privacidade

```
VARREDURA — Grupo 9 de 14 · Cliente · Conta & Privacidade

ESCOPO (6 rotas):
- /cliente/configuracoes
- /cliente/recompensas
- /cliente/reconhecimento
- /cliente/reconhecimento-consent (pré-consentimento)
- /cliente/reconhecimento-vazio (sem referências cadastradas)
- /cliente/remocoes (LGPD)
- /cliente/sessao-expirada

FONTES:
1. Real:
   - src/app/configuracoes/page.js
   - src/app/recompensas/page.js
   - src/app/reconhecimento (opt-in face-api)
   - src/app/remocoes (LGPD)
   - src/lib/vision/* (face-api, backend manual)
2. Mockup: cliente.html — Configurações, Recompensas, Reconhecimento (e 2 estados), Remoções LGPD, Sessão Expirada

ESPECIAL:
- Reconhecimento facial:
  - Pré-consent: explicar LGPD, opt-in claro, link pra privacidade
  - Sem referências: upload de 1-3 fotos de referência
  - Ativo: lista de fotos detectadas com confiança
- Remoções LGPD: lista de solicitações + status (pendente/aprovada/rejeitada)
- Recompensas: pontos por indicação, descontos progressivos
- Sessão expirada: tela completa centralizada

PASSOS: iguais. Commit: `review[g9-cliente-conta]: <breve>`
```

---

## CHECKPOINT B — Após cliente (entre prompts 9 e 10)

```
CHECKPOINT B — coerência do cliente

Acabou de varrer os 3 grupos do cliente. Antes de passar pro admin:

1. Resumir mudanças por grupo (7, 8, 9)
2. Build + audit
3. Navegar TODAS as rotas /cliente/* no preview e observar:
   a) Sidebar do cliente é IDÊNTICA entre rotas? Item ativo destacado corretamente?
   b) Avatar Vinícius pravatar?img=12 quando logado como ele
   c) Mobile do cliente: sidebar vira drawer hamburger? Ou tela ocupa 100% sem sidebar?
   d) "Sair" sempre disponível?
4. Verificar que o LOGIN simulado funciona: clicar "Cliente" na topbar → /cliente; clicar Sair em uma das telas → volta pra /, role=public
5. Estados vazios (compras-vazio, favoritos-vazio, etc.): coerentes entre si? Mesma estrutura visual?
6. Listar problemas residuais
7. Aplicar correções pontuais
8. "✓ CLIENTE OK" se tudo passou
9. Commit local: `review[checkpoint-B-cliente]: <resumo>`

Não passe pro admin sem reportar. Sem push.
```

---

## PROMPT 10 — Admin · Visão geral

```
VARREDURA — Grupo 10 de 14 · Admin · Visão geral

ESCOPO (3 rotas):
- /admin (dashboard)
- /admin/dashboard-vazio
- /admin/estatisticas

FONTES:
1. Real:
   - src/app/admin/page.js (dashboard)
   - src/app/admin/estatisticas/page.js
2. Mockup: admin.html — "Admin · Dashboard", "Admin · Dashboard Vazio", "Admin · Estatísticas"
3. Simulador

ESPECIAL:
- Dashboard tem KPIs (faturamento, pedidos, mídia vendida, clientes únicos, carrinhos ativos, acervo). Verificar que os números fazem sentido (não placeholder genérico).
- "Boa tarde, Vinícius!" — saudação dinâmica? mockup tem hardcoded?
- Atividade recente + Top eventos do mês + Repasses pendentes
- Estatísticas: filtros (7d/30d/90d/12m), exportar CSV, gráficos (charts svg simples no mockup)
- Dashboard vazio: estado primeiro acesso, CTA "Criar primeiro evento"

PASSOS: iguais. Commit: `review[g10-admin-visao]: <breve>`
```

---

## PROMPT 11 — Admin · Eventos (cobertura completa)

```
VARREDURA — Grupo 11 de 14 · Admin · Eventos (cobertura COMPLETA)

ESCOPO (7 rotas):
- /admin/eventos (lista)
- /admin/eventos/123 (detalhe com 8 ABAS — Vendas/Carrinhos/Mídia/Patrocinadores/Marca d'água/Relatórios/Preços/Info)
- /admin/eventos/123-videos (variante)
- /admin/eventos/123-patrocinadores (variante)
- /admin/eventos/novo (criar)
- /admin/eventos/123-upload (upload de fotos)
- /admin/eventos-sem-fotos (estado vazio)

FONTES (MUITO IMPORTANTE — esse grupo é o coração do admin):
1. Real:
   - src/app/admin/eventos/page.js (lista — 7096 linhas, gigante)
   - src/app/admin/eventos/[id]/page.js (detalhe com 8 abas)
   - src/app/admin/eventos/[id]/videos/page.js, /patrocinadores/page.js
   - src/app/admin/criar-evento/page.js
   - src/app/admin/upload-fotos/page.js
2. Mockup: admin.html — "Admin · Eventos", "Admin · Detalhe Evento" (e variantes Vídeos/Patrocinadores), "Admin · Criar Evento", "Admin · Upload Fotos", "Admin · Evento Sem Fotos"
3. Simulador — /admin/eventos/123 foi ENRICHED com 8 abas via enrichEventDetailRoute() no build script. Validar que as abas correspondem ao TABS do src/app/admin/eventos/[id]/page.js (Vendas & Contas, Carrinhos Ativos, Mídia, Patrocinadores, Marca d'água, Relatórios, Preços & Descontos, Informações)

ESPECIAL ATENÇÃO:
- A lista de eventos tem filtros, busca, badges (status: ativo/rascunho/arquivado), tabela paginada
- Detalhe do evento: comparar AS 8 ABAS com o que está no src/. Ver se cada aba do simulador tem todos os campos/ações que o real tem. Se falta algo no mockup, ADICIONAR no build-simulador.js (na função enrichEventDetailRoute, na string das panes).
- Upload: drag-drop area, progress bar, lista de arquivos, opções (visibilidade, categoria, marca d'água per-evento)
- Criar evento: form completo com TODOS os campos do real (nome, data, local, categoria, visibilidade, colaborador %, descrição, capa, preço base, política de preços, marca d'água custom?)
- Mobile da página de detalhe: 5 tabs em vez de 8 (Vendas/Mídia/Patrocinadores/Marca d'água/Info) — confere se faz sentido condensar

PASSOS: iguais. Pode levar mais tempo — esse grupo é o mais denso. Commit: `review[g11-admin-eventos]: <breve>`
```

---

## PROMPT 12 — Admin · Vendas

```
VARREDURA — Grupo 12 de 14 · Admin · Vendas

ESCOPO (6 rotas):
- /admin/pedidos (lista)
- /admin/pedidos/reembolso (detalhe com reembolso)
- /admin/carrinhos (carrinhos abertos pra recuperar)
- /admin/cupons
- /admin/propostas
- /admin/repasses

FONTES:
1. Real:
   - src/app/admin/pedidos/page.js
   - src/app/admin/carrinhos/page.js
   - src/app/admin/cupons/page.js
   - src/app/admin/propostas/page.js
   - src/app/admin/repasses/page.js
2. Mockup: admin.html — Pedidos, Pedido com Reembolso, Carrinhos, Cupons, Propostas, Repasses

ESPECIAL:
- Pedidos: status (pago/aguardando/expirado/reembolsado), filtros por método (PIX/Cartão/Boleto), busca por ID/cliente
- Reembolso: 8 fotos compradas, 2 marcadas pra reembolso (overlay X vermelho), cálculo de líquido final
- Carrinhos abertos: cliente, itens, última atividade, potencial em R$, ação (enviar lembrete via WhatsApp template, esperar, recuperar)
- Cupons: lista + criar (nome, código, % desc OU R$ fixo, validade, limite de uso, eventos elegíveis)
- Propostas: orçamentos enviados pra clientes (casamentos, eventos privados) — status (enviada/aguardando/aceita/recusada)
- Repasses: por colaborador, % do evento, status (pendente/pago dia 5), botão "marcar como pago"

PASSOS: iguais. Commit: `review[g12-admin-vendas]: <breve>`
```

---

## PROMPT 13 — Admin · Pessoas & Moderação

```
VARREDURA — Grupo 13 de 14 · Admin · Pessoas & Moderação

ESCOPO (7 rotas):
- /admin/clientes
- /admin/colaboradores
- /admin/chat
- /admin/comentarios
- /admin/comentarios/moderacao
- /admin/contatos
- /admin/remocoes

FONTES:
1. Real:
   - src/app/admin/clientes/page.js
   - src/app/admin/colaboradores/page.js
   - src/app/admin/chat/page.js
   - src/app/admin/comentarios/page.js (lista + moderação)
   - src/app/admin/contatos/page.js
   - src/app/admin/remocoes/page.js
2. Mockup: admin.html — Clientes, Colaboradores, Chat, Comentários, Comentário em Moderação, Contatos, Remoções

ESPECIAL:
- Clientes: avatar, nome, email, # eventos comprados, LTV, badge VIP/NOVA, busca, ações (ver compras, conversar, banir)
- Colaboradores: % de repasse, eventos com colab, total repassado, convidar novo
- Chat: lista lateral de conversas + thread aberto + input de mensagem + envio de foto/preço sugerido
- Comentários: lista pra moderar (5 pendentes), bulk action, filtros por evento
- Moderação: tela detalhada do comentário, autor (verificado?), texto, contexto da foto, ações (aprovar/rejeitar/spam+banir), timeline
- Contatos: lista de propostas/contatos a responder (3 pendentes), tab pendentes/respondidas, "responder" abre form, "→ proposta" cria proposta
- Remoções LGPD: solicitações de remoção de foto/face, prazo 5 dias úteis, status, ações (aprovar/rejeitar/conversar)

PASSOS: iguais. Commit: `review[g13-admin-pessoas]: <breve>`
```

---

## PROMPT 14 — Admin · Configurações & Sistema

```
VARREDURA — Grupo 14 de 14 · Admin · Configurações & Sistema (FINAL)

ESCOPO (11 rotas — o mais longo):
- /admin/marca-dagua (global)
- /admin/personalizar (cores/textos do site)
- /admin/configuracoes
- /admin/storage
- /admin/recompensas (configurar regras de pontos)
- /admin/logs (auditoria)
- /admin/jobs (fila)
- /admin/notificacoes (admin)
- /admin/reconhecimento (config do face-api)
- /admin/reset (zona perigosa)
- /admin/403 (sem permissão)

FONTES:
1. Real:
   - src/app/admin/marca-dagua/page.js
   - src/app/admin/personalizar/page.js
   - src/app/admin/configuracoes/page.js
   - src/lib/storage/* (FS local + S3)
   - src/app/admin/recompensas/page.js
   - src/app/admin/logs/page.js (auditoria server-side)
   - src/lib/jobs/* (fila persistida em data/jobs.json)
   - src/app/admin/notificacoes/page.js
   - src/app/admin/reconhecimento/page.js
   - src/app/admin/reset/page.js
2. Mockup: admin.html — Marca d'água, Personalizar, Configurações, Storage, Recompensas, Logs & auditoria, Fila de Jobs, Notificações, Reconhecimento, Reset, 403

ESPECIAL:
- Marca d'água: já tem em /admin/eventos/123 aba "Marca d'água" (per-evento). Esta é a GLOBAL (default).
- Storage: S3-compatible (R2/MinIO/B2), bucket atual, espaço usado, backup automático, restaurar de backup
- Logs: filtros por ação/autor/data, retenção 90d, sanitização de senhas
- Jobs: fila persistida em data/jobs.json, retry, watchdog
- Reset: factory reset, limpar carrinhos abandonados, embeddings, fotos de teste
- 403: tela de acesso negado pra colaborador acessando área admin plena

PASSOS: iguais. Commit: `review[g14-admin-sistema]: <breve>`
```

---

## CHECKPOINT C — Coerência admin (entre prompt 14 e o final)

```
CHECKPOINT C — coerência do admin

Acabou de varrer os 5 grupos do admin (10-14). Antes do deploy final:

1. Resumo das mudanças por grupo
2. Build + audit
3. Navegar TODAS as rotas /admin/* no preview e observar:
   a) Sidebar admin idêntica entre rotas? Item ativo destacado? 26 links sempre?
   b) Topbar admin (brand-pill, crumbs, busca, avatar) consistente?
   c) Avatar Vinícius pravatar?img=12
   d) Estatísticas (KPIs) com cores semânticas consistentes (signal-500 verde pra positivo, warning pra atenção, danger pra erro)
   e) Mobile admin: drawer hamburger com sidebar canônica
4. Verificar especificamente as 8 ABAS de /admin/eventos/123 funcionando no desktop E no mobile (5 tabs no mobile)
5. Buscar problemas residuais (mojibake, ícones quebrados, sidebar omitida)
6. Aplicar correções pontuais
7. "✓ ADMIN OK" se tudo passou
8. Commit local: `review[checkpoint-C-admin]: <resumo>`

Sem push ainda.
```

---

## PROMPT FINAL — Consolidação + deploy

```
VARREDURA — Final · Consolidação + deploy

Toda a varredura foi feita (14 grupos + 3 checkpoints). Agora consolidar e fazer deploy.

PASSOS:

1. **Revisão final** — ler os commits da sessão:
   `git log --oneline --since="<começo da sessão>" --author=...`
   Listar tudo que mudou (resumo executivo de 1 página).

2. **Build final** — `cd mockups/frontend-final && node build-simulador.js && node audit-simulador.js`
   - audit DEVE passar 10/10 sem warnings

3. **Comparação local vs simulador** — rodar `npx http-server mockups/frontend-final -p 8765 -c-1 --silent` (se ainda não rodando) e navegar TODAS as rotas listadas no menu ☰ Telas (83 rotas). Verificar que nenhuma quebrou.

4. **Copiar pro repo GH Pages** — `cp mockups/frontend-final/simulador.html H:/Programas/fotografo-mockups-preview/`

5. **Atualizar version no index.html do repo** — v0.10 → v0.11 (ou superior, conforme magnitude das mudanças)
   - Atualizar badge da `.sim-card`
   - Atualizar `<span class="meta">v0.X</span>`

6. **Squash dos commits da sessão** (opcional):
   - Decidir: manter histórico granular OU squash em um commit "feat: varredura comparativa completa — N mudanças"
   - Recomendação: deixar histórico granular pra rastreabilidade

7. **Commit no repo GH** + **push**:
   ```
   cd H:/Programas/fotografo-mockups-preview
   git add simulador.html index.html
   git commit -m "feat: v0.11 — varredura comparativa (14 grupos)"
   git push
   ```

8. **Aguardar GH Pages buildar** (~1-2 min) e validar live:
   `curl -s https://vinisouza128.github.io/fotografo-mockups-preview/simulador.html | grep -c "<marker da v0.11>"`

9. **Atualizar memória persistente**:
   - C:\Users\softk\.claude\projects\H--Programas-projeto-fotografo\memory\project_simulator.md
   - C:\Users\softk\.claude\projects\H--Programas-projeto-fotografo\memory\MEMORY.md
   - Marcar "varredura comparativa concluída em YYYY-MM-DD, simulador v0.11"

10. **Reportar resumo executivo**:
    - Total de grupos varridos
    - Total de mudanças aplicadas (por área)
    - Pendências honestas (o que ficou pra outra sessão)
    - URL live
    - Hash do commit final

Pronto. Sessão `varredura comparativa` finalizada.
```

---

## Anexos úteis

### Comandos rápidos (todos a partir de `H:\Programas\projeto-fotografo`)

```bash
# Rebuild
node mockups/frontend-final/build-simulador.js

# Audit
node mockups/frontend-final/audit-simulador.js

# Preview local (cwd irrelevante pro http-server)
npx http-server mockups/frontend-final -p 8765 -c-1 --silent

# Validar mojibake
grep -nE "ðŸ|â€[œ™˜¦]" mockups/frontend-final/{publico,cliente,admin,simulador}.html || echo "limpo"

# Listar rotas no simulador
grep -oE 'data-route="[^"]+"' mockups/frontend-final/simulador.html | sort -u
```

### Estrutura de arquivos

```
H:\Programas\projeto-fotografo\
├── src/                              ← REAL (não tocar)
│   ├── app/                          (Next.js App Router)
│   │   ├── page.js                   (home)
│   │   ├── evento/[id]/page.js       (galeria)
│   │   ├── carrinho/page.js
│   │   ├── checkout/page.js
│   │   ├── admin/eventos/[id]/page.js  (7000+ linhas, 8 abas)
│   │   └── ...
│   ├── lib/                          (regras: commerceUtils, pricing, etc.)
│   └── components/
├── mockups/frontend-final/           ← MOCKUPS + SIMULADOR
│   ├── publico.html                  ← Mockup público
│   ├── cliente.html                  ← Mockup cliente
│   ├── admin.html                    ← Mockup admin
│   ├── simulador.html                ← Gerado (não editar manualmente)
│   ├── build-simulador.js            ← Gerador
│   ├── audit-simulador.js            ← Validador
│   ├── shared.css, tokens.css        ← Design system
│   └── ROADMAP-varredura.md          ← Este arquivo
└── ...

H:\Programas\fotografo-mockups-preview\  ← REPO GH PAGES (push aqui no fim)
```

### Avatares canônicos

- **Vinícius (fotógrafo, admin)**: `https://i.pravatar.cc/<size>?img=12`
- **Lucas (cliente exemplo)**: `https://i.pravatar.cc/<size>?img=3`
- Outros masculinos: 1, 3, 7, 8, 12, 13, 14, 15, 33, 51-53, 60, 61, 67, 68
- Femininas: 5, 9-11, 16, 19, 20, 24-26, 32, 36, 44, 47, 49

### Tokens críticos (não inventar)

- `--ink-100` (fundo escuro), `--ink-1000` (texto bone claro)
- `--brand-500` (azul âncora), `--brand-400` (hover)
- `--signal-500` (verde sucesso), `--warning-500` (amarelo alerta), `--danger-500` (vermelho)
- `--font-display` (Instrument Serif italic), `--font-heading` (General Sans), `--font-body` (General Sans), `--font-mono` (JetBrains Mono)

### Imagens placeholder

- Fotos: `picsum.photos/seed/<tema>/<W>/<H>` (seeds temáticos: rodeo, run, race, horse, sport01-20, equestrian, festival, arena, cattle, podium, training)
- NÃO usar via.placeholder.com (instável)

### Status de pagamento (byte-equal com `src/lib/commerceUtils.js`)

- "Pago"
- "Aguardando pagamento"
- "Liberado manualmente"
- "Simulacao/liberacao" ← **sem acento, intencional, não corrigir**
- "Expirado"
- "Reembolsado"
- "Recusado"
