import { readConfig } from './config'

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '')
}

function cleanInstagram(value) {
  return String(value || '').replace(/^@+/, '').trim()
}

export function getPublicStudioConfig() {
  const cfg = readConfig()

  return {
    nomeEstudio: String(cfg.nomeEstudio || cfg.razaoSocial || 'Estudio de fotografia').trim(),
    razaoSocial: String(cfg.razaoSocial || '').trim(),
    cnpj: onlyDigits(cfg.cnpj),
    cpf: onlyDigits(cfg.cpf),
    localizacao: String(cfg.localizacao || '').trim(),
    whatsapp: onlyDigits(cfg.whatsapp),
    instagram: cleanInstagram(cfg.instagram),
  }
}

export function getStudioDisplayName(studio = {}) {
  return studio.razaoSocial || studio.nomeEstudio || 'Estudio de fotografia'
}
