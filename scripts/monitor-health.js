/**
 * scripts/monitor-health.js
 *
 * Monitor leve de saúde da plataforma. Roda como CLI ou via cron e checa:
 *
 *   1. Disco livre (alerta se abaixo de MONITORING_DISK_MIN_GB).
 *   2. Tamanho de data/, storage/originals/ e public/uploads/.
 *   3. Tamanho de logs (audit_log.json, payment_log.json, notificacoes.json,
 *      reports/) e avisa se > 50 MB.
 *   4. Servidor respondendo (HTTP 200 em /api/config quando localhost:3000 escuta).
 *   5. Erros recentes no audit_log nas últimas 24h.
 *
 * Saída: imprime relatório legível. Se houver alertas críticos, exit code 2.
 *
 * Webhook (opcional): se MONITORING_WEBHOOK_URL estiver definido, envia
 * notificação JSON para Slack/Discord/Telegram.
 *
 * Uso:
 *   node scripts/monitor-health.js
 *   node scripts/monitor-health.js --json   (output em JSON)
 *   node scripts/monitor-health.js --quiet  (só erros)
 */

const fs = require('fs')
const path = require('path')
const os = require('os')

const ROOT = process.cwd()
const DATA_DIR = path.join(ROOT, 'data')
const STORAGE_DIR = path.join(ROOT, 'storage')
const PUBLIC_UPLOADS = path.join(ROOT, 'public', 'uploads')
const REPORTS_DIR = path.join(ROOT, 'reports')

const DISK_MIN_GB = Number(process.env.MONITORING_DISK_MIN_GB || 10)
const WEBHOOK = process.env.MONITORING_WEBHOOK_URL || null
const QUIET = process.argv.includes('--quiet')
const JSON_OUT = process.argv.includes('--json')

const alerts = []
const warnings = []

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

function fileSize(p) {
  try { return fs.statSync(p).size } catch { return 0 }
}

function checkDisk() {
  // Em Windows, usar wmic. Em Linux/Mac, statvfs via Node 18+ não é trivial; usa "df -k".
  try {
    if (process.platform === 'win32') {
      const drive = path.parse(ROOT).root.replace(/\\/g, '')   // ex: "H:"
      const { execSync } = require('child_process')
      const out = execSync(`wmic logicaldisk where DeviceID="${drive}" get FreeSpace /value`, { encoding: 'utf-8' })
      const m = out.match(/FreeSpace=(\d+)/)
      const freeBytes = m ? Number(m[1]) : 0
      return { ok: true, freeGB: freeBytes / 1024 / 1024 / 1024, drive }
    } else {
      const { execSync } = require('child_process')
      const out = execSync(`df -k "${ROOT}" | tail -1`, { encoding: 'utf-8' })
      const cols = out.trim().split(/\s+/)
      // df: Filesystem 1K-blocks Used Available Use% Mounted
      const availableKB = Number(cols[3]) || 0
      return { ok: true, freeGB: availableKB / 1024 / 1024, drive: cols[5] || '/' }
    }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

async function checkServer() {
  const url = 'http://localhost:3000/api/config'
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (res.ok) return { ok: true, status: res.status }
    return { ok: false, status: res.status }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

function checkAuditLog() {
  const p = path.join(DATA_DIR, 'audit_log.json')
  if (!fs.existsSync(p)) return { ok: true, errors24h: 0, total: 0 }
  try {
    const arr = JSON.parse(fs.readFileSync(p, 'utf-8'))
    if (!Array.isArray(arr)) return { ok: false, error: 'audit_log não é array' }
    const since = Date.now() - 24 * 60 * 60 * 1000
    const recent = arr.filter(e => {
      const t = new Date(e.createdAt).getTime()
      return Number.isFinite(t) && t >= since
    })
    const errors24h = recent.filter(e => e.status === 'failure' || e.status === 'error').length
    return { ok: true, total: arr.length, last24h: recent.length, errors24h }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

async function sendWebhook(payload) {
  if (!WEBHOOK) return
  try {
    await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    })
  } catch {}
}

async function main() {
  const report = {
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    platform: process.platform,
    node: process.version,
    cwd: ROOT,
    sizes: {},
    disk: null,
    server: null,
    audit: null,
  }

  // 1) Tamanhos
  report.sizes.data = dirSize(DATA_DIR)
  report.sizes.storage_originals = dirSize(path.join(STORAGE_DIR, 'originals'))
  report.sizes.storage_backups = dirSize(path.join(STORAGE_DIR, 'backups'))
  report.sizes.public_uploads = dirSize(PUBLIC_UPLOADS)
  report.sizes.reports = dirSize(REPORTS_DIR)
  report.sizes.audit_log = fileSize(path.join(DATA_DIR, 'audit_log.json'))
  report.sizes.payment_log = fileSize(path.join(DATA_DIR, 'payment_log.json'))
  report.sizes.notificacoes = fileSize(path.join(DATA_DIR, 'notificacoes.json'))
  report.sizes.db_sqlite = fileSize(path.join(DATA_DIR, 'db.sqlite'))

  if (report.sizes.audit_log > 50 * 1024 * 1024) warnings.push(`audit_log.json passou de 50 MB (${bytes(report.sizes.audit_log)}). Considere truncar.`)
  if (report.sizes.payment_log > 50 * 1024 * 1024) warnings.push(`payment_log.json passou de 50 MB (${bytes(report.sizes.payment_log)}). Considere arquivar.`)
  if (report.sizes.notificacoes > 20 * 1024 * 1024) warnings.push(`notificacoes.json passou de 20 MB. Considere podar antigas.`)

  // 2) Disco
  report.disk = checkDisk()
  if (report.disk.ok) {
    if (report.disk.freeGB < DISK_MIN_GB) {
      alerts.push(`DISCO BAIXO: apenas ${report.disk.freeGB.toFixed(2)} GB livres em ${report.disk.drive} (mínimo ${DISK_MIN_GB} GB).`)
    }
  } else {
    warnings.push(`Não foi possível ler espaço em disco: ${report.disk.error}`)
  }

  // 3) Servidor
  report.server = await checkServer()
  if (!report.server.ok) {
    warnings.push(`Servidor local NÃO está respondendo em http://localhost:3000 (${report.server.error || `HTTP ${report.server.status}`}). Pode estar parado.`)
  }

  // 4) Audit log
  report.audit = checkAuditLog()
  if (report.audit.errors24h > 10) {
    alerts.push(`${report.audit.errors24h} erros nos audit logs nas últimas 24h.`)
  }

  // ─── output ───
  if (JSON_OUT) {
    console.log(JSON.stringify({ ...report, alerts, warnings }, null, 2))
  } else {
    if (!QUIET || alerts.length > 0 || warnings.length > 0) {
      console.log(`📊 health-check — ${report.timestamp}`)
      console.log(`   host: ${report.hostname}  |  node ${report.node}`)
      console.log(``)
      console.log(`📁 Tamanhos:`)
      for (const [k, v] of Object.entries(report.sizes)) {
        console.log(`   ${k.padEnd(22)} ${bytes(v)}`)
      }
      console.log(``)
      if (report.disk.ok) {
        console.log(`💾 Disco em ${report.disk.drive}: ${report.disk.freeGB.toFixed(2)} GB livres`)
      }
      console.log(`🌐 Servidor: ${report.server.ok ? `OK (${report.server.status})` : `OFFLINE (${report.server.error || report.server.status})`}`)
      if (report.audit?.ok) {
        console.log(`📜 Audit log: ${report.audit.total} entradas total, ${report.audit.last24h} nas últimas 24h, ${report.audit.errors24h} erros recentes`)
      }
      console.log(``)
      if (alerts.length > 0) {
        console.log(`🚨 ALERTAS:`)
        alerts.forEach(a => console.log(`   ⚠️  ${a}`))
      }
      if (warnings.length > 0) {
        console.log(`⚠️  Avisos:`)
        warnings.forEach(w => console.log(`   - ${w}`))
      }
      if (alerts.length === 0 && warnings.length === 0) console.log(`✅ Nenhum alerta. Tudo ok.`)
    }
  }

  // ─── webhook ───
  if (WEBHOOK && (alerts.length > 0)) {
    const text = `🚨 ALERTA — plataforma-fotografo\n${alerts.map(a => '• ' + a).join('\n')}`
    await sendWebhook({ text, content: text, message: text })
  }

  process.exit(alerts.length > 0 ? 2 : 0)
}

main().catch(err => { console.error('[monitor] FATAL:', err); process.exit(1) })
