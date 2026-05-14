import fs from 'fs'
import path from 'path'
import { useDb } from './db/router'
import { avaliacoesRepo } from './db/repositories'
import { DATA_DIR, ensureRuntimeDirs } from './runtimePaths'

const FILE_PATH = path.join(DATA_DIR, 'avaliacoes.json')

export function readAvaliacoes() {
  if (useDb()) return avaliacoesRepo.readAll()
  if (!fs.existsSync(FILE_PATH)) {
    ensureRuntimeDirs()
    fs.writeFileSync(FILE_PATH, '[]')
    return []
  }
  return JSON.parse(fs.readFileSync(FILE_PATH, 'utf-8'))
}

export function writeAvaliacoes(items) {
  if (useDb()) { avaliacoesRepo.writeAll(items); return }
  ensureRuntimeDirs()
  fs.writeFileSync(FILE_PATH, JSON.stringify(items, null, 2), 'utf-8')
}
