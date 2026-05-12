# Storage externo S3-compatível (P39)

## Visão geral

O P39 introduz uma **camada opcional** de storage externo (S3, R2, B2, MinIO etc.) sem quebrar o fluxo local. Por padrão, o sistema continua usando apenas o sistema de arquivos local. Quando ativado pelo super-admin no painel, novos uploads são automaticamente espelhados para o bucket e downloads usam URLs assinadas/CDN.

## Decisão: AWS SDK v3 (S3-compatível, provider-agnóstico)

Recomendação: **Cloudflare R2** — egress grátis, S3-compatível, ~$0.015/GB armazenado, CDN incluso. Funciona também com AWS S3, Backblaze B2, Wasabi, MinIO, Scaleway, DigitalOcean Spaces.

## Arquitetura

```
                ┌──────────────────────────────┐
                │  /admin/configuracoes/storage│  (UI completa: config + test + migrate)
                └─────────────┬────────────────┘
                              │
       ┌──────────────────────┴──────────────────────┐
       │  /api/storage/{config,test,migrate}         │
       └──────────────────────┬──────────────────────┘
                              │
            ┌─────────────────┴─────────────────┐
            │       src/lib/storage/             │
            │  config.js   — flags em config.json│
            │  s3.js       — cliente S3 dinâmico │
            │  index.js    — fachada read/write  │
            │  migrate.js  — migração idempotente│
            └─────────────────┬─────────────────┘
                              │
              ┌───────────────┴───────────────┐
        ┌─────▼────────┐               ┌──────▼──────┐
        │  FS local    │  ←── source ──│   Bucket    │
        │ (sempre 1º)  │   of truth    │ (mirror)    │
        └──────────────┘               └─────────────┘
```

### Fluxo de upload
1. Cliente envia foto → `/api/upload`
2. Sharp gera derivadas → escreve no FS local
3. Resposta volta para o cliente
4. **Em background**: lib mirror copia o original (privado) e as 6 derivadas (public-read + Cache-Control imutável) pro bucket

### Fluxo de download
1. `/api/photos/[id]/download` autoriza pedido/cliente
2. `resolveOriginalForDownload()` decide:
   - Local existe e admin não pediu external → entrega buffer local
   - Local não existe ou `preferExternalForReads=true` → gera **signed URL** com TTL e retorna `302 Redirect`
3. Cliente baixa direto do bucket/CDN

### Arquivos no bucket
```
originals/
  {eventId}/
    {filename}.jpg          ← privado (signed URL)
uploads/
  grid/{wm,clean}/*.jpg      ← public-read + Cache-Control: max-age=31536000
  thumbs/{wm,clean}/*.jpg
  mini/{wm,clean}/*.jpg
  covers/{wm,clean}/*.jpg
  video-posters/{wm,clean}/*.jpg
```

## Painel admin

`/admin/configuracoes/storage` (super-admin) tem:
- **Status atual**: ativo/inativo, provider, bucket, endpoint, mirror, prefer external, CDN, TTL
- **Configuração**: provider (R2/S3/B2/MinIO/custom), region, endpoint, bucket, public CDN URL, access key, secret, path-style, mirror, prefer-external, TTL
- **Botão "Testar conexão"**: faz PUT/HEAD/DELETE em `__healthcheck/<ts>.txt`
- **Migração**: 3 botões (tudo / só originais / só derivadas), barra de progresso ao vivo, status em `/api/storage/migrate`
- **Instruções passo-a-passo**: guia para Cloudflare R2 (replica para outros providers)
- **Tabela comparativa de custos** (1.500 fotos, ~5GB)

## APIs

| Método | Rota | Quem | Descrição |
| --- | --- | --- | --- |
| `GET` | `/api/storage/config` | admin | config sanitizada (segredos mascarados) |
| `PATCH` | `/api/storage/config` | super-admin | atualiza; valida; reseta cliente S3 |
| `POST` | `/api/storage/test` | super-admin | smoke PUT/HEAD/DELETE |
| `GET` | `/api/storage/migrate` | admin | status atual da migração |
| `POST` | `/api/storage/migrate` | super-admin | inicia migração em background |

## Scripts CLI

```sh
npm run storage:migrate                  # local → bucket (originais + derivadas)
npm run storage:migrate:originals        # só originais (privados)
npm run storage:migrate:derivatives      # só derivadas (CDN)
npm run storage:rollback                 # bucket → local (download de tudo)
```

Pré-requisito: `data/config.json → storageExterno.ativo = true` com credenciais válidas.

## Configuração ([data/config.json] em `storageExterno`)

```json
{
  "ativo": false,
  "provider": "r2",
  "endpoint": "https://<accountid>.r2.cloudflarestorage.com",
  "region": "auto",
  "bucket": "fotos-vinicius",
  "accessKeyId": "...",
  "secretAccessKey": "...",
  "publicBaseUrl": "https://cdn.exemplo.com",
  "pathStyle": false,
  "mirrorOnUpload": true,
  "preferExternalForReads": false,
  "signedUrlTtlSeconds": 900
}
```

**Default**: `ativo: false`. Nada acontece com seu storage até o super-admin ligar pelo painel.

## Auditoria

Eventos registrados em `data/audit_log.json`:
- `storage.config_updated` (oculta secrets)
- `storage.test_connection`
- `storage.migrate_start`, `storage.migrate_done`

## Estimativa de custo (1.500 fotos, ~5GB)

| Provider | Storage/mês | Egress | Total típico |
| --- | --- | --- | --- |
| **Cloudflare R2** | R$ 0,40 | grátis | **~R$ 0,40** |
| Backblaze B2 | R$ 0,15 | ~R$ 0,03/GB acima do free | ~R$ 0,15 |
| AWS S3 | R$ 1,15 | R$ 0,45/GB | ~R$ 5–20 |

## Limitações desta etapa

- Mirror é **best-effort** (fire-and-forget). Falhas no mirror não bloqueiam upload, mas geram log no console. Próxima fase: queue persistente com retry.
- A migração é síncrona dentro do processo do servidor. Para repositórios > 100 GB, prefira o script CLI (`npm run storage:migrate`) rodando em paralelo.
- Não há **garbage collection** automática no bucket: se você apagar uma foto local, ela permanece no bucket até rodar uma limpeza manual.
- O painel admin assume credenciais por bucket. Multi-bucket / multi-region não suportado nesta fase.
- Storage cloud para **vídeos** (P35) ainda é local — mesma estrutura `storage/originals/{eventId}/videos/` é replicável, mas requer ajustes no streaming (Range headers).

## Reversão

Para desativar:
1. Vá em `/admin/configuracoes/storage`
2. Toggle "Ativar storage externo" → off
3. Salvar

O FS local continua funcionando normalmente. Para baixar de volta tudo que está no bucket: `npm run storage:rollback`.
