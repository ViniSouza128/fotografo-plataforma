# Pagamentos — Asaas, Stripe, Mercado Pago e PagSeguro

Documentação completa dos 4 gateways suportados e como configurar cada um no painel admin.

## Modelo geral

O sistema funciona com **gateway primário + fallback** por método de pagamento (PIX e cartão configurados separadamente). Se o primário falhar ao criar a cobrança, o fallback assume.

```
┌──────────────────────────────┐
│  /admin/configuracoes        │
│  (Pagamento)                 │
└──────────────┬───────────────┘
               │ data/config.json → "pagamento"
               │
       ┌───────┴────────┐
       │  src/lib/      │
       │  payment.js    │  ← dispatcher por gateway
       └───────┬────────┘
               │
   ┌───────────┼───────────┬────────────┬─────────────┐
   ▼           ▼           ▼            ▼             ▼
┌────────┐ ┌────────┐ ┌────────────┐ ┌──────────┐ ┌──────────┐
│ Asaas  │ │ Stripe │ │MercadoPago │ │PagSeguro │ │ Manual   │
│ PIX +  │ │ PIX +  │ │  PIX +     │ │ PIX +    │ │ (sem     │
│ Cartão │ │ Cartão │ │  Cartão    │ │ Cartão   │ │  cobrar) │
└────────┘ └────────┘ └────────────┘ └──────────┘ └──────────┘
   │           │            │            │
   │           │            │            │
   └─────┬─────┴─────┬──────┴──────┬─────┘
         │           │             │
   ┌─────▼─────┬─────▼──────┬──────▼──────┐
   │ /webhook/ │ /webhook/  │  /webhook/  │  ← confirmam pagamento
   │  asaas    │  stripe    │  mercadopago│   automaticamente
   │           │            │  pagseguro  │
   └───────────┴────────────┴─────────────┘
```

Todos os 4 gateways suportam **PIX** e **cartão** (com nuances).

---

## Configuração no painel admin

Vá em `/admin/configuracoes` → seção **💳 Gateway de Pagamento**.

### 1. Escolha o gateway primário e fallback por método

Na grade superior:
- **PIX**: gateway primário e fallback (use Asaas ou Mercado Pago — ambos têm PIX nativo barato no BR).
- **Cartão**: gateway primário e fallback (Mercado Pago e PagSeguro têm parcelamento robusto).

> Recomendação para Brasil: **PIX → Mercado Pago / Asaas** · **Cartão → Mercado Pago / PagSeguro**.

### 2. Marque os métodos aceitos

Seção "Métodos de Pagamento Aceitos": chequemark PIX e/ou Cartão.

### 3. Cole as credenciais do gateway escolhido

Cada gateway tem um bloco com botão **"📖 como configurar"** que mostra passo-a-passo inline.

---

## Mercado Pago — passo a passo

### Sandbox (testes)

1. Crie conta em <https://www.mercadopago.com.br>.
2. Acesse <https://www.mercadopago.com.br/developers/panel/app> → **"Criar aplicação"** → escolha "Pagamentos online" + "Marketplace nao".
3. Na tela da aplicação → seção **Credenciais de teste**:
   - Copie **Public Key** (começa com `TEST-`).
   - Copie **Access Token** (começa com `TEST-`).
4. No painel admin → **Mercado Pago — Sandbox**: cole as duas chaves.
5. Salve.

### Produção

1. Mesma aplicação → **Credenciais de produção** (você precisa ter dados bancários validados na conta).
2. Public Key e Access Token começam com `APP_USR-`.
3. Cole no painel admin → **Mercado Pago — Produção**.

### Webhook

1. Painel MP da aplicação → **Webhooks** → **Configurar notificações**.
2. Em "URL de produção", cole: `https://SEU-DOMINIO/api/pagamento/webhook/mercadopago`
3. Marque o tópico **"Pagamentos"** (não precisa dos outros).
4. Em **Chave secreta** (logo abaixo): copie a string e cole em `.env.local` na raiz do projeto:
   ```env
   MERCADOPAGO_WEBHOOK_SECRET=COLE_AQUI
   ```
5. Reinicie o servidor.

> Sem o secret no `.env.local` o webhook ainda funciona, mas aceita qualquer notificação que chegar — mais arriscado em produção. Em dev/sandbox pode deixar em branco.

### Cartões de teste (sandbox)

| Resultado esperado | Número | CVV | Validade |
|---|---|---|---|
| Aprovado | 5031 4332 1540 6351 | 123 | 11/30 |
| Recusado por fundos | 5031 4332 1540 6351 + nome **OTHE** | 123 | 11/30 |
| Pendente | 5031 4332 1540 6351 + nome **CONT** | 123 | 11/30 |

Mais em <https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/integration-test/test-cards>.

---

## PagSeguro / PagBank — passo a passo

### Sandbox

1. Crie conta em <https://sandbox.pagseguro.uol.com.br>.
2. Painel **Sandbox** → **Vendas → Conexões**.
3. Clique em **"Criar Token"** com escopo `Pagamentos`.
4. Copie o token longo (hexadecimal de 64+ chars).
5. Painel admin → **PagSeguro — Sandbox** → cole.

### Produção

1. Conta validada em <https://pagseguro.uol.com.br> (com CPF/CNPJ verificado).
2. Painel → **Vendas → Conexões → "Gerar API Token"** com escopo `Pagamentos`.
3. Cole no painel admin → **PagSeguro — Produção**.

### Webhook

1. Painel → **Vendas → Notificações de transação** (em sandbox: **Configurações de notificação**).
2. URL: `https://SEU-DOMINIO/api/pagamento/webhook/pagseguro`
3. (Opcional, recomendado) Defina uma **chave secreta** e copie para `.env.local`:
   ```env
   PAGSEGURO_WEBHOOK_SECRET=COLE_AQUI
   ```

### Como funciona o cartão

PagBank exige tokenização do cartão antes de criar a charge. O sistema usa o **endpoint `/checkouts`** (Checkout Hospedado PagBank) que retorna uma URL onde o cliente preenche o cartão na página da PagBank. Não precisa form local de cartão. O fluxo é:

1. Cliente confirma pedido.
2. Backend cria checkout no PagBank → recebe URL.
3. Frontend redireciona o cliente para essa URL.
4. Cliente paga.
5. PagBank notifica o webhook → sistema confirma.

---

## Asaas — referência rápida

(Mantido — ver `data/config.json` ou painel admin → Asaas Sandbox/Produção.)

- Sandbox: <https://sandbox.asaas.com> · API key começa com `$aact_hmlg_`.
- Produção: <https://www.asaas.com> · API key começa com `$aact_prod_`.
- Webhook: `/api/pagamento/webhook/asaas` — eventos `PAYMENT_RECEIVED` e `PAYMENT_CONFIRMED`.

---

## Stripe — referência rápida

- Dashboard: <https://dashboard.stripe.com> (modo Test ou Live).
- Chaves em **Developers → API keys** (`pk_live_` / `sk_live_` ou `pk_test_` / `sk_test_`).
- Webhook: **Developers → Webhooks → Add endpoint** com URL `/api/pagamento/webhook/stripe` e evento `payment_intent.succeeded`.
- Copie o **Signing secret** para `.env.local` em `STRIPE_WEBHOOK_SECRET`.
- PIX no Stripe é beta — habilite **Settings → Payment methods → PIX** e marque a flag no painel admin.

---

## Variáveis de ambiente relevantes

```env
# Verificação de assinatura de webhooks
STRIPE_WEBHOOK_SECRET=whsec_...
MERCADOPAGO_WEBHOOK_SECRET=...
PAGSEGURO_WEBHOOK_SECRET=...

# URL pública (usada para gerar URLs de notificação enviadas aos gateways)
NEXT_PUBLIC_SITE_URL=https://abc.trycloudflare.com
```

> **Importante**: a `NEXT_PUBLIC_SITE_URL` precisa ser a URL pública pela qual os webhooks chegam. Em desenvolvimento via Cloudflare Tunnel, copie a URL `*.trycloudflare.com` para essa variável e reinicie o servidor antes de testar webhooks.

---

## Decisão de qual gateway usar

| Critério | Asaas | Stripe | Mercado Pago | PagSeguro |
|---|---|---|---|---|
| **País** | BR | Internacional | BR (forte) | BR |
| **Taxas PIX** | ~0.99% + R$ 0,49 | ~1.49% (BR) | 0,99% | 0,99% |
| **Taxas Cartão** | ~3.99% + R$ 0,49 | ~3.99% + R$ 0,39 | ~3.79% à vista | 3.99% à vista |
| **Parcelamento** | até 12× | sem parcelamento BR | até 12× sem juros | até 18× |
| **API** | REST simples | Excelente | Boa, docs ok | Razoável |
| **Onboarding** | Rápido (CPF) | Rápido | Rápido | Mais burocrático |
| **Saque** | D+1 padrão | D+30 (default) | D+1 (cartão), D+0 (PIX) | D+30 (configurável) |

> **Sugestão prática**: PIX no Mercado Pago + Cartão no Mercado Pago (parcelamento). Asaas como fallback. Stripe só se tiver clientes internacionais. PagSeguro se já tem máquina deles.

---

## Troubleshooting

### "Pagamento aprovado no gateway mas pedido continua pendente"

1. O webhook não chegou. Confira:
   - URL pública correta (Cloudflare Tunnel ativo?)
   - URL configurada certa no painel do gateway
   - Logs em `data/payment_log.json` (procure `WEBHOOK_*`)
2. Se webhook chegou mas falhou validação:
   - `WEBHOOK_MP_ASSINATURA_INVALIDA` → `MERCADOPAGO_WEBHOOK_SECRET` errado no `.env.local`
   - `WEBHOOK_PAGSEGURO_ASSINATURA_INVALIDA` → idem
3. Sempre tem fallback de polling: `/api/pagamento/status?id=PEDIDO_ID` consulta o gateway diretamente.

### "Erro: Access token do Mercado Pago não configurado"

Você selecionou MP como gateway primário/fallback mas não preencheu o Access Token na seção. Salve as credenciais primeiro.

### "Mercado Pago retorna `payer.email is required`"

O sistema gera um email fake `noreply+<id>@example.com` quando o cliente não informou email. Para evitar: garanta que o cliente preenche email no checkout.

### "PagSeguro: erro 401 na criação da order"

Token errado ou expirado. Gere um novo no painel PagBank → Conexões.

### "PIX gerado mas QR não aparece"

- Asaas: chamada secundária `/payments/{id}/pixQrCode` — ver logs.
- Mercado Pago: `point_of_interaction.transaction_data.qr_code_base64` deve vir no payment.
- PagSeguro: dentro de `qr_codes[0].text` (copia-e-cola) e `qr_codes[0].links` (URL imagem).

Logs em `data/payment_log.json` mostram exatamente o que cada gateway respondeu.
