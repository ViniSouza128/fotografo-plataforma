#!/usr/bin/env node
/* eslint-disable no-console */
// Migra public/uploads/<kind>/<wm>/<file> -> public/uploads/<eventId>/<kind>/<wm>/<file>
// e split data/photos.json -> data/photos/<eventId>.json
//
// Uso:
//   node scripts/migrate-uploads-by-event.js          (dry-run)
//   node scripts/migrate-uploads-by-event.js --apply  (executa)
//   node scripts/migrate-uploads-by-event.js --apply --skip-files (apenas JSON/SQLite)
//   node scripts/migrate-uploads-by-event.js --apply --skip-data  (apenas filesystem)
//
// Requer que `data/events.json` e `data/photos.json` (ou photos buckets) estejam atualizados.
// Faz backup automático em data/_backup_<ts>/ e public/uploads/_backup_<ts>/.

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const DATA_DIR = path.join(ROOT, 'data')
const PHOTOS_DIR = path.join(DATA_DIR, 'photos')
const PHOTOS_LEGACY = path.join(DATA_DIR, 'photos.json')
const EVENTS_LEGACY = path.join(DATA_DIR, 'events.json')
const UPLOADS_DIR = path.join(ROOT, 'public', 'uploads')
const SQLITE_DB = path.join(DATA_DIR, 'db.sqlite')
const STORAGE_FLAG = path.join(DATA_DIR, 'storage-backend.txt')
const UNASSIGNED = '_unassigned'

const KINDS = ['grid', 'thumbs', 'mini', 'covers']
const WATERMARKS = ['wm', 'clean']
const EVENT_BUCKET_REGEX = /^[a-zA-Z0-9._-]+$/

const args = new Set(process.argv.slice(2))
const apply = args.has('--apply')
const skipFiles = args.has('--skip-files')
const skipData = args.has('--skip-data')

function log(...m) { console.log(...m) }
function warn(...m) { console.warn('!', ...m) }
function err(...m) { console.error('×', ...m) }

function timestamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function readJsonArray(p) {
  if (!fs.existsSync(p)) return []
  try {
    const v = JSON.parse(fs.readFileSync(p, 'utf-8'))
    return Array.isArray(v) ? v : []
  } catch (e) {
    err('Falha ao ler', p, ':', e.message)
    return []
  }
}

function sanitizeBucket(value) {
  if (value === null || value === undefined) return UNASSIGNED
  const raw = String(value).trim()
  if (!raw || raw === '.' || raw === '..') return UNASSIGNED
  if (!EVENT_BUCKET_REGEX.test(raw)) return UNASSIGNED
  return raw
}

function safeFilename(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const safe = path.basename(raw)
  if (!safe || safe === '.' || safe === '..') return null
  return safe
}

function buildEventScopedRelative(eventId, kind, wm, filename) {
  const safeEv = sanitizeBucket(eventId)
  if (safeEv === UNASSIGNED) return null
  const f = safeFilename(filename)
  if (!f) return null
  if (!KINDS.includes(kind) || !WATERMARKS.includes(wm)) return null
  return `${safeEv}/${kind}/${wm}/${f}`
}

function moveFileSync(from, to) {
  ensureDirSync(path.dirname(to))
  if (fs.existsSync(to)) {
    const ts = Date.now()
    const ext = path.extname(to)
    const base = path.basename(to, ext)
    const dir = path.dirname(to)
    const renamed = path.join(dir, `${base}__conflict_${ts}${ext}`)
    fs.renameSync(to, renamed)
    warn('  conflito alvo já existia, renomeado para', path.relative(ROOT, renamed))
  }
  fs.renameSync(from, to)
}

function copyFileSync(from, to) {
  ensureDirSync(path.dirname(to))
  if (fs.existsSync(to)) return false
  fs.copyFileSync(from, to)
  return true
}

function rmEmptyDirsRecursive(dir) {
  if (!fs.existsSync(dir)) return
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const sub = path.join(dir, entry.name)
    if (entry.isDirectory()) rmEmptyDirsRecursive(sub)
  }
  try {
    if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir)
  } catch {}
}

function getStorageBackend() {
  try {
    if (!fs.existsSync(STORAGE_FLAG)) return 'json'
    const v = fs.readFileSync(STORAGE_FLAG, 'utf-8').trim().toLowerCase()
    return v === 'sqlite' ? 'sqlite' : 'json'
  } catch { return 'json' }
}

function loadPhotosFromBackend() {
  const backend = getStorageBackend()
  if (backend === 'sqlite' && fs.existsSync(SQLITE_DB)) {
    let Database
    try { Database = require('better-sqlite3') }
    catch { warn('better-sqlite3 não instalado; usando photos.json'); return readJsonArray(PHOTOS_LEGACY) }
    let db
    try { db = new Database(SQLITE_DB, { readonly: true }) } catch (e) {
      err('Falha ao abrir SQLite:', e.message)
      return readJsonArray(PHOTOS_LEGACY)
    }
    try {
      const rows = db.prepare('SELECT data_json FROM photos').all()
      const out = []
      for (const r of rows) {
        try { out.push(JSON.parse(r.data_json)) } catch {}
      }
      return out
    } catch (e) {
      err('Falha lendo photos do SQLite:', e.message)
      return readJsonArray(PHOTOS_LEGACY)
    } finally {
      try { db.close() } catch {}
    }
  }
  // JSON: lê monolítico ou per-event
  if (fs.existsSync(PHOTOS_DIR)) {
    const all = []
    for (const name of fs.readdirSync(PHOTOS_DIR)) {
      if (!name.endsWith('.json')) continue
      const items = readJsonArray(path.join(PHOTOS_DIR, name))
      for (const item of items) all.push(item)
    }
    if (all.length > 0) return all
  }
  return readJsonArray(PHOTOS_LEGACY)
}

function loadEventsFromBackend() {
  const backend = getStorageBackend()
  if (backend === 'sqlite' && fs.existsSync(SQLITE_DB)) {
    let Database
    try { Database = require('better-sqlite3') }
    catch { return readJsonArray(EVENTS_LEGACY) }
    let db
    try { db = new Database(SQLITE_DB, { readonly: true }) } catch { return readJsonArray(EVENTS_LEGACY) }
    try {
      const rows = db.prepare('SELECT data_json FROM events').all()
      const out = []
      for (const r of rows) {
        try { out.push(JSON.parse(r.data_json)) } catch {}
      }
      return out
    } catch { return readJsonArray(EVENTS_LEGACY) }
    finally { try { db.close() } catch {} }
  }
  return readJsonArray(EVENTS_LEGACY)
}

function planFilesystemMigration(photos, events) {
  // Cada foto: para cada (kind, wm), planeja move de path/flat -> path/<eventId>/...
  const plan = {
    photoMoves: [], // { from, to }
    coverMoves: [], // { from, to }
    skipMissing: 0,
    skipExistingTarget: 0,
    flatNotFound: 0,
    legacyNotFound: 0,
  }

  for (const photo of photos) {
    const filename = safeFilename(photo?.filename)
    const eventId = sanitizeBucket(photo?.eventId)
    if (!filename || eventId === UNASSIGNED) continue

    for (const kind of ['grid', 'thumbs', 'mini']) {
      for (const wm of WATERMARKS) {
        // O destino canônico é <eventId>/<kind>/<wm>/<filename>
        const targetRel = buildEventScopedRelative(eventId, kind, wm, filename)
        if (!targetRel) continue
        const target = path.join(UPLOADS_DIR, ...targetRel.split('/'))
        if (fs.existsSync(target)) { plan.skipExistingTarget += 1; continue }

        // Fontes possíveis: prioriza o explicit pathField, depois flat, depois legacy
        const explicitPathField = {
          grid_wm: 'pathGridWm', grid_clean: 'pathGridClean',
          thumbs_wm: 'pathThumbWm', thumbs_clean: 'pathThumbClean',
          mini_wm: 'pathMiniWm', mini_clean: 'pathMiniClean',
        }[`${kind}_${wm}`]

        const explicit = explicitPathField && photo[explicitPathField]
        const candidates = []
        if (explicit) {
          // se já tem prefixo de eventId (já migrou), pula
          if (typeof explicit === 'string' && explicit.startsWith(`${eventId}/`)) continue
          candidates.push(path.join(UPLOADS_DIR, ...String(explicit).split('/')))
        }
        // Flat (legado direto)
        candidates.push(path.join(UPLOADS_DIR, kind, wm, filename))

        // Legacy: wm_<file>, thumbs/thumb_<file>, thumbs/mini_<file>
        if (kind === 'grid' && wm === 'wm') candidates.push(path.join(UPLOADS_DIR, `wm_${filename}`))
        if (kind === 'thumbs' && wm === 'wm') candidates.push(path.join(UPLOADS_DIR, 'thumbs', `thumb_${filename}`))
        if (kind === 'mini' && wm === 'clean') {
          const miniName = `mini_${filename.replace(/\.\w+$/, '.jpg')}`
          candidates.push(path.join(UPLOADS_DIR, 'thumbs', miniName))
        }

        let from = null
        for (const c of candidates) {
          if (fs.existsSync(c)) { from = c; break }
        }
        if (!from) {
          plan.skipMissing += 1
          continue
        }

        plan.photoMoves.push({ from, to: target, eventId, kind, wm, filename })
      }
    }
  }

  for (const event of events) {
    const eventId = sanitizeBucket(event?.id)
    if (eventId === UNASSIGNED) continue

    const coverImage = safeFilename(event?.coverImage)
    if (!coverImage) continue
    const coverFilename = safeFilename(event?.coverImageFile) || `cover_${coverImage}`

    for (const wm of WATERMARKS) {
      const targetRel = buildEventScopedRelative(eventId, 'covers', wm, coverFilename)
      if (!targetRel) continue
      const target = path.join(UPLOADS_DIR, ...targetRel.split('/'))
      if (fs.existsSync(target)) { plan.skipExistingTarget += 1; continue }

      const explicit = wm === 'wm' ? event.coverImagePathWm : event.coverImagePathClean
      const candidates = []
      if (explicit) {
        if (typeof explicit === 'string' && explicit.startsWith(`${eventId}/`)) continue
        candidates.push(path.join(UPLOADS_DIR, ...String(explicit).split('/')))
      }
      candidates.push(path.join(UPLOADS_DIR, 'covers', wm, coverFilename))
      candidates.push(path.join(UPLOADS_DIR, 'thumbs', coverFilename))

      let from = null
      for (const c of candidates) {
        if (fs.existsSync(c)) { from = c; break }
      }
      if (!from) {
        plan.skipMissing += 1
        continue
      }

      plan.coverMoves.push({ from, to: target, eventId, kind: 'covers', wm, filename: coverFilename })
    }
  }

  return plan
}

function executeFilesystemMigration(plan) {
  let moved = 0
  for (const item of [...plan.photoMoves, ...plan.coverMoves]) {
    try {
      moveFileSync(item.from, item.to)
      moved += 1
    } catch (e) {
      err('Falha movendo', path.relative(ROOT, item.from), '->', path.relative(ROOT, item.to), ':', e.message)
    }
  }
  return moved
}

function buildExpectedPathsForPhoto(photo) {
  const filename = safeFilename(photo?.filename)
  const eventId = sanitizeBucket(photo?.eventId)
  if (!filename || eventId === UNASSIGNED) return {}
  return {
    pathGridWm: buildEventScopedRelative(eventId, 'grid', 'wm', filename),
    pathGridClean: buildEventScopedRelative(eventId, 'grid', 'clean', filename),
    pathThumbWm: buildEventScopedRelative(eventId, 'thumbs', 'wm', filename),
    pathThumbClean: buildEventScopedRelative(eventId, 'thumbs', 'clean', filename),
    pathMiniWm: buildEventScopedRelative(eventId, 'mini', 'wm', filename),
    pathMiniClean: buildEventScopedRelative(eventId, 'mini', 'clean', filename),
  }
}

function buildExpectedPathsForEvent(event) {
  const eventId = sanitizeBucket(event?.id)
  if (eventId === UNASSIGNED) return {}
  const coverImage = safeFilename(event?.coverImage)
  if (!coverImage) return {}
  const coverFilename = safeFilename(event?.coverImageFile) || `cover_${coverImage}`
  return {
    coverImageFile: coverFilename,
    coverImagePathWm: buildEventScopedRelative(eventId, 'covers', 'wm', coverFilename),
    coverImagePathClean: buildEventScopedRelative(eventId, 'covers', 'clean', coverFilename),
  }
}

function updatePhotosPaths(photos) {
  let dirty = 0
  for (const photo of photos) {
    const expected = buildExpectedPathsForPhoto(photo)
    let changed = false
    for (const [k, v] of Object.entries(expected)) {
      if (v && photo[k] !== v) { photo[k] = v; changed = true }
    }
    if (changed) dirty += 1
  }
  return dirty
}

function updateEventsPaths(events) {
  let dirty = 0
  for (const event of events) {
    const expected = buildExpectedPathsForEvent(event)
    let changed = false
    for (const [k, v] of Object.entries(expected)) {
      if (v && event[k] !== v) { event[k] = v; changed = true }
    }
    if (changed) dirty += 1
  }
  return dirty
}

function backupDataFolder(stamp) {
  const target = path.join(DATA_DIR, `_backup_uploads_migration_${stamp}`)
  ensureDirSync(target)
  for (const name of ['photos.json', 'events.json', 'storage-backend.txt']) {
    const src = path.join(DATA_DIR, name)
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(target, name))
  }
  // copia photos/<bucket>.json se existir
  if (fs.existsSync(PHOTOS_DIR)) {
    const tgtPhotos = path.join(target, 'photos')
    ensureDirSync(tgtPhotos)
    for (const name of fs.readdirSync(PHOTOS_DIR)) {
      const src = path.join(PHOTOS_DIR, name)
      if (fs.statSync(src).isFile()) fs.copyFileSync(src, path.join(tgtPhotos, name))
    }
  }
  if (fs.existsSync(SQLITE_DB)) fs.copyFileSync(SQLITE_DB, path.join(target, 'db.sqlite'))
  log('Backup de data/ em', path.relative(ROOT, target))
  return target
}

function writePerEventPhotosJson(photos) {
  ensureDirSync(PHOTOS_DIR)
  const groups = new Map()
  for (const p of photos) {
    const bucket = sanitizeBucket(p?.eventId)
    if (!groups.has(bucket)) groups.set(bucket, [])
    groups.get(bucket).push(p)
  }
  // Remove buckets antigos que não estão mais presentes
  for (const f of fs.readdirSync(PHOTOS_DIR)) {
    if (!f.endsWith('.json')) continue
    const bucket = f.slice(0, -'.json'.length)
    if (!groups.has(bucket)) {
      try { fs.unlinkSync(path.join(PHOTOS_DIR, f)) } catch {}
    }
  }
  for (const [bucket, items] of groups) {
    fs.writeFileSync(path.join(PHOTOS_DIR, `${bucket}.json`), JSON.stringify(items, null, 2), 'utf-8')
  }
  // espelha o photos.json monolítico para integrações externas
  fs.writeFileSync(PHOTOS_LEGACY, JSON.stringify(photos, null, 2), 'utf-8')
  return groups.size
}

function writeEventsJson(events) {
  fs.writeFileSync(EVENTS_LEGACY, JSON.stringify(events, null, 2), 'utf-8')
}

function writePhotosToSqlite(photos) {
  let Database
  try { Database = require('better-sqlite3') }
  catch { warn('better-sqlite3 não instalado; pulando atualização SQLite'); return false }
  if (!fs.existsSync(SQLITE_DB)) return false
  const db = new Database(SQLITE_DB)
  try {
    const insert = db.prepare(`INSERT INTO photos
      (id, public_id, event_id, pasta, colaborador_id, removida, orfao_funcional, vendida, created_at, data_json)
      VALUES (@id, @public_id, @event_id, @pasta, @colaborador_id, @removida, @orfao_funcional, @vendida, @created_at, @data_json)`)
    const tx = db.transaction((rows) => {
      db.prepare('DELETE FROM photos').run()
      for (const p of rows) {
        if (!p?.id) continue
        insert.run({
          id: p.id,
          public_id: p.publicId || null,
          event_id: p.eventId || null,
          pasta: p.pasta || null,
          colaborador_id: p.colaboradorId || null,
          removida: p.removida ? 1 : 0,
          orfao_funcional: p.orfaoFuncional ? 1 : 0,
          vendida: p.vendida ? 1 : 0,
          created_at: p.createdAt || null,
          data_json: JSON.stringify(p),
        })
      }
    })
    tx(photos)
    return true
  } finally {
    try { db.close() } catch {}
  }
}

function writeEventsToSqlite(events) {
  let Database
  try { Database = require('better-sqlite3') }
  catch { return false }
  if (!fs.existsSync(SQLITE_DB)) return false
  const db = new Database(SQLITE_DB)
  try {
    const insert = db.prepare(`INSERT INTO events
      (id, public_id, name, date, visibilidade, colaborador_id, removido, created_at, data_json)
      VALUES (@id, @public_id, @name, @date, @visibilidade, @colaborador_id, @removido, @created_at, @data_json)`)
    const tx = db.transaction((rows) => {
      db.prepare('DELETE FROM events').run()
      for (const e of rows) {
        if (!e?.id) continue
        insert.run({
          id: e.id,
          public_id: e.publicId || null,
          name: e.name || null,
          date: e.date || null,
          visibilidade: e.visibilidade || 'publico',
          colaborador_id: e.colaboradorId || null,
          removido: e.removido ? 1 : 0,
          created_at: e.createdAt || null,
          data_json: JSON.stringify(e),
        })
      }
    })
    tx(events)
    return true
  } finally {
    try { db.close() } catch {}
  }
}

function cleanupOrphanFlatDirs() {
  // Após migração, as pastas flat /grid /thumbs/wm /thumbs/clean /mini /covers contêm apenas
  // arquivos não associados a fotos. Não removemos nada destrutivo aqui — apenas reportamos.
  const counts = {}
  for (const kind of KINDS) {
    for (const wm of WATERMARKS) {
      const dir = path.join(UPLOADS_DIR, kind, wm)
      if (!fs.existsSync(dir)) continue
      const remaining = fs.readdirSync(dir).filter(n => fs.statSync(path.join(dir, n)).isFile())
      counts[`${kind}/${wm}`] = remaining.length
    }
  }
  return counts
}

function main() {
  const stamp = timestamp()
  log('=== Migração public/uploads + photos.json para per-event ===')
  log('Modo:', apply ? 'APPLY' : 'DRY-RUN', '| skip-files:', skipFiles, '| skip-data:', skipData)

  const events = loadEventsFromBackend()
  const photos = loadPhotosFromBackend()
  log(`Eventos: ${events.length} | Fotos: ${photos.length}`)
  log('Backend atual:', getStorageBackend())

  if (events.length === 0 || photos.length === 0) {
    warn('Eventos ou fotos vazios. Abortando para segurança.')
    process.exit(1)
  }

  let backupDir = null
  if (apply) backupDir = backupDataFolder(stamp)

  // ------- Plano de filesystem -------
  let fsPlan = null
  if (!skipFiles) {
    fsPlan = planFilesystemMigration(photos, events)
    log('--- Plano de filesystem ---')
    log('  Photo moves:', fsPlan.photoMoves.length)
    log('  Cover moves:', fsPlan.coverMoves.length)
    log('  Targets já existentes (skip):', fsPlan.skipExistingTarget)
    log('  Origens não encontradas (skip):', fsPlan.skipMissing)

    // Mostra alguns exemplos
    const sample = (arr, n = 3) => arr.slice(0, n).map(x => `${path.relative(ROOT, x.from)} -> ${path.relative(ROOT, x.to)}`)
    if (fsPlan.photoMoves.length) log('  Exemplos:\n   -', sample(fsPlan.photoMoves).join('\n   - '))
    if (fsPlan.coverMoves.length) log('  Exemplos covers:\n   -', sample(fsPlan.coverMoves).join('\n   - '))
  }

  // ------- Atualização de paths em data -------
  let photosDirty = 0
  let eventsDirty = 0
  if (!skipData) {
    photosDirty = updatePhotosPaths(photos)
    eventsDirty = updateEventsPaths(events)
    log('--- Atualização de campos pathXxx ---')
    log('  Photos com path atualizado:', photosDirty)
    log('  Events com cover path atualizado:', eventsDirty)
  }

  if (!apply) {
    log('\nDRY-RUN concluído. Nenhuma alteração feita.')
    log('Re-execute com --apply para confirmar.')
    return
  }

  // ------- Executa filesystem -------
  if (!skipFiles && fsPlan) {
    log('--- Executando movimentações de arquivos ---')
    const moved = executeFilesystemMigration(fsPlan)
    log('  Movidos:', moved)
    // Remove dirs vazios em uploads/grid, uploads/thumbs/wm etc.
    for (const kind of KINDS) {
      const kindDir = path.join(UPLOADS_DIR, kind)
      if (fs.existsSync(kindDir)) rmEmptyDirsRecursive(kindDir)
    }
  }

  // ------- Salva data -------
  if (!skipData) {
    log('--- Salvando dados ---')
    const buckets = writePerEventPhotosJson(photos)
    log('  data/photos/<bucket>.json escritos:', buckets)
    writeEventsJson(events)
    log('  data/events.json escrito')

    if (getStorageBackend() === 'sqlite') {
      const okPhotos = writePhotosToSqlite(photos)
      const okEvents = writeEventsToSqlite(events)
      log('  SQLite atualizado: photos=', okPhotos, ' events=', okEvents)
    }
  }

  // ------- Reporta restos do layout flat -------
  if (!skipFiles) {
    const remaining = cleanupOrphanFlatDirs()
    const total = Object.values(remaining).reduce((a, b) => a + b, 0)
    if (total > 0) {
      log('--- Arquivos remanescentes em pastas flat (não removidos) ---')
      for (const [k, v] of Object.entries(remaining)) {
        if (v > 0) log(`  ${k}: ${v} arquivos`)
      }
    } else {
      log('Nenhum arquivo remanescente nas pastas flat.')
    }
  }

  log('\nMigração concluída. Backup em:', backupDir ? path.relative(ROOT, backupDir) : '(nenhum)')
}

try {
  main()
} catch (e) {
  err('Falha geral:', e.stack || e.message)
  process.exit(1)
}
