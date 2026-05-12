# Manual do Fotógrafo

Bem-vindo. Este manual é o seu guia de operação da plataforma no dia a dia: como publicar um álbum, subir fotos, definir preços, receber pagamentos e atender pedidos dos clientes. Não é obrigatório ser programador para usar o sistema — todas as rotinas descritas aqui estão disponíveis no painel administrativo.

> Destinado principalmente a fotógrafos de **eventos esportivos** (corridas de rua, travessias, ciclismo, motocross, rodeios, cavalgadas, campeonatos, torneios) e por extensão a qualquer evento de grande volume: festivais, shows, casamentos, formaturas.

---

## Índice

1. [Antes do evento](#1-antes-do-evento)
2. [Criando um álbum novo](#2-criando-um-album-novo)
3. [Enviando as fotos](#3-enviando-as-fotos)
4. [Ajustando preço e organização](#4-ajustando-preco-e-organizacao)
5. [Publicando o álbum](#5-publicando-o-album)
6. [Divulgando para os clientes](#6-divulgando-para-os-clientes)
7. [Acompanhando vendas](#7-acompanhando-vendas)
8. [Liberando fotos manualmente (pagamento por fora)](#8-liberando-fotos-manualmente-pagamento-por-fora)
9. [Atendendo pedidos de remoção](#9-atendendo-pedidos-de-remocao)
10. [Moderando comentários](#10-moderando-comentarios)
11. [Clientes e contas](#11-clientes-e-contas)
12. [Marca d'água](#12-marca-dagua)
13. [Descontos progressivos](#13-descontos-progressivos)
14. [Pagamento: Asaas, Stripe e manual](#14-pagamento-asaas-stripe-e-manual)
15. [Reembolso](#15-reembolso)
16. [Boas práticas de preço](#16-boas-praticas-de-preco)
17. [Backup e segurança](#17-backup-e-seguranca)
18. [Perguntas frequentes](#18-perguntas-frequentes)

---

## 1. Antes do evento

Antes da primeira venda garanta que o estúdio está configurado:

1. Entre no painel em `/admin/configuracoes`.
2. Preencha **nome do estúdio**, **WhatsApp**, **Instagram**, **CPF/CNPJ**, **razão social** e **localização**.
3. Faça upload da marca d'água no painel **Marca d'água** (`/admin/marca-dagua`).
4. Defina o **preço global padrão** por foto. Esse preço vai ser herdado por qualquer álbum que não tenha preço próprio.
5. Configure **descontos globais progressivos** (veja a seção 13).
6. Configure o gateway de pagamento (Asaas e/ou Stripe). Veja a seção 14.

Uma vez configurado, você raramente precisa voltar aqui.

---

## 2. Criando um álbum novo

Um **álbum** (internamente chamado de *evento*) é o contêiner de todas as fotos de uma cobertura.

1. No painel, clique em **Álbuns → Novo álbum** (ou vá direto em `/admin/criar-evento`).
2. Preencha:
   - **Nome** (ex.: "Corrida da Serra 2026 — 5km")
   - **Data** do evento (botão "hoje" preenche com a data atual)
   - **Data final** opcional (quando o evento dura mais de um dia)
   - **Categoria** (corrida, cavalgada, casamento etc.)
   - **Cidade / estado**
   - **Descrição** curta que aparece na listagem
   - **Preço padrão por foto** (deixa em branco para usar o global)
   - **Descontos progressivos** (pode herdar do global)
   - **Álbum gratuito** (ligado = todas as fotos liberadas para download sem pagar)
3. Salve. O álbum nasce no estado **privado**. Ele só aparece no site público quando você mudar para `listado` (ou `não-listado` se quiser acesso por link direto).
4. **Enquanto o álbum estiver privado**, ele é visível somente para você. Você pode mandar o link para testar com outra conta.

> Dica: pode criar o álbum antes do evento começar, subir a capa, tirar foto pelo celular da largada/chegada e já deixar pronto.

---

## 3. Enviando as fotos

Vá em **Álbum → aba Fotos** ou diretamente em `/admin/upload-fotos/[eventId]`.

- **Arraste e solte** as fotos na área de upload (ou clique para abrir o explorador).
- O upload começa **imediatamente** ao selecionar, não precisa clicar em "enviar".
- 3 uploads rodam em paralelo.
- Cada foto é processada no servidor: o original vai para `storage/originals/{álbum}/`, e as derivadas (modal 1600px, galeria 400px, mini 90px, capa 400px) são geradas em `public/uploads/` — com e sem marca d'água.
- Se uma foto tiver o **mesmo nome** e **mesmo tamanho** de uma já enviada ao álbum, ela não duplica — o item aparece em cor diferente na fila e o sistema mostra quantas foram ignoradas por duplicidade.
- EXIF (`DateTimeOriginal`) é lido automaticamente e usado para ordenar as fotos.
- O **autor** é gravado como a conta que fez o upload. Se você tem assistente/auxiliar com conta admin, o nome dele aparece nas fotos que ele subir.

Ao fim do upload, a fila mostra:

- `X arquivos enviados com sucesso`
- `Y arquivos não processados por já existirem no álbum`

Se der erro de memória ou timeout no servidor, tente reduzir o lote. O ideal é subir em lotes de 100–200 fotos (até 10–15 GB). Em cima disso o navegador pode travar.

---

## 4. Ajustando preço e organização

### Preço por foto

- O preço padrão vem do álbum (ou do global, se o álbum não tem).
- Na **aba Fotos** você pode:
  - Editar o preço de uma foto individual.
  - Selecionar várias fotos e aplicar novo preço em lote.
  - Marcar uma foto como **grátis** (o cliente baixa o original direto, sem precisar comprar).

### Organização por pastas

- Toda foto nasce na raiz do álbum.
- Você pode criar pastas dentro do álbum (ex.: "Largada", "Chegada", "Pódio") e mover fotos para lá.
- O botão **Mover** permite transferir várias fotos de uma vez.
- A pasta aparece como um card na galeria pública, com a sua própria capa (você escolhe a foto de capa da pasta).

### Foto de capa do álbum

- Na **aba Fotos**, clique em qualquer foto e selecione **"Definir como capa"**.
- O sistema gera automaticamente um `cover_xxx.jpg` de 400px otimizado, sem marca d'água por padrão.
- Se quiser marca d'água na capa, ative **WM capa** na aba *Marca d'água* do álbum. O sistema regenera a capa na hora.

### Foto gratuita

- Marcar uma foto como grátis:
  - Libera o download direto do original.
  - Remove a marca d'água das miniaturas e do modal (se você preferiu gerar versões sem WM).
  - Não entra em carrinho com preço.

### Álbum inteiro gratuito

- Em *Informações do álbum*, ative **"Álbum grátis"**. Vira uma cobertura cortesia: todas as fotos liberadas.

---

## 5. Publicando o álbum

O álbum tem 3 estados de visibilidade:

| Estado | Quem vê |
| --- | --- |
| **Privado** | Só você (admin) |
| **Não-listado** | Quem tem o link direto |
| **Listado** | Aparece na home e na busca |

Para virar listado o álbum precisa ter:

- nome preenchido
- data do evento
- ao menos uma foto publicada
- (recomendado) foto de capa definida

Você muda a visibilidade no cabeçalho do álbum ou direto na listagem de eventos, clicando na badge colorida.

---

## 6. Divulgando para os clientes

Cada álbum tem:

- **Link direto**: `https://seusite.com/evento/{ID público}` (o ID começa em `3xxxxxxxx`).
- **QR code** gerado automaticamente — útil para imprimir em flyer ou mostrar no celular no local do evento.
- **Atalho no WhatsApp**: botão que já abre a conversa com a mensagem pronta.

No painel:

- O dashboard tem botões para *Ver site*, *Copiar URL*, *QR code*.
- Na tela detalhada do álbum você encontra o mesmo com o QR code específico do álbum.

Boas práticas de divulgação para evento esportivo:

- Publique **no mesmo dia** o álbum (nem que seja marcado como *não-listado* e seja liberado depois com as fotos tratadas).
- Mande o link para a **página do evento no Instagram** antes de entregar para os clientes, para ganhar alcance orgânico.
- No grupo de WhatsApp do evento: poste o link junto com foto de capa atraente.
- Imprima o QR code e deixe na tenda da organização.

---

## 7. Acompanhando vendas

### Dashboard (`/admin`)

- **Totais**: eventos, fotos, vendas, receita confirmada.
- **Últimos pedidos**: clique para abrir o detalhe (mini-thumbs sem marca d'água, WhatsApp clicável do cliente, botão de baixar o original, botão de liberar manualmente se o cliente pagou por fora).
- **Eventos recentes**: mostra também o faturamento.

### Pedidos (`/admin/pedidos`)

- Listagem expansível com filtro por status (pendente, pago, liberado manualmente, cancelado, reembolsado).
- Cada pedido mostra método de pagamento, parcelas, mini-thumbs das fotos, valor, desconto aplicado e cliente.
- Você pode:
  - Marcar como revisado (flag `reviewed`).
  - Adicionar **notas privadas** (só admin vê) ou **notas públicas** (cliente vê no histórico).
  - Liberar manualmente (vira `liberado_manual`).
  - Mudar status manualmente (útil para corrigir um caso estranho).
  - Baixar os originais para conferir/reenviar.
  - Abrir WhatsApp do cliente.
  - Ver histórico do gateway (tentativas, webhook, parcelamento).

### Carrinhos ativos (`/admin/carrinhos`)

- Mostra quem tem fotos no carrinho **mas ainda não finalizou**.
- Cada linha expande para mostrar as fotos.
- Ações: ajustar preço em lote, liberar manualmente, limpar o carrinho.

### Relatórios por álbum

Abra o álbum → aba **Relatórios**:

- Total de visitas.
- Total de fotos vendidas e faturamento.
- Ticket médio.
- Vendas por cliente (útil para identificar seus melhores compradores).
- Vendas por pasta (qual parte do evento vendeu mais).
- Vendas por faixa de horário (EXIF).

---

## 8. Liberando fotos manualmente (pagamento por fora)

Acontece quando o cliente quer pagar no PIX direto na sua conta, ou em dinheiro, ou via cartão na maquininha no local do evento.

No painel admin, você tem duas formas:

1. **Cliente já tem carrinho no sistema**
   - Vá em `/admin/carrinhos` ou na aba **Carrinhos Ativos** dentro do álbum.
   - Encontre o carrinho do cliente.
   - Clique em **Liberar**. Confirme digitando que quer entregar as fotos.
   - O carrinho vira um **pedido pago** com `paymentMethod = liberado_manual`, visível para você e para o cliente em *Minha conta → Compras*.

2. **Cliente nem conta tem**
   - No dashboard ou em `/admin/pedidos`, clique em **Novo pedido manual**.
   - Preencha nome, WhatsApp e CPF.
   - Adicione as fotos.
   - Aplique desconto, se for o caso, e salve já como pago.
   - O link de download do pedido cai no seu painel — copie e envie pelo WhatsApp do cliente.

> Um pedido `liberado_manual` **não** entra no faturamento automático do dashboard como "receita confirmada de gateway". Se você quiser acompanhar separado, o filtro no painel de pedidos ajuda.

---

## 9. Atendendo pedidos de remoção

A LGPD dá ao retratado o direito de pedir a remoção de imagem. O sistema tem um fluxo pronto:

- O cliente pede a remoção direto pelo modal da foto (botão **Solicitar remoção**).
- No formulário ele informa nome, CPF e **WhatsApp ou e-mail** (um dos dois é obrigatório).
- O pedido cai em `/admin/remocoes` com status `pendente`.

Como admin você decide:

- **Aceitar** → a foto vira `removida` em `photos.json`, é tirada da galeria pública, dos carrinhos e dos favoritos automaticamente. Mesmo que já esteja vendida, fica marcada — e você decide se quer apagar o arquivo fisicamente depois.
- **Rejeitar** → você precisa registrar um **comentário público** justificando (por exemplo: "foto tirada em evento público, de grande número de pessoas, sem destaque exclusivo"). O cliente vê esse comentário.
- **Desfazer** → sempre possível. A foto volta ao álbum.

Sempre adicione um **comentário interno** com o que você conversou com o cliente (histórico).

### Boas práticas jurídicas

- Foto tirada em **local público** de evento público **não** tem obrigação automática de remoção, mas a LGPD considera critérios como:
  - imagem com destaque exclusivo sobre a pessoa,
  - constrangimento ou situação vexatória,
  - uso comercial sem consentimento.
- Quando **o cliente tem razão**, remova rapidamente.
- Quando **o cliente não tem razão**, responda educadamente explicando o contexto e mantenha a foto.
- Em caso de dúvida, remova e converse depois.

Consulte também [`docs/SEGURANCA_E_LGPD.md`](SEGURANCA_E_LGPD.md) para o checklist completo.

---

## 10. Moderando comentários

- Comentários podem aparecer no álbum e em cada foto (árvore com replies e likes).
- Em `/admin/comentarios` você vê tudo num lugar só.
- Ações:
  - **Omitir** → o comentário fica invisível para o público (preserva o histórico).
  - **Restaurar** → desfaz a omissão.
  - **Editar como admin** → raro, use só para corrigir palavrão grave ou similar. Edições entram no histórico.
- O sistema aplica **rate limit** automático para evitar spam.

---

## 11. Clientes e contas

- Em `/admin/clientes` você vê as contas cadastradas.
- Cada cliente tem: nome completo, e-mail, WhatsApp, CPF, data de nascimento, histórico de compras e carrinho.
- Você pode:
  - Editar dados (nome, contato etc.).
  - Resetar a senha. O sistema gera uma senha temporária copiável; no próximo login o cliente é obrigado a trocar.
  - **Desativar** a conta — ela é desconectada em todos os dispositivos imediatamente e não consegue entrar mais até ser reativada.
  - Adicionar **notas internas** (só admins veem) sobre o cliente.
  - Ver as reclamações (remoções) dele.

Conta **admin** tem acesso ao painel. O painel do cliente mostra uma aba "Área do fotógrafo" para quem tem a flag admin.

---

## 12. Marca d'água

A marca d'água protege suas fotos da pirataria casual. O sistema aplica a marca diretamente no pixel (não é overlay JS, não dá para remover pelo F12 do navegador).

### Onde a marca vai

Cada variante de imagem tem uma versão **com** e uma **sem** marca d'água:

| Variante | Tamanho | Uso | Padrão |
| --- | --- | --- | --- |
| `grid` | 1600px | modal do cliente | **com marca** |
| `thumbs` | 400px | galeria do álbum | **com marca** |
| `mini` | 90px | miniatura interna (painel admin, carrinho) | sem marca |
| `covers` | 400px | capa do álbum | sem marca |

A lógica é simples: quanto maior e mais útil como "produto final", mais protegida.

### Configurando (`/admin/marca-dagua`)

- Suba um PNG transparente (quanto menor o PNG, mais rápido o processamento).
- Configure por variante:
  - **Anchor**: 9 posições (top-left, top-center, top-right, middle-left, center, middle-right, bottom-left, bottom-center, bottom-right).
  - **Opacidade**: 0–100%. Padrão: 80%.
  - **Scale**: 5–200% (tamanho relativo à foto).
  - **Size mode**: proporcional (mantém proporção), fit (couber dentro) ou fill (toma o espaço todo).
  - **Offset X/Y**: empurra a marca em pixels.
- Use o **preview** para ver o resultado antes de aplicar.

### Sobrescrita por álbum

Dentro do álbum, aba **Marca d'água**:

- Ative **Override** para usar uma marca diferente da global.
- Escolha um asset salvo ou configure parâmetros próprios.
- Toggle `wm_capa` → capa com marca (padrão desligado).
- Toggle `wm_miniaturas` → mini-thumbs com marca (padrão desligado).
- Botão **Regenerar capa** → refaz apenas o `cover_xxx.jpg` do álbum.
- Botão **Regenerar miniaturas** → refaz todas as thumbs e minis do álbum.

### Regeneração em lote

- No painel `/admin/marca-dagua` você pode **regenerar tudo** ou selecionar álbuns específicos.
- Use esse botão quando:
  - Trocar o PNG da marca.
  - Mudar opacidade ou posição.
  - Trocar qualidade ou tamanho das derivadas.
- A barra de progresso mostra `X/Y processadas` e o tempo estimado.
- Você pode continuar usando o painel normalmente enquanto regenera.

---

## 13. Descontos progressivos

Ofereça desconto cumulativo por volume — isso normalmente multiplica o ticket médio em 2x a 4x.

### Estrutura

Cada faixa é uma dupla `{ quantidade, desconto }`:

- **quantidade**: mínimo de fotos do mesmo evento para a faixa valer.
- **desconto**: percentual que incide sobre o subtotal daquele evento.

Exemplo de escada que funciona bem para corridas:

| Compra | Desconto |
| --- | --- |
| 3 fotos | 12% |
| 5 fotos | 24% |
| 7 fotos | 32% |
| 9 fotos | 36% |

O sistema aplica a **maior** faixa elegível. Se o cliente tem 6 fotos no mesmo evento, ele ganha 24% (faixa de 5).

### Onde configurar

- **Global**: `/admin/configuracoes` → *Descontos globais*. Vale para todo álbum novo que não tiver regra própria.
- **Por álbum**: aba **Preços & Descontos**. Se preencher aqui, ignora a global.

### Como aparece para o cliente

- Na galeria do evento: cards mostrando "Ganhe X% em 3 fotos", "Ganhe Y% em 5 fotos" etc.
- No carrinho: preço original riscado + preço com desconto na frente, e linha de *Desconto aplicado* no resumo.
- No checkout: também mostra o que falta para a próxima faixa ("faltam 2 fotos para ganhar mais 10%").

### Dica de estratégia

- Comece generoso: 12% a partir de 3 fotos já disparar as escolhas.
- O salto mais importante é o **primeiro** (1 foto → 3 fotos).
- Não crie faixa acima de 40%. Compromete a margem e incentiva pirataria.

---

## 14. Pagamento: Asaas, Stripe e manual

### Asaas

Recomendado para o Brasil — aceita PIX e cartão com emissão de nota fiscal.

1. Crie conta no Asaas (`https://www.asaas.com`).
2. Em `/admin/configuracoes`, cole a **API key** e o **wallet ID**.
3. Ative o ambiente (sandbox para testes, produção para valer).
4. Configure o webhook em `https://seusite.com/api/pagamento/webhook/asaas` com os eventos `PAYMENT_RECEIVED` e `PAYMENT_CONFIRMED`.

### Stripe

Útil quando o cliente é estrangeiro ou quando você já usa Stripe em outro produto.

1. Crie conta no Stripe (`https://stripe.com`).
2. Gere **public key** e **secret key**.
3. Configure o webhook em `https://seusite.com/api/pagamento/webhook/stripe` com o evento `charge.succeeded`.
4. O Stripe pede `STRIPE_WEBHOOK_SECRET` em variável de ambiente para verificar a assinatura.

### Gateway ativo e fallback

- Em `/admin/configuracoes → Pagamento`, escolha o **gateway ativo** e um **fallback** opcional.
- Se o gateway ativo falhar na criação da cobrança, o sistema tenta o fallback automaticamente.
- Métodos ativos: marque `pix` e/ou `cartao`.

### Modo manual / simulação

- Útil para demonstração ou para cobrar por fora.
- No checkout, você pode gerar um pedido com `paymentMethod = manual` (é marcado como "pagamento por fora").
- Pedidos simulados aparecem com indicação clara em todos os painéis ("pagamento simulado").

### Taxa e tempo de PIX Asaas

- O PIX do Asaas exige **no mínimo R$ 5,00** para finalizar.
- A confirmação do banco **pode levar até 5 minutos** mesmo depois do cliente ter pagado. Deixe isso claro na tela de sucesso.

---

## 15. Reembolso

O cliente pode solicitar reembolso dentro da sua conta, por foto específica ou pelo pedido inteiro, com justificativa obrigatória e chave PIX dele.

Fluxo:

1. Cliente solicita em **Minha conta → Compras**.
2. Pedido aparece em `/admin/pedidos` com status de reembolso `solicitado`.
3. Você avalia, aceita ou nega:
   - **Aceitar** → faça a transferência PIX manual para a chave informada pelo cliente, depois clique em **Marcar como concluído**.
   - **Negar** → exige comentário com a justificativa (o cliente vê).
4. Se aceito, o cliente perde acesso ao download e o pedido fica marcado como `reembolsado` (no todo ou na parte indicada).

### Regras sugeridas

- Só aceite reembolso se:
  - a foto saiu desfocada / com defeito grave,
  - o cliente comprou a foto errada (mesmo evento, pessoa errada) e pede a troca,
  - você entendeu que o valor cobrado foi abusivo em relação ao que foi entregue.
- **Não** aceite reembolso por simples desistência — deixe isso claro nas políticas.

---

## 16. Boas práticas de preço

### Não vender barato demais

- PIX do Asaas: **taxa fixa de R$ 0,99** + % por transação.
- Cartão: 3–5% + parcelas.
- Se você cobra R$ 3 por foto, a taxa come quase tudo. Você sai no prejuízo quando considera o tempo de edição.

O sistema alerta quando você tenta colocar preço **abaixo de R$ 5**. Confirme com consciência.

### Piso e teto

- Preço mínimo: R$ 1,49 (permite vender foto "simbólica" em cortesia).
- Preço máximo: R$ 9.999,99.

### Formato do valor

- Aceita vírgula ou ponto (`12,5` ou `12.5`).
- Formata automaticamente como `R$ 12,50` com sempre 2 casas decimais.

### Sugestões por tipo de evento

| Tipo | Faixa sugerida por foto |
| --- | --- |
| Corrida de rua amadora | R$ 10 – R$ 18 |
| Triatlo / travessia | R$ 15 – R$ 25 |
| Cavalgada / rodeio | R$ 12 – R$ 20 |
| Casamento (prévia) | R$ 25 – R$ 60 |
| Casamento (cerimônia) | Pacote fechado à parte |
| Motocross / automobilismo | R$ 18 – R$ 30 |
| Festival / show | R$ 8 – R$ 15 |

Combine com desconto progressivo agressivo (12% / 24% / 32% / 36%).

---

## 17. Backup e segurança

### Backup diário recomendado

- Copie a pasta `data/` (todos os JSONs).
- Copie a pasta `storage/originals/` (originais protegidos).
- Opcionalmente copie `public/uploads/` (derivadas — podem ser regeneradas, mas demora).

Um script simples em Windows:

```bat
robocopy data D:\backup\projeto-fotografo\data /MIR
robocopy storage D:\backup\projeto-fotografo\storage /MIR
```

No Linux / Mac:

```bash
rsync -av --delete data/ /mnt/backup/projeto-fotografo/data/
rsync -av --delete storage/ /mnt/backup/projeto-fotografo/storage/
```

### O que **nunca** fazer

- **Nunca** subir `data/config.json` para o GitHub — ele contém as chaves do Asaas/Stripe.
- **Nunca** compartilhar o link direto de `public/uploads/<arquivo>.jpg` que não tenha prefixo `wm_`, `thumb_`, `mini_` ou `cover_` — o middleware bloqueia isso, mas não arrisque.
- **Nunca** deletar manualmente os JSONs em `data/` sem ter backup.

### Recuperando de um problema

- **Derivadas corrompidas ou fora do padrão**: rode `npm run images:normalize`.
- **Cliente reclamando que não recebeu e-mail de confirmação**: copie o link do pedido em `/admin/pedidos` e mande no WhatsApp. (O sistema ainda não envia e-mail automático — está na roadmap.)
- **Senha de admin perdida**: abra o console Node e:
  ```bash
  node -e "const {hashPassword}=require('./src/lib/auth.js'); console.log(hashPassword('novaSenha'))"
  ```
  Cole o hash resultante no campo `senha` da sua conta em `data/clients.json`.

---

## 18. Perguntas frequentes

**Preciso servidor dedicado?**
Não no primeiro momento. Uma máquina com Node.js 18+ e 16 GB de RAM aguenta muito bem alguns milhares de fotos e dezenas de vendas por dia.

**Funciona em hospedagem barata tipo Hostinger/Locaweb?**
Não. Como usamos `sharp` no backend e armazenamos arquivos no disco, você precisa de uma VPS (Hetzner, DigitalOcean, Contabo, Oracle Free Tier) ou hospedagem com Node.

**Consigo rodar no Vercel?**
Parcialmente. O Vercel não tem disco persistente — você precisaria migrar os JSONs para um banco e os arquivos para um bucket (S3, R2). Está planejado, mas ainda não pronto.

**Dá para usar em cobertura ao vivo (entrega durante o evento)?**
Sim. Rode o servidor em um notebook ou VPS próxima, use um link direto para o álbum *não-listado*, e o cliente já compra enquanto a prova acontece. Só garanta Wi-Fi bom no local.

**Posso ter mais de uma marca d'água diferente por álbum?**
Sim. Por álbum, ative o override e escolha um asset específico do painel *Marca d'água*.

**Cliente comprou e perdeu o link?**
Ele pode fazer login (ou usar o link guest recebido por WhatsApp) e acessar em **Minha conta → Compras**.

**Uma pessoa quer a foto dela removida e não é cliente registrada — como?**
Ela pode abrir a foto no site, clicar em **Solicitar remoção**, e preencher o formulário com CPF e WhatsApp ou e-mail. Não precisa de login.

**Posso vender vídeos?**
Ainda não. Está na roadmap (BE-51 no backlog).

**Posso ter mais de um fotógrafo com o mesmo site?**
Sim — crie uma conta admin para cada colaborador. Cada upload registra o autor. Divisão financeira entre colaboradores está planejada (BE-53), mas ainda não pronta.

---

## Próximos passos recomendados para quem está começando

1. Configure o estúdio em `/admin/configuracoes`.
2. Suba uma marca d'água em `/admin/marca-dagua`.
3. Crie um **álbum de teste** privado e suba 10 fotos.
4. Teste o checkout em **modo manual** (sem cobrar ninguém).
5. Faça o login do "outro lado": crie uma conta de cliente de teste e veja a galeria como se fosse comprador.
6. Só depois ative os gateways reais (Asaas/Stripe).
7. Faça o primeiro evento real em escala pequena para pegar o jeito.

Boas fotos e boas vendas.
