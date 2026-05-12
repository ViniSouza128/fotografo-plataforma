import fs from 'fs'
import path from 'path'
import { useDb } from './db/router'
import { avaliacoesRepo } from './db/repositories'

const FILE_PATH = path.join(process.cwd(), 'data', 'avaliacoes.json')

export function readAvaliacoes() {
  if (useDb()) return avaliacoesRepo.readAll()
  if (!fs.existsSync(FILE_PATH)) {
    fs.writeFileSync(FILE_PATH, '[]')
    return []
  }
  return JSON.parse(fs.readFileSync(FILE_PATH, 'utf-8'))
}

export function writeAvaliacoes(items) {
  if (useDb()) { avaliacoesRepo.writeAll(items); return }
  fs.writeFileSync(FILE_PATH, JSON.stringify(items, null, 2), 'utf-8')
}
