/**
 * scripts/backup-daily.js
 *
 * Backup diário de:
 *   - data/*.json   (clients, events, photos, pedidos, etc.)
 *   - data/db.sqlite + WAL  (se em uso pelo P38)
 *   - data/vision/ (config + index do reconhecimento)
 *   - data/config.json (com aviso: contém credenciais!)
 *
 * NÃO faz backup de:
 *   - public/uploads/ ou storage/originals/  → arquivos grandes; faça com
 *     ferramenta de sync (rclone, robocopy, restic) ou use o storage externo.
 *
 * Saída:
 *   storage/backups/<YYYY-MM-DD_HHMMSS>/
 *     ├── data/
 *     │     ├── clients.json
 *     │     ├── events.json
 *     │     ├── ...
 *     │     ├── db.sqlite
 *     │     └── vision/
 *     ├── package.json (versão para referência)
 *     └── METADATA.txt (data, contadores, etc.)
 *
 * Retenção: mantém últimos N dias (BACKUP_RETENTION_DAYS, default 30).
 *
 * Uso:
 *   node scripts/backup-daily.js
 *   node scripts/backup-daily.js --no-prune   (não apaga backups antigos)
 *   node scripts/backup-daily.js --quiet
 *
 * Para automação (Linux):  crontab -e   →   0 3 * * *  cd /caminho && node scripts/backup-daily.js
 * Para automação (Windows): Agendador de Tarefas → ação: programa, argumentos:
 *      node scripts/backup-daily.js
 */

const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const DATA_DIR = path.join(ROOT, 'data')
const BACKUP_DIR = process.env.BACKUP_DIR
  ? path.resolve(process.env.BACKUP_DIR)
  : path.join(ROOT, 'storage', 'backups')

const RETENTION_DAYS = Math.max(1, Number(process.env.BACKUP_RETENTION_DAYS || 30))
const QUIET = process.argv.includes('--quiet')
const NO_PRUNE = process.argv.includes('--no-prune')

function log(...args) { if (!QUIET) console.log(...args) }
function err(...args) { console.error(...args) }

function timestampFolder() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }) }

function copyFileSafe(src, dst) {
  ensureDir(path.dirname(dst))
  fs.copyFileSync(src, dst)
}

function copyDirRecursive(src, dst, { skip = [] } = {}) {
  if (!fs.existsSync(src)) return 0
  let count = 0
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    if (skip.includes(entry.name)) continue
    if (entry.name.startsWith('_backup_')) continue        // não backup do backup
    if (entry.name === 'backups') continue                  // não recursão em backups/
    const s = path.join(src, entry.name)
    const d = path.join(dst, entry.name)
    if (entry.isDirectory()) {
      count += copyDirRecursive(s, d, { skip })
    } else if (entry.isFile()) {
      copyFileSafe(s, d)
      count++
    }
  }
  return count
}

function bytes(b) {
  if (b < 1024) return `${b} B`
  if (b < 1024**2) return `${(b/1024).toFixed(1)} KB`
  if (b < 1024**3) return `${(b/1024/1024).toFixed(1)} MB`
  return `${(b/1024/1024/1024).toFixed(2)} GB`
}

function dirSize(dir) {
  if (!fs.existsSync(dir)) return 0
  let total = 0
  const stack = [dir]
  while (stack.length) {
    const cur = stack.pop()
    let entries; try { entries = fs.readdirSync(cur, { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      const full = path.join(cur, e.name)
      if (e.isDirectory()) stack.push(full)
      else if (e.isFile()) {
        try { total += fs.statSync(full).size } catch {}
      }
    }
  }
  return total
}

function pruneOldBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return
  const entries = fs.readdirSync(BACKUP_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => ({ name: e.name, full: path.join(BACKUP_DIR, e.name) }))
  if (entries.length <= RETENTION_DAYS) return
  entries.sort((a, b) => a.name.localeCompare(b.name))   // alfabético = cronológico (timestampFolder)
  const toRemove = entries.slice(0, entries.length - RETENTION_DAYS)
  for (const item of toRemove) {
    try {
      fs.rmSync(item.full, { recursive: true, force: true })
      log(`  - removido backup antigo: ${item.name}`)
    } catch (e) {
      err(`  ! falha ao remover ${item.name}:`, e.message)
    }
  }
}

function readJsonSafe(p, fallback = null) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return fallback }
}

function buildMetadata() {
  const counter = readJsonSafe(path.join(DATA_DIR, 'counter.json'), {}) || {}
  const dbPath = path.join(DATA_DIR, 'db.sqlite')
  const hasDb = fs.existsSync(dbPath)
  const flagPath = path.join(DATA_DIR, 'storage-backend.txt')
  const flag = fs.existsSync(flagPath) ? fs.readFileSync(flagPath, 'utf-8').trim() : 'json'
  const lines = [
    `BACKUP DA PLATAFORMA-FOTOGRAFO`,
    `Gerado em: ${new Date().toISOString()}`,
    `Hostname: ${require('os').hostname()}`,
    `Plataforma: ${process.platform} ${process.arch}`,
    `Node: ${process.version}`,
    ``,
    `Backend de dados: ${flag}`,
    `db.sqlite presente: ${hasDb ? 'sim' : 'não'}`,
    ``,
    `Counters atuais:`,
    ...Object.entries(counter).map(([k, v]) => `  ${k}: ${v}`),
    ``,
    `Para restaurar:`,
    `  1) Pare o servidor (npm run dev / fechar a janela do iniciar.bat).`,
    `  2) Faça backup do data/ atual (cp -r data data.antes-restore).`,
    `  3) Copie o conteúdo deste backup para data/ na raiz do projeto.`,
    `  4) Reinicie o servidor.`,
    `  5) Verifique entrando como admin e conferindo eventos/clientes.`,
  ].join('\n')
  return lines
}

async function main() {
  log(`[backup] início — ${new Date().toISOString()}`)
  if (!fs.existsSync(DATA_DIR)) {
    err('[backup] data/ não existe.'); process.exit(1)
  }
  ensureDir(BACKUP_DIR)
  const folder = path.join(BACKUP_DIR, timestampFolder())
  ensureDir(folder)
  log(`[backup] destino: ${folder}`)

  // 1) data/ inteiro (excluindo o próprio backups e _backup_*)
  const dataDest = path.join(folder, 'data')
  const filesCount = copyDirRecursive(DATA_DIR, dataDest, { skip: [] })
  log(`[backup] data/: ${filesCount} arquivo(s) copiado(s)`)

  // 2) Snapshot do package.json (versão de referência)
  const pkgPath = path.join(ROOT, 'package.json')
  if (fs.existsSync(pkgPath)) {
    copyFileSafe(pkgPath, path.join(folder, 'package.json'))
  }

  // 3) METADATA.txt
  fs.writeFileSync(path.join(folder, 'METADATA.txt'), buildMetadata(), 'utf-8')

  const sz = dirSize(folder)
  log(`[backup] tamanho total: ${bytes(sz)}`)

  // 4) Prune
  if (!NO_PRUNE) {
    log(`[backup] retenção: ${RETENTION_DAYS} dia(s)`)
    pruneOldBackups()
  }

  log(`[backup] OK — ${folder}`)
  process.exit(0)
}

main().catch(e => { err('[backup] FATAL:', e); process.exit(1) })
