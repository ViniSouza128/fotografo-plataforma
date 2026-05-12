// tests/safeDeletion.test.js
// src/lib/safeDeletion.js — análise de vínculos antes de excluir fotos.
// Como o módulo lê o storage (photos.json, pedidos.json, clients.json),
// mockamos esses libs para fixtures determinísticas.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks DEVEM ser declarados antes do import do módulo testado
const mockState = { photos: [], pedidos: [], clients: [], events: [] }

vi.mock('@/lib/photos', () => ({
  readPhotos: () => mockState.photos,
  writePhotos: (rows) => { mockState.photos = rows },
}))
vi.mock('@/lib/pedidos', () => ({
  readPedidos: () => mockState.pedidos,
  writePedidos: (rows) => { mockState.pedidos = rows },
}))
vi.mock('@/lib/clients', () => ({
  readClients: () => mockState.clients,
  writeClients: (rows) => { mockState.clients = rows },
}))
vi.mock('@/lib/events', () => ({
  readEvents: () => mockState.events,
  writeEvents: (rows) => { mockState.events = rows },
}))
vi.mock('@/lib/imageStorage', () => ({
  DELETION_LOG_PATH: '/tmp/test-deletion-log.json',
  ensureImageStorageDirs: () => {},
  movePhotoFilesToPreservedArea: (photo) => ({ photo, files: [] }),
  movePhotoFilesToTrash: () => [],
  purgeTrashFiles: () => [],
}))

import { analyzePhotos, analyzeEvent } from '@/lib/safeDeletion'

beforeEach(() => {
  mockState.photos = []
  mockState.pedidos = []
  mockState.clients = []
  mockState.events = []
})

describe('analyzePhotos', () => {
  it('devolve totais zerados para lista vazia', () => {
    const r = analyzePhotos({ photoIds: [] })
    expect(r.totalFotos).toBe(0)
    expect(r.totalImportantes).toBe(0)
    expect(r.items).toEqual([])
  })

  it('filtra por photoIds', () => {
    mockState.photos = [
      { id: 'p1', eventId: 'ev1', filename: 'a.jpg' },
      { id: 'p2', eventId: 'ev1', filename: 'b.jpg' },
      { id: 'p3', eventId: 'ev2', filename: 'c.jpg' },
    ]
    const r = analyzePhotos({ photoIds: ['p1', 'p3'] })
    expect(r.totalFotos).toBe(2)
    expect(r.ids.sort()).toEqual(['p1', 'p3'])
  })

  it('filtra por eventId', () => {
    mockState.photos = [
      { id: 'p1', eventId: 'ev1' },
      { id: 'p2', eventId: 'ev1' },
      { id: 'p3', eventId: 'ev2' },
    ]
    const r = analyzePhotos({ eventId: 'ev1' })
    expect(r.totalFotos).toBe(2)
    expect(r.ids.sort()).toEqual(['p1', 'p2'])
  })

  it('filtra por pasta dentro do evento', () => {
    mockState.photos = [
      { id: 'p1', eventId: 'ev1', pasta: 'mulheres' },
      { id: 'p2', eventId: 'ev1', pasta: 'homens' },
      { id: 'p3', eventId: 'ev1', pasta: null },  // raiz
    ]
    const onlyMulheres = analyzePhotos({ eventId: 'ev1', pasta: 'mulheres' })
    expect(onlyMulheres.ids).toEqual(['p1'])

    const root = analyzePhotos({ eventId: 'ev1', pasta: '__album__' })
    expect(root.ids).toEqual(['p3'])
  })

  it('marca fotos com pedido pago como importantes', () => {
    mockState.photos = [
      { id: 'p1', eventId: 'ev1' },
      { id: 'p2', eventId: 'ev1' },
    ]
    mockState.pedidos = [
      {
        id: 'ped1', status: 'pago',
        itens: [{ photoId: 'p1', price: 50 }],
      },
    ]
    const r = analyzePhotos({ photoIds: ['p1', 'p2'] })
    expect(r.totalImportantes).toBe(1)
    const p1 = r.items.find(i => i.id === 'p1')
    const p2 = r.items.find(i => i.id === 'p2')
    expect(p1.vinculos.compras).toBeGreaterThanOrEqual(1)
    expect(p1.vinculos.total).toBeGreaterThan(0)
    expect(p2.vinculos.total).toBe(0)
  })

  it('ignora pedidos não-concluídos (pendentes/cancelados)', () => {
    mockState.photos = [{ id: 'p1', eventId: 'ev1' }]
    mockState.pedidos = [
      { id: 'ped1', status: 'pendente', itens: [{ photoId: 'p1' }] },
      { id: 'ped2', status: 'cancelado', itens: [{ photoId: 'p1' }] },
    ]
    const r = analyzePhotos({ photoIds: ['p1'] })
    expect(r.items[0].vinculos.compras).toBe(0)
    expect(r.totalImportantes).toBe(0)
  })

  it('conta fotos no carrinho dos clientes', () => {
    mockState.photos = [{ id: 'p1', eventId: 'ev1' }]
    mockState.clients = [
      { id: 'c1', carrinho: [{ id: 'p1' }, { id: 'pX' }] },
      { id: 'c2', carrinho: [{ photoId: 'p1' }] },
    ]
    const r = analyzePhotos({ photoIds: ['p1'] })
    expect(r.items[0].vinculos.carrinhos).toBe(2)
    expect(r.totalImportantes).toBe(1)
  })

  it('retorna estrutura consistente mesmo sem foto-alvo correspondente', () => {
    const r = analyzePhotos({ photoIds: ['inexistente-1', 'inexistente-2'] })
    expect(r.totalFotos).toBe(0)
    expect(r.items).toEqual([])
  })
})

describe('analyzeEvent', () => {
  it('retorna evento + análise consolidada', () => {
    mockState.events = [{ id: 'ev1', name: 'Corrida' }]
    mockState.photos = [
      { id: 'p1', eventId: 'ev1' },
      { id: 'p2', eventId: 'ev1' },
    ]
    const r = analyzeEvent('ev1')
    expect(r.event.name).toBe('Corrida')
    expect(r.totalFotos).toBe(2)
  })

  it('retorna estrutura vazia quando evento não existe', () => {
    mockState.events = []
    const r = analyzeEvent('inexistente')
    expect(r.event).toBeNull()
    expect(r.totalFotos).toBe(0)
    expect(r.totalImportantes).toBe(0)
  })
})
