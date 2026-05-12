// src/lib/db/schema.js
// Schema do banco. Estratégia "JSON-document": cada entidade tem
// (id, ..colunas indexáveis, data_json) — compatível com os reads/writes
// existentes que entregam objetos JS arbitrários.
//
// Pode evoluir para colunas reais por campo no futuro sem quebrar as APIs.

export const SCHEMA_VERSION = 1

export const SCHEMA_STATEMENTS = [
  // Versão
  `CREATE TABLE IF NOT EXISTS schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,

  // Clients (usuários — admin/cliente/colaborador) — também guarda carrinho/saldo/favoritos no JSON
  `CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    email TEXT,
    cpf TEXT,
    cnpj TEXT,
    whatsapp TEXT,
    is_admin INTEGER DEFAULT 0,
    is_super_admin INTEGER DEFAULT 0,
    is_colaborador INTEGER DEFAULT 0,
    ativo INTEGER DEFAULT 1,
    criado_em TEXT,
    atualizado_em TEXT,
    data_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email)`,
  `CREATE INDEX IF NOT EXISTS idx_clients_admin ON clients(is_admin, ativo)`,

  // Events (álbuns)
  `CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    public_id TEXT,
    name TEXT,
    date TEXT,
    visibilidade TEXT,
    colaborador_id TEXT,
    removido INTEGER DEFAULT 0,
    created_at TEXT,
    data_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_events_visibilidade ON events(visibilidade)`,
  `CREATE INDEX IF NOT EXISTS idx_events_colaborador ON events(colaborador_id)`,

  // Photos
  `CREATE TABLE IF NOT EXISTS photos (
    id TEXT PRIMARY KEY,
    public_id TEXT,
    event_id TEXT,
    pasta TEXT,
    colaborador_id TEXT,
    removida INTEGER DEFAULT 0,
    orfao_funcional INTEGER DEFAULT 0,
    vendida INTEGER DEFAULT 0,
    created_at TEXT,
    data_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_photos_event ON photos(event_id, removida)`,
  `CREATE INDEX IF NOT EXISTS idx_photos_pasta ON photos(event_id, pasta)`,

  // Pedidos
  `CREATE TABLE IF NOT EXISTS pedidos (
    id TEXT PRIMARY KEY,
    public_id TEXT,
    client_id TEXT,
    status TEXT,
    criado_em TEXT,
    atualizado_em TEXT,
    total REAL,
    data_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_pedidos_client ON pedidos(client_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos(status)`,

  // Comentários
  `CREATE TABLE IF NOT EXISTS comentarios (
    id TEXT PRIMARY KEY,
    event_id TEXT,
    photo_id TEXT,
    client_id TEXT,
    criado_em TEXT,
    data_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_comentarios_event ON comentarios(event_id)`,
  `CREATE INDEX IF NOT EXISTS idx_comentarios_photo ON comentarios(photo_id)`,

  // Solicitações de remoção
  `CREATE TABLE IF NOT EXISTS remocoes (
    id TEXT PRIMARY KEY,
    photo_id TEXT,
    status TEXT,
    criado_em TEXT,
    data_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_remocoes_status ON remocoes(status)`,

  // Feedbacks
  `CREATE TABLE IF NOT EXISTS feedbacks (
    id TEXT PRIMARY KEY,
    criado_em TEXT,
    data_json TEXT NOT NULL
  )`,

  // Avaliações
  `CREATE TABLE IF NOT EXISTS avaliacoes (
    id TEXT PRIMARY KEY,
    event_id TEXT,
    nota REAL,
    criado_em TEXT,
    data_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_avaliacoes_event ON avaliacoes(event_id)`,

  // Config (singleton)
  `CREATE TABLE IF NOT EXISTS config (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    data_json TEXT NOT NULL
  )`,

  // Counters (contador.json)
  `CREATE TABLE IF NOT EXISTS counters (
    name TEXT PRIMARY KEY,
    value INTEGER NOT NULL DEFAULT 0
  )`,
]

export function applySchema(db) {
  db.exec('BEGIN')
  try {
    for (const stmt of SCHEMA_STATEMENTS) db.exec(stmt)
    db.prepare(`INSERT OR REPLACE INTO schema_meta(key, value) VALUES ('version', ?)`)
      .run(String(SCHEMA_VERSION))
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export function readSchemaVersion(db) {
  try {
    const row = db.prepare(`SELECT value FROM schema_meta WHERE key = 'version'`).get()
    return row ? Number(row.value) : 0
  } catch { return 0 }
}
