// src/lib/db/repositories.js
// Repositórios SQLite por entidade. Cada repo expõe:
//   readAll() -> array de objetos JS (parsed)
//   writeAll(rows) -> substitui toda a tabela em uma transação
// Para cada tabela "json-document" (id, ..colunas indexáveis, data_json),
// extraímos as colunas indexáveis via mapeadores específicos.

import { getDb } from './connection'

// ---------- helpers ----------
function parseRow(row) {
  if (!row) return null
  try { return JSON.parse(row.data_json) } catch { return null }
}

function bool01(v) { return v ? 1 : 0 }

// ---------- Genérico para tabelas (id, data_json) sem colunas extras ----------
function makeBasicRepo(table) {
  return {
    readAll() {
      const db = getDb(); if (!db) return []
      try {
        return db.prepare(`SELECT data_json FROM ${table}`).all().map(parseRow).filter(Boolean)
      } catch { return [] }
    },
    writeAll(rows) {
      const db = getDb(); if (!db) return false
      const insert = db.prepare(`INSERT INTO ${table} (id, data_json) VALUES (@id, @data_json)`)
      const tx = db.transaction(items => {
        db.prepare(`DELETE FROM ${table}`).run()
        for (const item of items) {
          const id = item?.id || cryptoRandomId()
          insert.run({ id, data_json: JSON.stringify(item) })
        }
      })
      tx(Array.isArray(rows) ? rows : [])
      return true
    },
  }
}

function cryptoRandomId() {
  // Fallback para itens sem id explícito
  try { return require('crypto').randomUUID() } catch { return String(Math.random()).slice(2) }
}

// ---------- CLIENTS ----------
export const clientsRepo = {
  readAll() {
    const db = getDb(); if (!db) return []
    try { return db.prepare(`SELECT data_json FROM clients`).all().map(parseRow).filter(Boolean) }
    catch { return [] }
  },
  writeAll(rows) {
    const db = getDb(); if (!db) return false
    const insert = db.prepare(`INSERT INTO clients
      (id, email, cpf, cnpj, whatsapp, is_admin, is_super_admin, is_colaborador, ativo, criado_em, atualizado_em, data_json)
      VALUES (@id, @email, @cpf, @cnpj, @whatsapp, @is_admin, @is_super_admin, @is_colaborador, @ativo, @criado_em, @atualizado_em, @data_json)`)
    const tx = db.transaction(items => {
      db.prepare(`DELETE FROM clients`).run()
      for (const c of items) {
        if (!c?.id) continue
        insert.run({
          id: c.id,
          email: c.email || null,
          cpf: c.cpf || null,
          cnpj: c.cnpj || null,
          whatsapp: c.whatsapp || null,
          is_admin: bool01(c.isAdmin),
          is_super_admin: bool01(c.isSuperAdmin),
          is_colaborador: bool01(c.isColaborador),
          ativo: c.ativo === false ? 0 : 1,
          criado_em: c.criadoEm || null,
          atualizado_em: c.atualizadoEm || null,
          data_json: JSON.stringify(c),
        })
      }
    })
    tx(Array.isArray(rows) ? rows : [])
    return true
  },
}

// ---------- EVENTS ----------
export const eventsRepo = {
  readAll() {
    const db = getDb(); if (!db) return []
    try { return db.prepare(`SELECT data_json FROM events`).all().map(parseRow).filter(Boolean) }
    catch { return [] }
  },
  writeAll(rows) {
    const db = getDb(); if (!db) return false
    const insert = db.prepare(`INSERT INTO events
      (id, public_id, name, date, visibilidade, colaborador_id, removido, created_at, data_json)
      VALUES (@id, @public_id, @name, @date, @visibilidade, @colaborador_id, @removido, @created_at, @data_json)`)
    const tx = db.transaction(items => {
      db.prepare(`DELETE FROM events`).run()
      for (const e of items) {
        if (!e?.id) continue
        insert.run({
          id: e.id,
          public_id: e.publicId || null,
          name: e.name || null,
          date: e.date || null,
          visibilidade: e.visibilidade || 'publico',
          colaborador_id: e.colaboradorId || null,
          removido: bool01(e.removido),
          created_at: e.createdAt || null,
          data_json: JSON.stringify(e),
        })
      }
    })
    tx(Array.isArray(rows) ? rows : [])
    return true
  },
}

// ---------- PHOTOS ----------
export const photosRepo = {
  readAll() {
    const db = getDb(); if (!db) return []
    try { return db.prepare(`SELECT data_json FROM photos`).all().map(parseRow).filter(Boolean) }
    catch { return [] }
  },
  writeAll(rows) {
    const db = getDb(); if (!db) return false
    const insert = db.prepare(`INSERT INTO photos
      (id, public_id, event_id, pasta, colaborador_id, removida, orfao_funcional, vendida, created_at, data_json)
      VALUES (@id, @public_id, @event_id, @pasta, @colaborador_id, @removida, @orfao_funcional, @vendida, @created_at, @data_json)`)
    const tx = db.transaction(items => {
      db.prepare(`DELETE FROM photos`).run()
      for (const p of items) {
        if (!p?.id) continue
        insert.run({
          id: p.id,
          public_id: p.publicId || null,
          event_id: p.eventId || null,
          pasta: p.pasta || null,
          colaborador_id: p.colaboradorId || null,
          removida: bool01(p.removida),
          orfao_funcional: bool01(p.orfaoFuncional),
          vendida: bool01(p.vendida),
          created_at: p.createdAt || null,
          data_json: JSON.stringify(p),
        })
      }
    })
    tx(Array.isArray(rows) ? rows : [])
    return true
  },
}

// ---------- PEDIDOS ----------
export const pedidosRepo = {
  readAll() {
    const db = getDb(); if (!db) return []
    try { return db.prepare(`SELECT data_json FROM pedidos`).all().map(parseRow).filter(Boolean) }
    catch { return [] }
  },
  writeAll(rows) {
    const db = getDb(); if (!db) return false
    const insert = db.prepare(`INSERT INTO pedidos
      (id, public_id, client_id, status, criado_em, atualizado_em, total, data_json)
      VALUES (@id, @public_id, @client_id, @status, @criado_em, @atualizado_em, @total, @data_json)`)
    const tx = db.transaction(items => {
      db.prepare(`DELETE FROM pedidos`).run()
      for (const p of items) {
        if (!p?.id) continue
        insert.run({
          id: p.id,
          public_id: p.publicId || null,
          client_id: p.clientId || null,
          status: p.status || null,
          criado_em: p.criadoEm || null,
          atualizado_em: p.atualizadoEm || null,
          total: Number(p.total) || 0,
          data_json: JSON.stringify(p),
        })
      }
    })
    tx(Array.isArray(rows) ? rows : [])
    return true
  },
}

// ---------- COMENTÁRIOS ----------
export const comentariosRepo = {
  readAll() {
    const db = getDb(); if (!db) return []
    try { return db.prepare(`SELECT data_json FROM comentarios`).all().map(parseRow).filter(Boolean) }
    catch { return [] }
  },
  writeAll(rows) {
    const db = getDb(); if (!db) return false
    const insert = db.prepare(`INSERT INTO comentarios
      (id, event_id, photo_id, client_id, criado_em, data_json)
      VALUES (@id, @event_id, @photo_id, @client_id, @criado_em, @data_json)`)
    const tx = db.transaction(items => {
      db.prepare(`DELETE FROM comentarios`).run()
      for (const c of items) {
        if (!c?.id) continue
        insert.run({
          id: c.id,
          event_id: c.eventId || null,
          photo_id: c.photoId || null,
          client_id: c.clientId || c.autorId || null,
          criado_em: c.criadoEm || c.createdAt || null,
          data_json: JSON.stringify(c),
        })
      }
    })
    tx(Array.isArray(rows) ? rows : [])
    return true
  },
}

// ---------- REMOÇÕES ----------
export const remocoesRepo = {
  readAll() {
    const db = getDb(); if (!db) return []
    try { return db.prepare(`SELECT data_json FROM remocoes`).all().map(parseRow).filter(Boolean) }
    catch { return [] }
  },
  writeAll(rows) {
    const db = getDb(); if (!db) return false
    const insert = db.prepare(`INSERT INTO remocoes
      (id, photo_id, status, criado_em, data_json)
      VALUES (@id, @photo_id, @status, @criado_em, @data_json)`)
    const tx = db.transaction(items => {
      db.prepare(`DELETE FROM remocoes`).run()
      for (const r of items) {
        if (!r?.id) continue
        insert.run({
          id: r.id,
          photo_id: r.photoId || null,
          status: r.status || null,
          criado_em: r.criadoEm || r.createdAt || null,
          data_json: JSON.stringify(r),
        })
      }
    })
    tx(Array.isArray(rows) ? rows : [])
    return true
  },
}

// ---------- FEEDBACKS ----------
export const feedbacksRepo = {
  readAll() {
    const db = getDb(); if (!db) return []
    try { return db.prepare(`SELECT data_json FROM feedbacks`).all().map(parseRow).filter(Boolean) }
    catch { return [] }
  },
  writeAll(rows) {
    const db = getDb(); if (!db) return false
    const insert = db.prepare(`INSERT INTO feedbacks (id, criado_em, data_json) VALUES (@id, @criado_em, @data_json)`)
    const tx = db.transaction(items => {
      db.prepare(`DELETE FROM feedbacks`).run()
      for (const f of items) {
        if (!f?.id) continue
        insert.run({
          id: f.id,
          criado_em: f.criadoEm || f.createdAt || null,
          data_json: JSON.stringify(f),
        })
      }
    })
    tx(Array.isArray(rows) ? rows : [])
    return true
  },
}

// ---------- AVALIAÇÕES ----------
export const avaliacoesRepo = {
  readAll() {
    const db = getDb(); if (!db) return []
    try { return db.prepare(`SELECT data_json FROM avaliacoes`).all().map(parseRow).filter(Boolean) }
    catch { return [] }
  },
  writeAll(rows) {
    const db = getDb(); if (!db) return false
    const insert = db.prepare(`INSERT INTO avaliacoes (id, event_id, nota, criado_em, data_json)
      VALUES (@id, @event_id, @nota, @criado_em, @data_json)`)
    const tx = db.transaction(items => {
      db.prepare(`DELETE FROM avaliacoes`).run()
      for (const a of items) {
        if (!a?.id) continue
        insert.run({
          id: a.id,
          event_id: a.eventId || null,
          nota: Number(a.nota) || null,
          criado_em: a.criadoEm || a.createdAt || null,
          data_json: JSON.stringify(a),
        })
      }
    })
    tx(Array.isArray(rows) ? rows : [])
    return true
  },
}

// ---------- CONFIG (singleton) ----------
export const configRepo = {
  read() {
    const db = getDb(); if (!db) return null
    try {
      const row = db.prepare(`SELECT data_json FROM config WHERE id = 1`).get()
      return row ? JSON.parse(row.data_json) : null
    } catch { return null }
  },
  write(obj) {
    const db = getDb(); if (!db) return false
    const j = JSON.stringify(obj || {})
    db.prepare(`INSERT INTO config (id, data_json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json`).run(j)
    return true
  },
}

// ---------- COUNTERS ----------
export const countersRepo = {
  readAll() {
    const db = getDb(); if (!db) return {}
    try {
      const rows = db.prepare(`SELECT name, value FROM counters`).all()
      const out = {}
      for (const r of rows) out[r.name] = Number(r.value)
      return out
    } catch { return {} }
  },
  writeAll(obj) {
    const db = getDb(); if (!db) return false
    const insert = db.prepare(`INSERT INTO counters (name, value) VALUES (@name, @value)
      ON CONFLICT(name) DO UPDATE SET value = excluded.value`)
    const tx = db.transaction(entries => {
      db.prepare(`DELETE FROM counters`).run()
      for (const [name, value] of entries) {
        insert.run({ name: String(name), value: Number(value) || 0 })
      }
    })
    const entries = Object.entries(obj || {})
    tx(entries)
    return true
  },
}
