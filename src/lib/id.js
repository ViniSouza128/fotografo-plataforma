// src/lib/id.js
// Gerador de IDs públicos sequenciais e únicos
// Fotos:   100000001, 100000002 ...  (começa em 100000001)
// Pedidos: 200000001, 200000002 ...  (começa em 200000001)
// Eventos: 300000001, 300000002 ...  (começa em 300000001)
// Todos ficam no mesmo counter.json para um único ponto de controle.

import fs from 'fs'
import path from 'path'
import { useDb } from './db/router'
import { countersRepo } from './db/repositories'

const COUNTER_PATH = path.join(process.cwd(), 'data', 'counter.json')

function readCounter() {
  if (useDb()) {
    const stored = countersRepo.readAll()
    const data = {
      lastPhotoId: Number(stored.lastPhotoId ?? 100000000),
      lastPedidoId: Number(stored.lastPedidoId ?? 200000000),
      lastEventId: Number(stored.lastEventId ?? 300000000),
    }
    return data
  }
  if (!fs.existsSync(COUNTER_PATH)) {
    fs.writeFileSync(COUNTER_PATH, JSON.stringify({
      lastPhotoId:  100000000,
      lastPedidoId: 200000000,
    }, null, 2))
  }
  const data = JSON.parse(fs.readFileSync(COUNTER_PATH, 'utf-8'))
  // Garante campos em arquivos antigos
  if (data.lastPedidoId === undefined) data.lastPedidoId = 200000000
  if (data.lastEventId === undefined) data.lastEventId = 300000000
  return data
}

function writeCounter(data) {
  if (useDb()) { countersRepo.writeAll(data); return }
  fs.writeFileSync(COUNTER_PATH, JSON.stringify(data, null, 2))
}

// Gera próximo ID de foto (9 dígitos, série 1xxxxxxxx)
export function generatePhotoId() {
  const counter = readCounter()
  counter.lastPhotoId += 1
  writeCounter(counter)
  return counter.lastPhotoId.toString()
}

// Gera próximo ID de pedido (9 dígitos, série 2xxxxxxxx)
export function generatePedidoId() {
  const counter = readCounter()
  counter.lastPedidoId += 1
  writeCounter(counter)
  return counter.lastPedidoId.toString()
}

// Gera próximo ID de evento/álbum (9 dígitos, série 3xxxxxxxx)
export function generateEventId() {
  const counter = readCounter()
  counter.lastEventId += 1
  writeCounter(counter)
  return counter.lastEventId.toString()
}
