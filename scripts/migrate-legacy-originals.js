/* eslint-disable no-console */
// One-shot, conservative migration:
// Move legacy ORIGINAL uploads from `public/uploads` (root only) to `storage/originals`.
//
// Safety goals:
// - Default is dry-run (no filesystem changes)
// - Never touches derived/public files (wm_, thumb_, mini_, /thumbs/*, etc.)
// - Idempotent: re-running won't duplicate files
// - Clear JSONL log of moved/ignored/failed items
//
// Usage:
//   node scripts/migrate-legacy-originals.js
//   node scripts/migrate-legacy-originals.js --apply
//   node scripts/migrate-legacy-originals.js --apply --cleanup-duplicates
//   node scripts/migrate-legacy-originals.js --help

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const {
  DATA_DIR,
  STORAGE_DIR,
  UPLOADS_DIR,
  ensureRuntimeDirs,
} = require('../src/lib/runtimePaths.cjs')

function parseArgs(argv) {
  const args = {
    apply: false,
    cleanupDuplicates: false,
    onlyReferenced: false,
    sourceDir: UPLOADS_DIR,
    destDir: path.join(STORAGE_DIR, 'originals'),
    logPath: null,
  }

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') args.help = true
    else if (a === '--apply') args.apply = true
    else if (a === '--dry-run') args.apply = false
    else if (a === '--cleanup-duplicates') args.cleanupDuplicates = true
    else if (a === '--only-referenced') args.onlyReferenced = true
    else if (a === '--source') args.sourceDir = argv[++i]
    else if (a === '--dest') args.destDir = argv[++i]
    else if (a === '--log') args.logPath = argv[++i]
    else throw new Error(`Argumento desconhecido: ${a}`)
  }

  return args
}

function printHelp() {
  console.log(`
Migração one-shot de originais legados (conservadora)

Move apenas ORIGINAIS antigos de:
  public/uploads (somente arquivos na raiz)
para:
  storage/originals

Derivados públicos NÃO são movidos:
  - public/uploads/thumbs/*
  - public/uploads/wm_*
  - public/uploads/thumb_* (se existir na raiz)
  - public/uploads/mini_*  (se existir na raiz)

Como executar:
  Dry-run (padrão):
    node scripts/migrate-legacy-originals.js

  Aplicar (move de verdade):
    node scripts/migrate-legacy-originals.js --apply

  Remover duplicatas do source quando o destino já existe e o conteúdo é idêntico (SHA-256):
    node scripts/migrate-legacy-originals.js --apply --cleanup-duplicates

Opções:
  --only-referenced        Move apenas arquivos referenciados em data/photos.json e data/events.json (mais conservador)
  --source <dir>           Pasta fonte (default: public/uploads)
  --dest <dir>             Pasta destino (default: storage/originals)
  --log <file>             Caminho do log (default: storage/migrations/<timestamp>.jsonl)
  --help                   Ajuda
`.trim())
}

function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true })
}

function nowStamp() {
  // yyyyMMdd-HHmmss (local)
  const d = new Date()
  const pad2 = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`
}

function writeJsonlLine(stream, obj) {
  stream.write(`${JSON.stringify(obj)}\n`)
}

function readJsonSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return { ok: false, value: null, error: 'not_found' }
    const raw = fs.readFileSync(filePath, 'utf-8')
    return { ok: true, value: JSON.parse(raw), error: null }
  } catch (err) {
    return { ok: false, value: null, error: err.message }
  }
}

function collectReferencedOriginals() {
  const referenced = new Set()
  const errors = []

  const photosPath = path.join(DATA_DIR, 'photos.json')
  const photosJson = readJsonSafe(photosPath)
  if (photosJson.ok && Array.isArray(photosJson.value)) {
    for (const photo of photosJson.value) {
      if (photo && photo.filename) referenced.add(String(photo.filename))
    }
  } else if (photosJson.error && photosJson.error !== 'not_found') {
    errors.push({ file: photosPath, error: photosJson.error })
  }

  const eventsPath = path.join(DATA_DIR, 'events.json')
  const eventsJson = readJsonSafe(eventsPath)
  if (eventsJson.ok && Array.isArray(eventsJson.value)) {
    for (const evt of eventsJson.value) {
      if (evt && evt.coverImage) referenced.add(String(evt.coverImage))
    }
  } else if (eventsJson.error && eventsJson.error !== 'not_found') {
    errors.push({ file: eventsPath, error: eventsJson.error })
  }

  return { referenced, errors }
}

function isDerivedPublicFileName(fileName) {
  const name = String(fileName || '')
  return (
    name.startsWith('wm_') ||
    name.startsWith('thumb_') ||
    name.startsWith('mini_') ||
    name.startsWith('cover_')
  )
}

function isAllowedOriginalExtension(fileName) {
  const ext = path.extname(String(fileName || '')).toLowerCase()
  return ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.webp'
}

function sha256FileSync(filePath) {
  const hash = crypto.createHash('sha256')
  const fd = fs.openSync(filePath, 'r')
  try {
    const buf = Buffer.allocUnsafe(1024 * 1024)
    let bytesRead = 0
    do {
      bytesRead = fs.readSync(fd, buf, 0, buf.length, null)
      if (bytesRead > 0) hash.update(buf.subarray(0, bytesRead))
    } while (bytesRead > 0)
    return hash.digest('hex')
  } finally {
    fs.closeSync(fd)
  }
}

function moveFileConservativelySync(srcPath, destPath, srcSizeBytes) {
  // Prefer atomic rename (same volume). Fallback to copy+verify+unlink.
  try {
    fs.renameSync(srcPath, destPath)
    return { ok: true, mode: 'rename' }
  } catch (err) {
    if (err && (err.code === 'EXDEV' || err.code === 'EPERM')) {
      fs.copyFileSync(srcPath, destPath, fs.constants.COPYFILE_EXCL)
      const destSize = fs.statSync(destPath).size
      if (destSize !== srcSizeBytes) {
        throw new Error(`Tamanho divergente após cópia: src=${srcSizeBytes} dest=${destSize}`)
      }
      fs.unlinkSync(srcPath)
      return { ok: true, mode: 'copy_unlink' }
    }
    throw err
  }
}

function main() {
  ensureRuntimeDirs()
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    process.exit(0)
  }

  const dryRun = !args.apply
  const sourceDir = path.resolve(args.sourceDir)
  const destDir = path.resolve(args.destDir)

  const migrationsDir = path.join(STORAGE_DIR, 'migrations')
  const defaultLogPath = path.join(migrationsDir, `migrate-legacy-originals-${nowStamp()}.jsonl`)
  const logPath = path.resolve(args.logPath || defaultLogPath)

  ensureDirSync(path.dirname(logPath))
  const logStream = fs.createWriteStream(logPath, { flags: 'a' })

  const startedAt = new Date().toISOString()
  writeJsonlLine(logStream, {
    at: startedAt,
    type: 'start',
    dryRun,
    cleanupDuplicates: args.cleanupDuplicates,
    onlyReferenced: args.onlyReferenced,
    sourceDir,
    destDir,
  })

  if (!fs.existsSync(sourceDir)) {
    writeJsonlLine(logStream, { at: new Date().toISOString(), type: 'fatal', error: 'source_dir_not_found', sourceDir })
    logStream.end()
    console.error(`ERRO: pasta fonte não existe: ${sourceDir}`)
    process.exit(2)
  }

  const { referenced, errors: refErrors } = collectReferencedOriginals()
  for (const e of refErrors) {
    writeJsonlLine(logStream, { at: new Date().toISOString(), type: 'warning', warning: 'reference_json_error', ...e })
  }

  const useReferenceFilter = args.onlyReferenced && referenced.size > 0
  if (args.onlyReferenced && referenced.size === 0) {
    writeJsonlLine(logStream, { at: new Date().toISOString(), type: 'warning', warning: 'only_referenced_enabled_but_no_references_loaded' })
  }

  const summary = {
    scanned: 0,
    ignored_directory: 0,
    ignored_non_image: 0,
    ignored_derived: 0,
    ignored_unreferenced: 0,
    would_move: 0,
    moved: 0,
    exists_dest_skip: 0,
    duplicate_deleted: 0,
    conflict_dest_exists: 0,
    failed: 0,
  }

  const entries = fs.readdirSync(sourceDir, { withFileTypes: true })
  for (const ent of entries) {
    const name = ent.name
    summary.scanned++

    // No recursion: we will never touch subdirectories (e.g. /thumbs)
    if (ent.isDirectory()) {
      summary.ignored_directory++
      writeJsonlLine(logStream, { at: new Date().toISOString(), type: 'ignored', reason: 'directory', name })
      continue
    }
    if (!ent.isFile()) {
      summary.ignored_directory++
      writeJsonlLine(logStream, { at: new Date().toISOString(), type: 'ignored', reason: 'not_a_file', name })
      continue
    }

    const safeName = path.basename(String(name))
    if (!safeName || safeName === '.' || safeName === '..') {
      summary.failed++
      writeJsonlLine(logStream, { at: new Date().toISOString(), type: 'failed', reason: 'invalid_name', name })
      continue
    }

    if (!isAllowedOriginalExtension(safeName)) {
      summary.ignored_non_image++
      writeJsonlLine(logStream, { at: new Date().toISOString(), type: 'ignored', reason: 'non_image_extension', name: safeName })
      continue
    }

    if (isDerivedPublicFileName(safeName)) {
      summary.ignored_derived++
      writeJsonlLine(logStream, { at: new Date().toISOString(), type: 'ignored', reason: 'derived_prefix', name: safeName })
      continue
    }

    if (args.onlyReferenced && (!useReferenceFilter || !referenced.has(safeName))) {
      summary.ignored_unreferenced++
      writeJsonlLine(logStream, { at: new Date().toISOString(), type: 'ignored', reason: 'unreferenced', name: safeName })
      continue
    }

    const srcPath = path.join(sourceDir, safeName)
    const destPath = path.join(destDir, safeName)

    let srcStat
    try {
      srcStat = fs.statSync(srcPath)
    } catch (err) {
      summary.failed++
      writeJsonlLine(logStream, { at: new Date().toISOString(), type: 'failed', reason: 'stat_source_failed', name: safeName, srcPath, error: err.message })
      continue
    }

    if (fs.existsSync(destPath)) {
      if (!dryRun && args.cleanupDuplicates) {
        try {
          const destStat = fs.statSync(destPath)
          if (destStat.size !== srcStat.size) {
            summary.conflict_dest_exists++
            writeJsonlLine(logStream, {
              at: new Date().toISOString(),
              type: 'conflict',
              reason: 'dest_exists_size_diff',
              name: safeName,
              srcPath,
              destPath,
              srcSize: srcStat.size,
              destSize: destStat.size,
            })
            continue
          }

          const srcHash = sha256FileSync(srcPath)
          const destHash = sha256FileSync(destPath)
          if (srcHash !== destHash) {
            summary.conflict_dest_exists++
            writeJsonlLine(logStream, {
              at: new Date().toISOString(),
              type: 'conflict',
              reason: 'dest_exists_hash_diff',
              name: safeName,
              srcPath,
              destPath,
              sha256Src: srcHash,
              sha256Dest: destHash,
            })
            continue
          }

          fs.unlinkSync(srcPath)
          summary.duplicate_deleted++
          writeJsonlLine(logStream, {
            at: new Date().toISOString(),
            type: 'deleted_duplicate',
            name: safeName,
            srcPath,
            destPath,
            sha256: srcHash,
            bytes: srcStat.size,
          })
        } catch (err) {
          summary.failed++
          writeJsonlLine(logStream, { at: new Date().toISOString(), type: 'failed', reason: 'cleanup_duplicate_failed', name: safeName, srcPath, destPath, error: err.message })
        }
      } else {
        summary.exists_dest_skip++
        writeJsonlLine(logStream, { at: new Date().toISOString(), type: 'skipped', reason: 'dest_exists', name: safeName, srcPath, destPath, bytes: srcStat.size })
      }
      continue
    }

    if (dryRun) {
      summary.would_move++
      writeJsonlLine(logStream, { at: new Date().toISOString(), type: 'would_move', name: safeName, srcPath, destPath, bytes: srcStat.size })
      continue
    }

    try {
      ensureDirSync(destDir)
      const res = moveFileConservativelySync(srcPath, destPath, srcStat.size)
      summary.moved++
      writeJsonlLine(logStream, { at: new Date().toISOString(), type: 'moved', name: safeName, srcPath, destPath, bytes: srcStat.size, mode: res.mode })
    } catch (err) {
      summary.failed++
      writeJsonlLine(logStream, { at: new Date().toISOString(), type: 'failed', reason: 'move_failed', name: safeName, srcPath, destPath, error: err.message })
    }
  }

  writeJsonlLine(logStream, { at: new Date().toISOString(), type: 'summary', ...summary })
  writeJsonlLine(logStream, { at: new Date().toISOString(), type: 'end' })
  logStream.end()

  const referenceNote = args.onlyReferenced
    ? (useReferenceFilter
        ? 'Filtro por referência: ATIVO (--only-referenced)'
        : 'Filtro por referência: ATIVO, mas sem referências carregadas (ver warnings no log)')
    : 'Filtro por referência: DESATIVADO (default)'

  console.log(referenceNote)
  console.log(`Dry-run: ${dryRun ? 'SIM' : 'NÃO'}`)
  console.log(`Log: ${logPath}`)
  console.log(`Resumo: scanned=${summary.scanned} would_move=${summary.would_move} moved=${summary.moved} skipped(dest_exists)=${summary.exists_dest_skip} ignored_derived=${summary.ignored_derived} ignored_unreferenced=${summary.ignored_unreferenced} failed=${summary.failed}`)
  if (!dryRun && args.cleanupDuplicates) {
    console.log(`Cleanup duplicatas: deleted_duplicate=${summary.duplicate_deleted} conflicts=${summary.conflict_dest_exists}`)
  }
}

try {
  main()
} catch (err) {
  console.error(`ERRO: ${err.message}`)
  process.exit(1)
}
