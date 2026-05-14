import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { pathToFileURL } from 'url'

async function main() {
  const moduleUrl = pathToFileURL(path.join(process.cwd(), 'src', 'lib', 'runtimePaths.js')).href
  const runtimePaths = await import(moduleUrl)
  const {
    APP_PERSIST_DIR,
    PROJECT_ROOT,
    DATA_DIR,
    STORAGE_DIR,
    UPLOADS_DIR,
    BACKUP_DIR,
    isPersistMode,
    ensureRuntimeDirs,
    resolveRuntimePath,
  } = runtimePaths

  console.log('runtimePaths diagnosis')
  console.log(`  APP_PERSIST_DIR: ${APP_PERSIST_DIR || '(not set)'}`)
  console.log(`  persist mode: ${isPersistMode ? 'on' : 'off'}`)
  console.log(`  PROJECT_ROOT: ${PROJECT_ROOT}`)
  console.log(`  DATA_DIR: ${DATA_DIR}`)
  console.log(`  STORAGE_DIR: ${STORAGE_DIR}`)
  console.log(`  UPLOADS_DIR: ${UPLOADS_DIR}`)
  console.log(`  BACKUP_DIR: ${BACKUP_DIR}`)

  ensureRuntimeDirs()

  const tempName = `.runtime-paths-diagnostic-${Date.now()}-${process.pid}-${crypto.randomBytes(4).toString('hex')}.txt`
  const tempPath = resolveRuntimePath(BACKUP_DIR, tempName)
  const payload = `diagnostic=${new Date().toISOString()}\n`

  fs.writeFileSync(tempPath, payload, 'utf-8')
  const readBack = fs.readFileSync(tempPath, 'utf-8')
  fs.unlinkSync(tempPath)

  console.log(`  temp file: ${tempPath}`)
  console.log(`  roundtrip ok: ${readBack === payload ? 'yes' : 'no'}`)
}

main().catch((error) => {
  console.error('[diagnose-runtime-paths] failed:', error)
  process.exitCode = 1
})
