import fs from 'fs'
import path from 'path'
import { normalizeDerivativeConfig } from './derivedImagesConfig'
import { useDb } from './db/router'
import { configRepo } from './db/repositories'
import { DATA_DIR, ensureRuntimeDirs } from './runtimePaths'

const CONFIG_PATH = path.join(DATA_DIR, 'config.json')

const DEFAULT_CONFIG = () => normalizeDerivativeConfig({
  whatsapp: '',
  nomeEstudio: 'Vinicius Rodrigues Fotografia',
  instagram: '',
  cpf: '',
  cnpj: '',
  razaoSocial: '',
  localizacao: '',
})

export function readConfig() {
  if (useDb()) {
    const stored = configRepo.read()
    if (stored) return normalizeDerivativeConfig(stored)
    const defaults = DEFAULT_CONFIG()
    configRepo.write(defaults)
    return defaults
  }
  if (!fs.existsSync(CONFIG_PATH)) {
    const defaultConfig = DEFAULT_CONFIG()
    ensureRuntimeDirs()
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2), 'utf-8')
    return defaultConfig
  }
  return normalizeDerivativeConfig(JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')))
}

export function writeConfig(config) {
  const normalized = normalizeDerivativeConfig(config)
  if (useDb()) { configRepo.write(normalized); return }
  ensureRuntimeDirs()
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(normalized, null, 2), 'utf-8')
}
