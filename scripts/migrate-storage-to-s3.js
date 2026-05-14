/**
 * scripts/migrate-storage-to-s3.js
 *
 * CLI wrapper para a migração local → bucket S3.
 * Lê config de data/config.json (chave storageExterno).
 * Pode rodar com --only-originals ou --only-derivatives.
 *
 * Pré-requisitos:
 *   - storageExterno.ativo = true em data/config.json
 *   - credenciais válidas (use o painel /admin/configuracoes/storage para configurar)
 *
 * Uso:
 *   node scripts/migrate-storage-to-s3.js
 *   node scripts/migrate-storage-to-s3.js --only-originals
 *   node scripts/migrate-storage-to-s3.js --only-derivatives
 */

const fs = require('fs')
const path = require('path')
const {
  DATA_DIR,
  STORAGE_DIR,
  UPLOADS_DIR,
  ensureRuntimeDirs,
} = require('../src/lib/runtimePaths.cjs')

// Reuso da lógica do lib (compilada com Next, mas o código fonte usa só ESM básico).
// Como o script roda em CJS, vamos reimplementar o essencial via require dinâmico.

async function main() {
  ensureRuntimeDirs()
  const onlyOriginals = process.argv.includes('--only-originals')
  const onlyDerivatives = process.argv.includes('--only-derivatives')

  // Carrega config
  const cfgPath = path.join(DATA_DIR, 'config.json')
  if (!fs.existsSync(cfgPath)) { console.error('[migrate-s3] data/config.json não existe.'); process.exit(1) }
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'))
  const sc = cfg.storageExterno || {}
  if (!sc.ativo) { console.error('[migrate-s3] storageExterno.ativo = false. Ative no painel admin antes.'); process.exit(1) }
  if (!sc.bucket || !sc.endpoint || !sc.accessKeyId || !sc.secretAccessKey) {
    console.error('[migrate-s3] Config incompleta. Configure em /admin/configuracoes/storage.')
    process.exit(1)
  }

  const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3')
  const client = new S3Client({
    region: sc.region || 'auto',
    endpoint: sc.endpoint,
    forcePathStyle: !!sc.pathStyle,
    credentials: { accessKeyId: sc.accessKeyId, secretAccessKey: sc.secretAccessKey },
  })

  const ORIGINALS_DIR = path.join(STORAGE_DIR, 'originals')

  function* walk(dir) {
    if (!fs.existsSync(dir)) return
    const stack = [dir]
    while (stack.length) {
      const cur = stack.pop()
      let entries
      try { entries = fs.readdirSync(cur, { withFileTypes: true }) } catch { continue }
      for (const entry of entries) {
        const full = path.join(cur, entry.name)
        if (entry.isDirectory()) {
          if (entry.name === 'trash' || entry.name === 'migrations') continue
          if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue
          stack.push(full)
        } else if (entry.isFile() && !entry.name.startsWith('.')) {
          yield full
        }
      }
    }
  }

  function contentTypeFor(filename) {
    const ext = (path.extname(filename) || '').toLowerCase()
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
    if (ext === '.png') return 'image/png'
    if (ext === '.webp') return 'image/webp'
    if (ext === '.mp4') return 'video/mp4'
    return 'application/octet-stream'
  }

  async function existsWithSize(key, expected) {
    try {
      const out = await client.send(new HeadObjectCommand({ Bucket: sc.bucket, Key: key }))
      return Number(out.ContentLength) === Number(expected)
    } catch { return false }
  }

  async function upload(key, abs, isPublic) {
    const buf = await fs.promises.readFile(abs)
    const params = {
      Bucket: sc.bucket, Key: key, Body: buf,
      ContentType: contentTypeFor(abs),
    }
    if (isPublic) {
      params.ACL = 'public-read'
      params.CacheControl = 'public, max-age=31536000, immutable'
    }
    await client.send(new PutObjectCommand(params))
  }

  let total = 0, sent = 0, skipped = 0, errors = 0

  if (!onlyDerivatives) {
    console.log('[migrate-s3] Originais:')
    for (const abs of walk(ORIGINALS_DIR)) {
      total++
      try {
        const stat = fs.statSync(abs)
        const rel = path.relative(ORIGINALS_DIR, abs).replace(/\\/g, '/')
        const key = `originals/${rel}`
        if (await existsWithSize(key, stat.size)) { skipped++; continue }
        await upload(key, abs, false)
        sent++
        if (sent % 25 === 0) console.log(`  enviados ${sent}, pulados ${skipped}, erros ${errors}`)
      } catch (err) {
        errors++; console.error(`  ✗ ${path.basename(abs)}: ${err.message}`)
      }
    }
  }

  if (!onlyOriginals) {
    console.log('[migrate-s3] Derivadas:')
    for (const abs of walk(UPLOADS_DIR)) {
      total++
      try {
        const stat = fs.statSync(abs)
        const rel = path.relative(UPLOADS_DIR, abs).replace(/\\/g, '/')
        const key = `uploads/${rel}`
        if (await existsWithSize(key, stat.size)) { skipped++; continue }
        await upload(key, abs, true)
        sent++
        if (sent % 50 === 0) console.log(`  enviados ${sent}, pulados ${skipped}, erros ${errors}`)
      } catch (err) {
        errors++; console.error(`  ✗ ${path.basename(abs)}: ${err.message}`)
      }
    }
  }

  console.log('')
  console.log(`[migrate-s3] Concluído. Total: ${total}, enviados: ${sent}, pulados: ${skipped}, erros: ${errors}`)
  process.exit(errors > 0 ? 2 : 0)
}

main().catch(err => { console.error('[migrate-s3] FATAL:', err); process.exit(1) })
