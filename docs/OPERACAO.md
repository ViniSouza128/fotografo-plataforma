# Runbook de Operação

Documento técnico para quem mantém a plataforma rodando. Complementa o [Manual do Fotógrafo](MANUAL_FOTOGRAFO.md) (foco operacional/uso) com informações de sysadmin.

> ## 🟢 Você está começando? Leia isto primeiro
>
> Se você nunca colocou um site na internet, comece por aqui:
>
> 1. **Local** (já funciona): clique 2× em `iniciar.bat` → o site abre em `http://localhost:3000`. Só você acessa, do seu PC.
> 2. **Público temporário** (5 min, grátis, sem cadastro): use `iniciar-publico.bat` — ele cria uma URL pública via Cloudflare Tunnel (ex: `https://abc.trycloudflare.com`). Detalhes em [§5.0](#50-cloudflare-tunnel-recomendado-para-começar--100-grátis).
> 3. **Público permanente** (precisa decidir hospedagem): VPS Linux com PM2+Nginx ([§5.1](#51-vps-linux-recomendado)), Vercel ([§5.3](#53-vercel-paas)), ou Windows Server ([§5.2](#52-windows-server)).
>
> **Em todas as opções, antes de tirar o site do ar para outras pessoas**:
> - [ ] Trocar `AUTH_SECRET` no `.env.local` (gere `openssl rand -hex 48`)
> - [ ] Trocar a senha do admin (`admin@test.com` / `123456` é só pra desenvolvimento)
> - [ ] Configurar backup automático ([§6.1](#61-backup-automático-script-incluído-no-projeto))
> - [ ] Rodar `npm run build` para gerar build de produção
> - [ ] Conferir o checklist em [§11](#11-checklist-de-deploy-público)

## 1. Requisitos

- Node.js **18+** (testado em 18 e 20).
- `npm` 9+.
- Disco livre suficiente para originais (cobertura típica de corrida: 20–40 GB por evento em RAW convertido para JPG).
- `sharp` já é instalado como dependência — não precisa instalar libvips globalmente.

Em Windows, recomenda-se rodar no Node oficial (não WSL) por conta da performance de IO em NTFS.

### Login Google / NextAuth (planejado)

O login atual usa cookie `auth_token` assinado em `src/lib/auth.js` e contas persistidas em `data/clients.json`. NextAuth nao foi adotado neste ciclo para evitar trocar a base de sessao no meio do hardening.

Caminho recomendado quando for implementar Google:

- Criar credenciais OAuth no Google Cloud e guardar `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` em `.env.local`.
- Decidir entre manter o token HMAC atual como sessao principal ou migrar integralmente para NextAuth.
- Mapear a conta Google para `clients.json` por e-mail normalizado, sem sobrescrever permissoes admin existentes.
- Exigir aceite da politica de privacidade no primeiro login social.
- Validar rollback com login/senha atual antes de publicar.

---

## 2. Variáveis de ambiente

Crie `.env.local` na raiz. Todos os valores são opcionais — o sistema tem fallback seguro para dev.

```dotenv
# Segredo de assinatura do cookie auth_token
AUTH_SECRET=<string longa aleatória, mínimo 32 chars>

# Admin bootstrap (só em máquina nova, antes do primeiro login)
ADMIN_EMAIL=admin@test.com
ADMIN_PASSWORD=123456

# Asaas (se o gateway estiver ativo)
ASAAS_WEBHOOK_TOKEN=<token enviado pelo Asaas no header>

# Stripe (se o gateway estiver ativo)
STRIPE_WEBHOOK_SECRET=<whsec_...>
```

> As **API keys** do Asaas e Stripe continuam em `data/config.json` porque precisam ser editadas pelo admin via painel. Em um deploy público, mover essas leituras para `.env` é um hardening recomendado.

---

## 3. Comandos úteis

```bash
npm install                 # instala dependências
npm run dev                 # dev server em http://localhost:3000
npm run build               # build de produção
npm start                   # roda o build

npm run images:audit        # mostra o que seria regenerado (dry-run)
npm run images:normalize    # regenera derivadas faltantes/inválidas
```

Scripts one-shot (ver seção 4):

```bash
node scripts/migrate-legacy-originals.js --help
node scripts/migrate-derived-images-structure.js --help
node scripts/normalize-image-variants.js --help
```

---

## 4. Scripts de migração

Todos aceitam `--help` e rodam em **dry-run** por padrão. Só executam escrita com `--apply`.

### 4.1 `migrate-legacy-originals.js`

Move originais soltos em `public/uploads/` para o layout novo `storage/originals/{eventId}/`.

```bash
# simulação
node scripts/migrate-legacy-originals.js

# executar
node scripts/migrate-legacy-originals.js --apply --cleanup-duplicates
```

Flags:

- `--apply` — confirma a execução.
- `--cleanup-duplicates` — se `src` e `dest` tiverem o mesmo SHA-256, remove o `src`.
- `--only-referenced` — só move arquivos referenciados em `photos.json` / `events.json`.
- `--source`, `--dest`, `--log` — personalizar caminhos.

**Destrutivo**: sim (move, não copia).

O log em JSONL é gravado em `storage/migrations/migrate-legacy-originals-YYYYMMdd-HHmmss.jsonl`.

### 4.2 `migrate-derived-images-structure.js`

Migra derivadas do layout antigo (`wm_*`, `thumb_*`, `mini_*`, `cover_*`) para o novo (`grid/{clean|wm}/`, `thumbs/...`, `mini/...`, `covers/...`).

```bash
node scripts/migrate-derived-images-structure.js --apply --include-covers
```

Flags:

- `--apply` — confirma.
- `--include-covers` — também migra capas de eventos (não só fotos).
- `--allow-unsafe-copy` — flag legada, requer uso explícito.

**Destrutivo**: não. Copia; o original permanece. Faça limpeza manual depois de verificar.

### 4.3 `normalize-image-variants.js` (= `npm run images:audit|normalize`)

Wrapper ESM de `sanitizeDerivedImages()`. Valida tamanho e qualidade de cada derivada, regenera as problemáticas e arquiva as inválidas em `public/uploads/_legacy/`.

```bash
npm run images:audit        # sem --apply, só relatório
npm run images:normalize    # com --apply
```

Saída em JSON no stdout com contadores (`fotosTotal`, `coversTotal`, `originalsMoved`, `archived`, erros).

**Destrutivo**: sim (move para `_legacy`, regrava JPGs).

---

## 5. Deploy

> **TL;DR para iniciantes**: a forma mais rápida e gratuita de deixar o site na internet é o **Cloudflare Tunnel** (seção 5.0 abaixo). Você continua usando seu PC como servidor; o Cloudflare cria uma URL pública. Sem cadastro, sem cartão, sem abrir porta no roteador. Para algo permanente, considere a 5.1 (VPS).

### 5.0 Cloudflare Tunnel (RECOMENDADO para começar — 100% grátis)

**O que é**: você instala um pequeno programa (`cloudflared`) que abre uma "porta de saída" do seu PC para os servidores da Cloudflare. Eles te dão uma URL HTTPS pública (ex: `https://abc-def.trycloudflare.com`) que aponta para o seu localhost. **Nada do seu PC fica exposto diretamente.**

**Vantagens**:
- Sem cadastro, sem cartão, sem domínio próprio.
- HTTPS automático (certificado da Cloudflare).
- Não precisa abrir porta no roteador.
- Não expõe seu IP residencial.
- Funciona atrás de NAT, firewalls corporativos etc.

**Limitações**:
- A URL muda toda vez que você reinicia o tunel (modo "trycloudflare" anônimo).
- Se você quiser uma URL fixa (ex: `fotos.seudominio.com`), precisa criar conta grátis na Cloudflare e ter um domínio.
- O servidor depende do seu PC ligado (se desligar, sai do ar).

**Como instalar**:

1. Abra PowerShell **como administrador** e rode:
   ```powershell
   winget install --id Cloudflare.cloudflared
   ```
   Se não tiver `winget`, baixe manualmente em
   <https://github.com/cloudflare/cloudflared/releases/latest> (arquivo `cloudflared-windows-amd64.exe`),
   renomeie para `cloudflared.exe` e copie para `C:\Windows\System32`.

2. Feche e reabra o PowerShell para o PATH atualizar.

3. Confirme que instalou:
   ```powershell
   cloudflared --version
   ```

**Como usar (modo simples, URL temporária)**:

Já existe um script pronto na raiz do projeto: **`iniciar-publico.bat`**. Dois cliques.

Ele:
1. Sobe o servidor local (`npm run dev`) numa janela.
2. Abre o tunel Cloudflare em outra janela.
3. Mostra a URL pública (algo como `https://abc-def-ghi.trycloudflare.com`).

Para parar: feche as duas janelas.

**Como usar (modo avançado, URL fixa com domínio próprio)**:

Pré-requisito: ter um domínio (ex: registrado no Registro.br) e a zona DNS na Cloudflare (gratuito).

```powershell
# 1. Login (abre o navegador)
cloudflared tunnel login

# 2. Cria um tunel persistente
cloudflared tunnel create fotos-vinicius

# 3. Cria a rota DNS (CNAME para o tunel)
cloudflared tunnel route dns fotos-vinicius fotos.seudominio.com

# 4. Cria config em ~/.cloudflared/config.yml com:
#    tunnel: <UUID-impresso-no-passo-2>
#    credentials-file: C:\Users\<seu-user>\.cloudflared\<UUID>.json
#    ingress:
#      - hostname: fotos.seudominio.com
#        service: http://localhost:3000
#      - service: http_status:404

# 5. Roda o tunel (deixe sempre ativo no PC)
cloudflared tunnel run fotos-vinicius
```

Pode instalar como serviço Windows:
```powershell
cloudflared service install
```

> **Importante para Cloudflare Tunnel**: o limite de upload de arquivo via tunel é **100 MB** por padrão na conta free. Se subir fotos maiores, suba via interface direto pelo localhost (que nem fica exposto pra internet). O backend continua aceitando a foto pelo IP local sem limite.

### 5.1 VPS Linux (recomendado)

1. Instale Node 20 LTS:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```
2. Clone o repositório em `/opt/projeto-fotografo`.
3. Crie `.env.local` com as variáveis da seção 2.
4. `npm install && npm run build`.
5. Rode com um supervisor (PM2 ou systemd):
   ```bash
   pm2 start "npm start" --name projeto-fotografo --cwd /opt/projeto-fotografo
   pm2 save && pm2 startup
   ```
6. Configure Nginx como proxy reverso na frente do Next (porta 3000).
7. Obtenha HTTPS com Certbot.

Exemplo de config Nginx:

```nginx
server {
  server_name fotos.seudominio.com.br;
  client_max_body_size 100M;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

> **Importante**: `client_max_body_size` precisa ser maior que o tamanho do maior JPG que você vai subir (40–80 MB para JPG 24 MP é comum).

### 5.3 Vercel (PaaS) — alternativa free com limites

Vercel é o caminho "deploy automático a partir do git". Free tier serve para testes pequenos.

**Requisitos antes de tentar Vercel**:

- Migrar storage de fotos para o bucket externo (P39 — `/admin/configuracoes/storage`). O FS da Vercel é efêmero (apaga a cada deploy), por isso fotos PRECISAM estar em S3/R2.
- Storage externo (R2 free tier 10 GB) e DB sqlite são **incompatíveis** com Vercel: o filesystem é read-only em produção. Você precisa migrar persistência para um banco hospedado (Postgres em Supabase/Neon/PlanetScale grátis).
- Aceitar limite de **payload 4.5 MB** por API (uploads de fotos via Vercel ficam inviáveis sem upload direto pro bucket).

**Por isso, para esse projeto, eu não recomendo Vercel agora** — Cloudflare Tunnel ou VPS são melhores. Documentado aqui só para referência.

### 5.2 Windows Server

Funciona, mas atenção a:

- IIS como proxy reverso para a porta 3000 via módulo `URL Rewrite`.
- Supervisão com `nssm` ou `pm2-windows-service`.
- Antivirus: excluir `data/`, `storage/` e `public/uploads/` das varreduras em tempo real (melhora drasticamente o desempenho).

---

## 6. Backup

Três pastas precisam ser copiadas regularmente:

| Pasta | Frequência sugerida | Restauração |
| --- | --- | --- |
| `data/` | diária | essencial para recuperar tudo (reescreve estado) |
| `storage/originals/` | diária | se perder, não tem como regenerar (são os originais!) |
| `public/uploads/` | semanal | as derivadas podem ser regeneradas via `images:normalize`, mas demora |

### 6.1 Backup automático (script incluído no projeto)

Existe um script Node pronto: **`scripts/backup-daily.js`** (P40). Ele copia:
- todos os JSONs de `data/`
- `data/db.sqlite` + WAL/SHM (se você migrou para SQLite no P38)
- `data/vision/` (configuração do reconhecimento P36)

**O que ele NÃO copia**: `storage/originals/` e `public/uploads/`. Esses são pesados (vários GB) e devem ser duplicados com `robocopy`/`rsync` ou já estarem no bucket externo (P39).

**Rodar manualmente uma vez**:
```sh
npm run backup
```

A saída vai para `storage/backups/<data-hora>/` e mantém os últimos 30 dias por padrão (configurável em `BACKUP_RETENTION_DAYS` no `.env.local`).

**Agendar no Windows (Agendador de Tarefas)**:

1. Abra o **Agendador de Tarefas** (`taskschd.msc`).
2. *Criar Tarefa Básica…* → Nome: "PhotoVault backup diário".
3. *Disparador*: Diariamente, às 03:00 da manhã.
4. *Ação*: Iniciar um programa
   - Programa: `node`
   - Argumentos: `scripts/backup-daily.js`
   - Iniciar em: `H:\Programas\projeto-fotografo`
5. Marque "Executar mesmo se o usuário não estiver conectado".

**Agendar no Linux (cron)**:
```bash
crontab -e
# adicione:
0 3 * * *  cd /opt/projeto-fotografo && /usr/bin/node scripts/backup-daily.js >> /var/log/backup-fotos.log 2>&1
```

**Backup das pastas pesadas** (originais e derivadas) — use ferramentas separadas:

Linux:
```bash
#!/usr/bin/env bash
# /etc/cron.daily/backup-fotos-arquivos.sh
DATE=$(date +%Y%m%d)
tar -czf /var/backups/fotos/storage-$DATE.tar.gz -C /opt/projeto-fotografo storage/originals public/uploads
find /var/backups/fotos -name "storage-*.tar.gz" -mtime +14 -delete
```

Windows (Agendador de Tarefas, programa `robocopy`):
```powershell
robocopy "H:\Programas\projeto-fotografo\storage\originals" "D:\backup\storage-originals" /MIR /R:1 /W:1
robocopy "H:\Programas\projeto-fotografo\public\uploads"   "D:\backup\public-uploads"     /MIR /R:1 /W:1
```

### 6.2 Como restaurar um backup

> Cenário: dia ruim, você apagou alguma coisa importante ou o `data/` corrompeu. Você tem `storage/backups/2026-05-09_170440/` salvo.

**Passo a passo**:

1. **Pare o servidor** (feche a janela do `iniciar.bat`, ou `Ctrl+C`, ou `pm2 stop projeto-fotografo`).

2. **Faça uma cópia de segurança do `data/` atual** (caso o backup que vai restaurar também tenha problema):
   ```sh
   # Windows PowerShell
   Copy-Item -Recurse data data.antes-restore-$(Get-Date -Format yyyyMMdd-HHmmss)

   # Linux/Mac
   cp -r data "data.antes-restore-$(date +%Y%m%d-%H%M%S)"
   ```

3. **Localize o backup que quer restaurar**:
   ```sh
   ls storage/backups/
   # ex: 2026-05-09_170440/
   ```

4. **Substitua o `data/`**:
   ```sh
   # Windows
   rmdir /s /q data
   robocopy storage\backups\2026-05-09_170440\data data /MIR

   # Linux/Mac
   rm -rf data
   cp -r storage/backups/2026-05-09_170440/data data
   ```

5. **Reinicie** o servidor (`iniciar.bat` ou `npm run dev`).

6. **Verifique**: entre como admin, abra `/admin/eventos`, `/admin/clientes`, `/admin/pedidos` e confirme que os dados voltaram.

7. Se algo continuar quebrado: pare de novo, restaure do `data.antes-restore-...` para voltar ao estado pré-restore e tente outro backup mais antigo.

**Restaurar storage/originals (fotos)**:
```sh
# Windows
robocopy "D:\backup\storage-originals" "H:\Programas\projeto-fotografo\storage\originals" /MIR

# Linux
rsync -av /var/backups/fotos/storage-20260509.tar.gz /tmp/
tar -xzf /tmp/storage-20260509.tar.gz -C /opt/projeto-fotografo
```

**Recriar derivadas (se perdeu `public/uploads/`)**:
```sh
npm run images:normalize
```
Demora bastante (~5–10 min para 1500 fotos), mas reconstrói thumb/grid/mini com base nos originais.

### 6.3 Backup do bucket externo (se ativado P39)

Se você ativou o storage externo (R2/S3), os arquivos já têm redundância no provider. Para um backup-do-backup:

```sh
# Baixa tudo do bucket de volta para o disco local
npm run storage:rollback
```

---

## 7. Troubleshooting

### 7.1 "Middleware bloqueando foto que deveria ser pública"

Sintoma: imagem retorna 404 no site.

- Confirme que o arquivo existe em `public/uploads/` com um prefixo válido (`wm_`, `thumb_`, `mini_`, `preview_` ou está em `thumbs/`).
- Originais nunca devem ser acessados por `/uploads/` — só por `/api/photos/[id]/download` com validação.
- Veja o middleware em `middleware.js` (raiz).

### 7.2 "Derivadas sumiram / foto mostra placeholder"

```bash
npm run images:audit          # diagnóstico
npm run images:normalize      # regeneração
```

Ou, pela API, dispare o job `POST /api/images/missing` (requer login admin).

### 7.3 "Pedido pago no gateway mas o sistema não liberou"

- Verifique `data/payment_log.json` procurando pelo `pedidoId`.
- Confirme que o webhook está apontando para `https://seusite.com/api/pagamento/webhook/<gateway>`.
- Teste manualmente em `/admin/pedidos`: mude o status para `pago`. O sistema marca as fotos como vendidas e libera o download.

### 7.4 "Upload travando ou muito lento"

- Grande parte do custo é **EXIF + resize + watermark composite**. Para fotos de 24–40 MP, espere ~1–3 s por foto em CPU moderna.
- Reduza lotes se o processo der `Out of memory`.
- Em Node 20, o `sharp` usa threads nativas; você não precisa paralelizar mais por fora.
- Antivírus que escaneia cada arquivo criado é o vilão mais comum em Windows.

### 7.5 "Faltou espaço em disco"

- `public/uploads/_legacy/` guarda derivadas arquivadas. Pode ser apagado com segurança **se você tiver rodado `normalize-image-variants.js` recentemente**.
- `storage/originals/` **não pode ser apagado** — são os originais.
- Considere comprimir eventos antigos ou mover para storage frio.

### 7.6 "Preciso resetar a senha do admin"

```bash
node -e "const {hashPassword}=require('./src/lib/auth.js'); console.log(hashPassword('novaSenha'))"
```

Copie o hash retornado para o campo `senha` da sua conta em `data/clients.json`. Incremente `sessionVersion` em +1 para invalidar tokens antigos.

### 7.7 "Erro: `Dynamic server usage` no build"

Esperado. Rotas como `/api/auth/me` precisam ler cookies a cada request. Não afeta funcionamento.

### 7.8 "PIX Asaas demorando para confirmar"

- Até **5 minutos** é normal.
- O polling do checkout detecta em até 10 s depois do webhook chegar.
- Se passar de 10 min sem confirmar, confira:
  - API key correta?
  - Webhook configurado e acessível?
  - IP do Asaas liberado no firewall?

---

## 8. Monitoração mínima

### 8.1 Logs

- Saída do `npm start` (stdout/stderr): use `pm2 logs` ou `journalctl -u projeto-fotografo`.
- `data/payment_log.json`: log dos webhooks.
- `data/audit_log.json`: ações de admin (login, edição de pedidos, LGPD, etc.).
- `storage/migrations/*.jsonl`: log dos scripts one-shot.

### 8.2 Métricas que valem observar

- Tempo de resposta de `/api/photos` e `/api/events/[id]` (indicador de IO).
- Uso de disco em `public/uploads` e `storage/originals` (crescimento linear).
- Contadores em `data/counter.json` (crescimento de fotos/pedidos/eventos ao longo do tempo).
- Tamanho do `data/clients.json` (preciso migrar para DB quando passar de ~50 MB → P38 já fez o caminho).

### 8.3 Script de health-check (P40)

Existe um monitor incluído: **`scripts/monitor-health.js`** (também via `npm run monitor`).

O que ele checa:
- 💾 Espaço livre em disco (alerta se abaixo de `MONITORING_DISK_MIN_GB`, default 10 GB)
- 📁 Tamanho de `data/`, `storage/originals/`, `storage/backups/`, `public/uploads/`, `reports/`
- 📜 Tamanho de `audit_log.json`, `payment_log.json`, `notificacoes.json`, `db.sqlite`
- 🌐 Servidor respondendo em `http://localhost:3000/api/config`
- ⚠️ Erros nos audit logs nas últimas 24h

Saída humana:
```sh
npm run monitor
```

Saída JSON (para parsear/scripts):
```sh
npm run monitor:json
```

Exit code 2 quando há **alertas críticos** (disco baixo / muitos erros) — bom para integrar com cron.

**Webhook opcional** — defina `MONITORING_WEBHOOK_URL` em `.env.local` (Slack/Discord/Telegram bot). Quando há alerta crítico, o monitor manda POST com a mensagem.

**Agendar (Linux)**:
```bash
# A cada 30 min
*/30 * * * *  cd /opt/projeto-fotografo && /usr/bin/node scripts/monitor-health.js --quiet >> /var/log/monitor-fotos.log 2>&1
```

**Agendar (Windows Task Scheduler)**:
- Frequência: a cada 30 min
- Programa: `node`
- Argumentos: `scripts/monitor-health.js --quiet`
- Iniciar em: pasta do projeto

---

## 9. Atualizando o código

```bash
cd /opt/projeto-fotografo
git pull
npm install
npm run build
pm2 restart projeto-fotografo
```

Se a atualização trouxer migração de imagem:

```bash
npm run images:normalize
```

Se trouxer mudança de schema de JSON (raro):

- Leia os commits do período.
- Faça backup de `data/` ANTES de rodar qualquer coisa.

---

## 10. Limites conhecidos

| Limite | Valor estimado | Quando começa a doer |
| --- | --- | --- |
| Fotos por álbum | ~5 000 | depois disso, a galeria do cliente começa a ficar pesada |
| Fotos totais | ~50 000 | JSON de `photos.json` passa de ~30 MB, escrita fica lenta |
| Clientes | ~10 000 | escrita do `clients.json` fica lenta |
| Pedidos/dia | ~200 | webhook pode empilhar sob pico |
| Upload simultâneo | 3 workers no front, 1 IO no backend | gargalo é CPU do `sharp` |

Quando encostar em qualquer um desses limites, é hora de migrar para um banco relacional (Postgres/SQLite) e storage externo (S3/R2).

---

## 11. Checklist de deploy público

Antes de apontar um domínio para um servidor de verdade:

- [ ] `AUTH_SECRET` forte no `.env.local`.
- [ ] `ADMIN_PASSWORD` padrão trocado (e a conta `admin@test.com` removida ou renomeada).
- [ ] `data/config.json` **não** comitado (adicionar ao `.gitignore`).
- [ ] Chaves de gateway em produção (não sandbox).
- [ ] HTTPS ativo.
- [ ] Backup automático configurado.
- [ ] Webhook de Asaas e/ou Stripe apontando para o domínio público.
- [ ] Autorização server-side revisada em todas as rotas `/api/*` sensíveis.
- [ ] `public/uploads/_legacy/` limpo.
- [ ] `data/*.json` sanitizado (sem clientes de teste, sem eventos de desenvolvimento).
- [ ] Política de privacidade e termos publicados (veja `SEGURANCA_E_LGPD.md`).

Se algum item acima ainda está pendente, **não aponte o domínio ainda**.

## 12. Publicacao segura do repositorio

Antes de compartilhar o codigo, criar um ZIP ou publicar em qualquer remoto:

1. Confirme que `.gitignore` protege `.env.local`, `data/*.json`, `storage/`, `public/uploads/` e backups.
2. Use `data/config.sample.json` como exemplo seguro. Nao copie `data/config.json` real para materiais de instalacao.
3. Se algum JSON real ja tiver sido versionado antes, remova apenas do indice do git com `git rm --cached data/*.json` e mantenha os arquivos no disco. Depois, troque chaves expostas.
4. Nunca publique `storage/originals/`, `public/uploads/` ou `public/uploads/_legacy/`; eles contem imagens e historico operacional.

`data/config.json` pode conter `asaas_sandbox.api_key`, `asaas_producao.api_key`, `stripe.secret_key` e outros identificadores de gateway. Esses valores sao segredos operacionais enquanto estiverem no JSON local.

Backups tambem podem conter dados pessoais, hashes de senha, logs de pagamento e chaves de gateway. Armazene fora do repositorio, com acesso restrito, e nao envie backups para suporte sem sanitizar.
