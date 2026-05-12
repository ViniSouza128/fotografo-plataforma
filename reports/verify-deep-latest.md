# Relatorio verify-deep

Inicio: 2026-05-09T18:27:13.057Z
Fim: 2026-05-09T18:29:12.850Z
Base URL: http://127.0.0.1:3199
Resultado: **APROVADO**

## Comandos preliminares
- OK `npm run build (SKIP)` (0ms)

## Resumo
- Rotas visitadas: 49 (falhas: 0, avisos: 2)
- Smoke API: 43 (falhas: 0)
- Fluxos interativos: 22 (falhas: 0)

## Fluxos interativos
- OK Formularios essenciais possuem inputs, labels e botao (1693ms)
  - 3 formularios validados estruturalmente.
- OK Mascaras: WhatsApp e CPF formatam ao digitar (cadastro) (466ms)
  - WhatsApp="(11) 99999-0000", CPF="529.982.247-25".
- OK /api/config publica nao vaza credenciais sensiveis (15ms)
  - Config publica saneada.
- OK Login com credenciais erradas mostra erro (536ms)
  - Erro de login renderizado e usuario continua em /login.
- OK Login real com cliente nao-admin redireciona para minha-conta (2734ms)
  - Senha de teste nao bateu. Login real nao testado, mas API responde.
- OK Cadastro: validacoes de front-end + criacao real + cleanup (545ms)
  - Cliente verify-cadastro-56a7f9@example.com criado no backend (sqlite).
- OK Contato: campos requeridos, envio, persiste, restaura (1048ms)
  - Contato persistido e arquivo restaurado.
- OK Galeria: visita evento, abre modal, adiciona ao carrinho (1740ms)
  - Itens encontrados na galeria: 160.
  - Aviso: clique no item da galeria nao abriu modal visivel (pode ser link).
- OK Carrinho: pagina abre e mostra estado vazio ou itens (1240ms)
  - Pagina /carrinho carregou heading.
- OK Checkout: pagina renderiza sem erro de runtime (1599ms)
  - Checkout renderizou sem crash.
- OK Admin dashboard: header, cards, links principais (1381ms)
  - Links admin essenciais presentes (6).
- OK Admin: criar evento via formulario e remover via API (522ms)
  - Evento "Verify Deep 868f5" criado.
- OK Admin: upload de foto em evento existente (com cleanup) (1990ms)
  - Upload realizou POST ok com fixture sample.jpg.
- OK Admin: pagina de configuracoes carrega e mostra campos (1111ms)
  - 96 campos encontrados em /admin/configuracoes.
- OK Admin/personalizar: tema e cor renderizam preview (930ms)
  - 4 inputs encontrados em /admin/personalizar.
- OK Admin/marca-dagua: pagina carrega e expoe upload (1017ms)
  - 6 inputs file na pagina de marca dagua.
- OK Admin: cria, valida e deleta cupom via API (cleanup) (277ms)
  - Cupom VERIFYC7A99 criado e validado (status validar=400).
- OK LGPD: cria cliente fake, exporta, solicita, aprova e restaura (310ms)
  - Fluxo LGPD completo (export→request→approve→anonimizado).
- OK Protecao: rotas admin sem auth redirecionam para /login (7937ms)
  - 8 rotas admin redirecionam corretamente.
- OK Protecao: rotas /minha-conta sem auth redirecionam (5616ms)
  - 5 rotas /minha-conta redirecionam.
- OK API: criar comentario invalido retorna 4xx (14ms)
  - POST /api/comentarios vazio respondeu 400.
- OK Auditoria global de imagens em paginas-chave (4908ms)

## Smoke API completo
- OK GET /api/events → 200 (20ms) 
- OK GET /api/photos → 200 (154ms) 
- OK GET /api/config → 200 (13ms) 
- OK GET /api/auth/me → 200 (11ms) 
- OK GET /api/pedidos?meu=1 → 200 (9ms) 
- OK GET /api/carrinhos?meu=1 → 200 (10ms) 
- OK GET /api/rewards/me → 200 (12ms) 
- OK GET /api/auth/me → 200 (9ms) 
- OK GET /api/pedidos?admin=1 → 200 (9ms) 
- OK GET /api/clients → 200 (10ms) 
- OK GET /api/contato → 200 (10ms) 
- OK GET /api/cupons → 200 (11ms) 
- OK GET /api/notificacoes → 200 (10ms) 
- OK GET /api/comentarios?eventId=2b555113-6a7f-4b92-a097-c749985572f4 → 200 (9ms) 
- OK GET /api/remocoes → 200 (15ms) 
- OK GET /api/audit-log → 200 (268ms) 
- OK GET /api/estatisticas → 200 (11ms) 
- OK GET /api/watermark/assets → 200 (269ms) 
- OK GET /api/videos → 200 (14ms) 
- OK GET /api/chat → 200 (11ms) 
- OK GET /api/chat?count=1 → 200 (9ms) 
- OK GET /api/repasses → 200 (17ms) 
- OK GET /api/reconhecimento/config → 200 (11ms) 
- OK GET /api/reconhecimento/config → 200 (9ms) 
- OK GET /api/reconhecimento/bloqueios → 200 (10ms) 
- OK GET /api/colaboradores → 200 (283ms) 
- OK GET /api/storage/config → 200 (12ms) 
- OK GET /api/storage/migrate → 200 (10ms) 
- OK GET /api/clients → 401 (9ms) 
- OK GET /api/audit-log → 401 (10ms) 
- OK GET /api/cupons → 401 (10ms) 
- OK GET /api/auth/me → 401 (10ms) 
- OK GET /api/chat → 401 (10ms) 
- OK GET /api/repasses → 401 (10ms) 
- OK GET /api/reconhecimento/config → 401 (10ms) 
- OK GET /api/reconhecimento/bloqueios → 401 (10ms) 
- OK GET /api/colaboradores → 401 (13ms) 
- OK GET /api/notificacoes → 401 (10ms) 
- OK GET /api/storage/config → 401 (9ms) 
- OK GET /api/storage/migrate → 401 (9ms) 
- OK POST /api/auth/login → 401 (272ms) 
- OK POST /api/auth/register → 400 (272ms) 
- OK GET /api/pagamento/status → 400 (287ms) 

## Rotas com avisos
### /admin/reconhecimento
- A11y/layout: 3 input(s) sem label/aria-label.

### /admin/configuracoes
- A11y/layout: 4 input(s) sem label/aria-label.
- A11y/layout: 18 elemento(s) fora da viewport horizontal.

## Auditoria DOM por rota (resumo)
- / (anon): inputs=1, botoes=0, links=19, imagens=4, h1=1, scrollH=false, requests=25
- /login (anon): inputs=2, botoes=2, links=1, imagens=0, h1=1, scrollH=false, requests=13
- /cadastro (anon): inputs=8, botoes=5, links=1, imagens=0, h1=1, scrollH=false, requests=13
- /trocar-senha (client): inputs=0, botoes=1, links=10, imagens=2, h1=1, scrollH=false, requests=29
- /contato (anon): inputs=5, botoes=1, links=15, imagens=0, h1=1, scrollH=false, requests=17
- /carrinho (anon): inputs=0, botoes=0, links=14, imagens=0, h1=1, scrollH=false, requests=17
- /checkout (anon): inputs=0, botoes=0, links=14, imagens=0, h1=1, scrollH=false, requests=19
- /compras (anon): inputs=0, botoes=0, links=14, imagens=0, h1=1, scrollH=false, requests=15
- /minha-conta (client): inputs=0, botoes=1, links=10, imagens=2, h1=1, scrollH=false, requests=24
- /minha-conta/configuracoes (client): inputs=23, botoes=14, links=1, imagens=0, h1=1, scrollH=false, requests=18
- /minha-conta/compras (client): inputs=0, botoes=1, links=1, imagens=0, h1=1, scrollH=false, requests=20
- /minha-conta/carrinho (client): inputs=0, botoes=1, links=2, imagens=0, h1=1, scrollH=false, requests=23
- /minha-conta/favoritos (client): inputs=0, botoes=5, links=1, imagens=2, h1=1, scrollH=false, requests=29
- /minha-conta/comentarios (client): inputs=1, botoes=11, links=3, imagens=2, h1=1, scrollH=false, requests=20
- /minha-conta/notificacoes (client): inputs=0, botoes=1, links=1, imagens=0, h1=1, scrollH=false, requests=18
- /minha-conta/remocoes (client): inputs=0, botoes=1, links=1, imagens=0, h1=1, scrollH=false, requests=19
- /minha-conta/chat (client): inputs=1, botoes=2, links=1, imagens=0, h1=1, scrollH=false, requests=18
- /minha-conta/reconhecimento (client): inputs=0, botoes=1, links=1, imagens=0, h1=1, scrollH=false, requests=22
- /admin (admin): inputs=0, botoes=2, links=22, imagens=4, h1=1, scrollH=false, requests=28
- /admin/eventos (admin): inputs=5, botoes=19, links=29, imagens=3, h1=1, scrollH=false, requests=23
- /admin/criar-evento (admin): inputs=3, botoes=3, links=19, imagens=0, h1=1, scrollH=false, requests=18
- /admin/pedidos (admin): inputs=1, botoes=7, links=46, imagens=62, h1=1, scrollH=false, requests=64
- /admin/clientes (admin): inputs=1, botoes=46, links=45, imagens=0, h1=1, scrollH=false, requests=26
- /admin/contatos (admin): inputs=4, botoes=4, links=19, imagens=0, h1=1, scrollH=false, requests=20
- /admin/comentarios (admin): inputs=1, botoes=53, links=42, imagens=12, h1=1, scrollH=false, requests=27
- /admin/carrinhos (admin): inputs=0, botoes=6, links=18, imagens=0, h1=1, scrollH=false, requests=20
- /admin/remocoes (admin): inputs=0, botoes=58, links=33, imagens=8, h1=1, scrollH=false, requests=28
- /admin/cupons (admin): inputs=0, botoes=9, links=17, imagens=0, h1=1, scrollH=false, requests=22
- /admin/notificacoes (admin): inputs=0, botoes=3, links=17, imagens=0, h1=1, scrollH=false, requests=20
- /admin/propostas (admin): inputs=1, botoes=11, links=17, imagens=0, h1=1, scrollH=false, requests=22
- /admin/chat (admin): inputs=0, botoes=2, links=17, imagens=0, h1=1, scrollH=false, requests=20
- /admin/colaboradores (admin): inputs=0, botoes=2, links=17, imagens=0, h1=1, scrollH=false, requests=18
- /admin/repasses (admin): inputs=0, botoes=2, links=17, imagens=0, h1=1, scrollH=false, requests=22
- /admin/reconhecimento (admin): inputs=6, botoes=6, links=17, imagens=0, h1=1, scrollH=false, requests=24
- /admin/estatisticas (admin): inputs=2, botoes=17, links=17, imagens=0, h1=1, scrollH=false, requests=20
- /admin/marca-dagua (admin): inputs=12, botoes=30, links=23, imagens=3, h1=1, scrollH=false, requests=27
- /admin/personalizar (admin): inputs=5, botoes=16, links=21, imagens=0, h1=1, scrollH=false, requests=20
- /admin/configuracoes (admin): inputs=96, botoes=41, links=24, imagens=0, h1=1, scrollH=false, requests=26
- /admin/configuracoes/storage (admin): inputs=12, botoes=13, links=22, imagens=0, h1=1, scrollH=false, requests=22
- /admin/reset (admin): inputs=0, botoes=9, links=21, imagens=0, h1=1, scrollH=false, requests=19
- /politica-de-privacidade (anon): inputs=0, botoes=0, links=16, imagens=0, h1=1, scrollH=false, requests=14
- /termos-de-uso (anon): inputs=0, botoes=0, links=16, imagens=0, h1=1, scrollH=false, requests=14
- /politica-de-cookies (anon): inputs=0, botoes=0, links=16, imagens=0, h1=1, scrollH=false, requests=14
- /autenticidade (anon): inputs=0, botoes=0, links=16, imagens=0, h1=1, scrollH=false, requests=14
- /admin/eventos/2b555113-6a7f-4b92-a097-c749985572f4 (admin): inputs=0, botoes=20, links=19, imagens=0, h1=1, scrollH=false, requests=28
- /admin/eventos/2b555113-6a7f-4b92-a097-c749985572f4/videos (admin): inputs=0, botoes=3, links=18, imagens=0, h1=1, scrollH=false, requests=24
- /admin/upload-fotos/2b555113-6a7f-4b92-a097-c749985572f4 (admin): inputs=0, botoes=760, links=20, imagens=379, h1=1, scrollH=false, requests=52
- /clear-cache (anon): inputs=0, botoes=0, links=0, imagens=0, h1=1, scrollH=false, requests=12
- /evento/2b555113-6a7f-4b92-a097-c749985572f4 (anon): inputs=2, botoes=168, links=14, imagens=160, h1=1, scrollH=false, requests=51

## Log do servidor dev (final)
```text
=1 200 in 20ms
 GET /api/remocoes 200 in 27ms
 POST /api/events 201 in 10ms
 GET /admin/upload-fotos/2b555113-6a7f-4b92-a097-c749985572f4 200 in 68ms
 GET /api/config 200 in 9ms
 GET /api/photos?eventId=2b555113-6a7f-4b92-a097-c749985572f4 200 in 53ms
 GET /api/config 200 in 56ms
 GET /api/remocoes 200 in 60ms
 GET /api/notificacoes?count=1 200 in 62ms
 GET /api/events/2b555113-6a7f-4b92-a097-c749985572f4 200 in 66ms
 GET /api/pedidos?admin=1 200 in 70ms
 GET /api/chat?count=1 200 in 20ms
 GET /api/config 200 in 22ms
 GET /api/photos?eventId=2b555113-6a7f-4b92-a097-c749985572f4 200 in 51ms
 GET /api/events/2b555113-6a7f-4b92-a097-c749985572f4 200 in 54ms
 GET /api/config 200 in 9ms
 ✓ Compiled /api/upload in 233ms (1920 modules)
 POST /api/upload 201 in 865ms
 POST /api/photos 200 in 13ms
SyntaxError: Unexpected end of JSON input
    at JSON.parse (<anonymous>)
    at parseJSONFromBytes (node:internal/deps/undici/undici:4319:19)
    at successSteps (node:internal/deps/undici/undici:6967:27)
    at consumeBody (node:internal/deps/undici/undici:6973:9)
    at NextRequest.json (node:internal/deps/undici/undici:6912:18)
    at POST (webpack-internal:///(rsc)/./src/app/api/photos/route.js:121:36)
    at async H:\Programas\projeto-fotografo\node_modules\next\dist\compiled\next-server\app-route.runtime.dev.js:6:53238
    at async e_.execute (H:\Programas\projeto-fotografo\node_modules\next\dist\compiled\next-server\app-route.runtime.dev.js:6:44501)
    at async e_.handle (H:\Programas\projeto-fotografo\node_modules\next\dist\compiled\next-server\app-route.runtime.dev.js:6:54492)
    at async doRender (H:\Programas\projeto-fotografo\node_modules\next\dist\server\base-server.js:1372:42)
    at async cacheEntry.responseCache.get.routeKind (H:\Programas\projeto-fotografo\node_modules\next\dist\server\base-server.js:1594:28)
    at async DevServer.renderToResponseWithComponentsImpl (H:\Programas\projeto-fotografo\node_modules\next\dist\server\base-server.js:1502:28)
    at async DevServer.renderPageComponent (H:\Programas\projeto-fotografo\node_modules\next\dist\server\base-server.js:1919:24)
    at async DevServer.renderToResponseImpl (H:\Programas\projeto-fotografo\node_modules\next\dist\server\base-server.js:1957:32)
    at async DevServer.pipeImpl (H:\Programas\projeto-fotografo\node_modules\next\dist\server\base-server.js:915:25)
    at async NextNodeServer.handleCatchallRenderRequest (H:\Programas\projeto-fotografo\node_modules\next\dist\server\next-server.js:272:17)
    at async DevServer.handleRequestImpl (H:\Programas\projeto-fotografo\node_modules\next\dist\server\base-server.js:811:17)
    at async H:\Programas\projeto-fotografo\node_modules\next\dist\server\dev\next-dev-server.js:339:20
    at async Span.traceAsyncFn (H:\Programas\projeto-fotografo\node_modules\next\dist\trace\trace.js:154:20)
    at async DevServer.handleRequest (H:\Programas\projeto-fotografo\node_modules\next\dist\server\dev\next-dev-server.js:336:24)
    at async invokeRender (H:\Programas\projeto-fotografo\node_modules\next\dist\server\lib\router-server.js:174:21)
    at async handleRequest (H:\Programas\projeto-fotografo\node_modules\next\dist\server\lib\router-server.js:353:24)
    at async requestHandlerImpl (H:\Programas\projeto-fotografo\node_modules\next\dist\server\lib\router-server.js:377:13)
    at async Server.requestListener (H:\Programas\projeto-fotografo\node_modules\next\dist\server\lib\start-server.js:141:13)
 GET /admin/configuracoes 200 in 77ms
 GET /api/config 200 in 10ms
 GET /api/pedidos?admin=1 200 in 25ms
 GET /api/images/missing 200 in 29ms
 GET /api/notificacoes?count=1 200 in 31ms
 GET /api/remocoes 200 in 39ms
 GET /api/config 200 in 40ms
 GET /api/chat?count=1 200 in 42ms
 GET /api/images/missing 200 in 13ms
 GET /api/config 200 in 14ms
 GET /api/config 200 in 8ms
 GET /api/rewards 200 in 18ms
 GET /api/config 200 in 20ms
 GET /api/rewards 200 in 14ms
 GET /api/config 200 in 14ms
 GET /admin/personalizar 200 in 60ms
 GET /api/config 200 in 11ms
 GET /api/pedidos?admin=1 200 in 22ms
 GET /api/notificacoes?count=1 200 in 24ms
 GET /api/chat?count=1 200 in 24ms
 GET /api/config 200 in 24ms
 GET /api/remocoes 200 in 32ms
 GET /api/config 200 in 8ms
 GET /api/config 200 in 8ms
 GET /admin/marca-dagua 200 in 72ms
 GET /api/config 200 in 9ms
 GET /api/config 200 in 8ms
 GET /api/config 200 in 26ms
 GET /api/watermark 200 in 30ms
 GET /api/events?stats=1 200 in 34ms
 GET /api/pedidos?admin=1 200 in 35ms
 GET /api/remocoes 200 in 40ms
 GET /api/watermark/regenerar 200 in 44ms
 GET /api/notificacoes?count=1 200 in 44ms
 GET /api/chat?count=1 200 in 24ms
 GET /api/watermark 200 in 25ms
 GET /api/events?stats=1 200 in 30ms
 GET /api/watermark/regenerar 200 in 30ms
 GET /api/config 200 in 32ms
 POST /api/cupons 201 in 9ms
 ✓ Compiled /api/cupons/validar in 211ms (1897 modules)
 POST /api/cupons/validar 400 in 258ms
 ✓ Compiled /api/clients/lgpd in 208ms (1899 modules)
 GET /api/clients/lgpd 200 in 248ms
 POST /api/clients/lgpd 200 in 10ms
 PATCH /api/clients/lgpd 200 in 32ms
 GET /admin 200 in 43ms
 GET /api/config 200 in 16ms
 GET /api/config 200 in 12ms
 ✓ Compiled /admin/eventos in 190ms (1903 modules)
 GET /admin/eventos 200 in 301ms
 GET /api/config 200 in 17ms
 GET /api/config 200 in 10ms
 GET /admin/configuracoes 200 in 54ms
 GET /api/config 200 in 14ms
 GET /api/config 200 in 12ms
 GET /admin/cupons 200 in 78ms
 GET /api/config 200 in 21ms
 GET /api/config 200 in 15ms
 GET /admin/colaboradores 200 in 89ms
 GET /api/config 200 in 16ms
 GET /api/config 200 in 13ms
 GET /admin/repasses 200 in 86ms
 GET /api/config 200 in 16ms
 GET /api/config 200 in 11ms
 GET /admin/reconhecimento 200 in 85ms
 GET /api/config 200 in 17ms
 GET /api/config 200 in 12ms
 GET /admin/chat 200 in 47ms
 GET /api/config 200 in 16ms
 GET /api/config 200 in 13ms
 GET /minha-conta 200 in 89ms
 GET /api/config 200 in 12ms
 GET /api/config 200 in 10ms
 ✓ Compiled /minha-conta/configuracoes in 213ms (1900 modules)
 GET /minha-conta/configuracoes 200 in 315ms
 GET /api/config 200 in 15ms
 GET /api/config 200 in 12ms
 ✓ Compiled /minha-conta/compras in 218ms (1896 modules)
 GET /minha-conta/compras 200 in 331ms
 GET /api/config 200 in 17ms
 GET /api/config 200 in 12ms
 ✓ Compiled /minha-conta/chat in 212ms (1900 modules)
 GET /minha-conta/chat 200 in 313ms
 GET /api/config 200 in 16ms
 GET /api/config 200 in 13ms
 GET /minha-conta/reconhecimento 200 in 65ms
 GET /api/config 200 in 15ms
 GET /api/config 200 in 13ms
 POST /api/comentarios 400 in 13ms
 ✓ Compiled / in 231ms (1904 modules)
 GET / 200 in 313ms
 GET /api/config 200 in 26ms
 GET /api/photos 200 in 163ms
 GET /api/events 200 in 165ms
 GET /api/auth/me 200 in 167ms
 GET /api/config 200 in 155ms
 GET /api/photos 200 in 143ms
 GET /api/events 200 in 145ms
 GET /api/auth/me 200 in 147ms
 GET /api/config 200 in 146ms
 GET /api/photos 200 in 141ms
 GET /api/config 200 in 133ms
 GET /api/config 200 in 8ms
 GET /api/config 200 in 10ms
 GET /admin 200 in 77ms
 GET /api/config 200 in 9ms
 GET /api/config 200 in 8ms
 GET /api/events 200 in 24ms
 GET /api/photos 200 in 142ms
 GET /api/remocoes 200 in 148ms
 GET /api/pedidos?admin=1 200 in 152ms
 GET /api/notificacoes?count=1 200 in 153ms
 GET /api/chat?count=1 200 in 155ms
 GET /api/events 200 in 150ms
 GET /api/photos 200 in 134ms
 GET /api/pedidos?admin=1 200 in 136ms
 GET /api/photos 200 in 132ms
 GET /api/pedidos?admin=1 200 in 134ms
 GET /admin/eventos 200 in 61ms
 GET /api/config 200 in 10ms
 GET /api/events?stats=1 200 in 27ms
 GET /api/pedidos?admin=1 200 in 30ms
 GET /api/config 200 in 31ms
 GET /api/remocoes 200 in 37ms
 GET /api/chat?count=1 200 in 38ms
 GET /api/notificacoes?count=1 200 in 41ms
 GET /api/events?stats=1 200 in 23ms
 GET /contato 200 in 72ms
 GET /api/config 200 in 14ms
 GET /api/auth/me 200 in 16ms
 GET /api/config 200 in 15ms
 GET /api/auth/me 200 in 14ms
 GET /api/config 200 in 10ms
 GET /api/config 200 in 7ms
 GET /api/config 200 in 8ms
 GET /api/config 200 in 8ms
```