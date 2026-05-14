import fs from 'fs'
import path from 'path'
import { useDb } from './db/router'
import { eventsRepo } from './db/repositories'
import { DATA_DIR, ensureRuntimeDirs } from './runtimePaths'

const DATA_PATH = path.join(DATA_DIR, 'events.json')

function ensureFile() {
  if (!fs.existsSync(DATA_PATH)) {
    ensureRuntimeDirs()
    fs.writeFileSync(DATA_PATH, '[]', 'utf-8')
  }
}

export function readEvents() {
  if (useDb()) return eventsRepo.readAll()
  ensureFile()
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'))
}

export function writeEvents(events) {
  if (useDb()) { eventsRepo.writeAll(events); return }
  ensureRuntimeDirs()
  fs.writeFileSync(DATA_PATH, JSON.stringify(events, null, 2), 'utf-8')
}
