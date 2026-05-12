/**
 * scripts/rollback-storage-to-local.js
 *
 * Baixa todos os objetos do bucket de volta para storage/originals/ e public/uploads/.
 * Útil se o usuário quiser desativar o bucket e voltar a depender 100% do FS local.
 *
 * Uso:
 *   node scripts/rollback-storage-to-local.js
 */

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()

async function main() {
  const cfgPath = path.join(ROOT, 'data', 'config.json')
  if (!fs.existsSync(cfgPath)) { console.error('[rollback-s3] data/config.json não existe.'); process.exit(1) }
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'))
  const sc = cfg.storageExterno || {}
  if (!sc.bucket || !sc.endpoint || !sc.accessKeyId || !sc.secretAccessKey) {
    console.error('[rollback-s3] Config incompleta para conectar ao bucket.')
    process.exit(1)
  }

  const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3')
  const client = new S3Client({
    region: sc.region || 'auto',
    endpoint: sc.endpoint,
    forcePathStyle: !!sc.pathStyle,
    credentials: { accessKeyId: sc.accessKeyId, secretAccessKey: sc.secretAccessKey },
  })

  let token = null, total = 0, downloaded = 0, errors = 0
  do {
    const out = await client.send(new ListObjectsV2Command({
      Bucket: sc.bucket, ContinuationToken: token || undefined, MaxKeys: 1000,
    }))
    for (const obj of (out.Contents || [])) {
      total++
      const key = obj.Key
      let absTarget
      if (key.startsWith('originals/')) {
        absTarget = path.join(ROOT, 'storage', key)
      } else if (key.startsWith('uploads/')) {
        absTarget = path.join(ROOT, 'public', key)
      } else {
        continue // ignora chaves desconhecidas
      }
      try {
        if (fs.existsSync(absTarget)) {
          const stat = fs.statSync(absTarget)
          if (Number(stat.size) === Number(obj.Size)) { continue } // já existe igual
        }
        const res = await client.send(new GetObjectCommand({ Bucket: sc.bucket, Key: key }))
        const chunks = []
        for await (const c of res.Body) chunks.push(c)
        const buf = Buffer.concat(chunks)
        fs.mkdirSync(path.dirname(absTarget), { recursive: true })
        await fs.promises.writeFile(absTarget, buf)
        downloaded++
        if (downloaded % 25 === 0) console.log(`  baixados ${downloaded}/${total}`)
      } catch (err) {
        errors++; console.error(`  ✗ ${key}: ${err.message}`)
      }
    }
    token = out.IsTruncated ? out.NextContinuationToken : null
  } while (token)

  console.log('')
  console.log(`[rollback-s3] Concluído. Total: ${total}, baixados: ${downloaded}, erros: ${errors}`)
  console.log('Para parar de usar o bucket: vá em /admin/configuracoes/storage e desligue "Storage externo".')
  process.exit(errors > 0 ? 2 : 0)
}

main().catch(err => { console.error('[rollback-s3] FATAL:', err); process.exit(1) })
