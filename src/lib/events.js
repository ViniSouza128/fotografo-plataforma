import fs from 'fs'
import path from 'path'
import { useDb } from './db/router'
import { eventsRepo } from './db/repositories'

const DATA_PATH = path.join(process.cwd(), 'data', 'events.json')

function ensureFile() {
  if (!fs.existsSync(DATA_PATH)) {
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
  fs.writeFileSync(DATA_PATH, JSON.stringify(events, null, 2), 'utf-8')
}
