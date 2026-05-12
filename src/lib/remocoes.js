// src/lib/remocoes.js
import fs from 'fs'
import path from 'path'
import { useDb } from './db/router'
import { remocoesRepo } from './db/repositories'

const DATA_PATH = path.join(process.cwd(), 'data', 'remocoes.json')

function ensureFile() {
  if (!fs.existsSync(DATA_PATH)) {
    fs.writeFileSync(DATA_PATH, '[]', 'utf-8')
  }
}

export function readRemocoes() {
  if (useDb()) return remocoesRepo.readAll()
  ensureFile()
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'))
}

export function writeRemocoes(items) {
  if (useDb()) { remocoesRepo.writeAll(items); return }
  fs.writeFileSync(DATA_PATH, JSON.stringify(items, null, 2), 'utf-8')
}
