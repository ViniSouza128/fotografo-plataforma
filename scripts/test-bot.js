#!/usr/bin/env node
/* eslint-disable no-console */
// scripts/test-bot.js
// Bot de testes funcionais: bate na API real, verifica arquivos no disco
// e relata cada cenário com PASS/FAIL. Limpa atrás de si.
//
// Uso:
//   node scripts/test-bot.js                       (porta 3000)
//   node scripts/test-bot.js --port 3004           (porta custom)
//   node scripts/test-bot.js --keep                (não apaga uploads de teste)

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ROOT = process.cwd()

const args = process.argv.slice(2)
const PORT = (() => {
  const i = args.indexOf('--port')
  if (i >= 0 && args[i + 1]) return Number(args[i + 1])
  return 3000
})()
const KEEP = args.includes('--keep')

const BASE_URL = `http://localhost:${PORT}`
const TEST_EVENT_ID = '2b555113-6a7f-4b92-a097-c749985572f4'

const cookies = []

let pass = 0
let fail = 0
const failures = []

function logPass(name, detail = '') {
  pass += 1
  console.log(`\x1b[32m✓\x1b[0m ${name}${detail ? '  ' + detail : ''}`)
}
function logFail(name, err) {
  fail += 1
  failures.push({ name, err })
  const msg = err?.stack || err?.message || String(err)
  console.log(`\x1b[31m✗\x1b[0m ${name}\n   ${msg.split('\n').join('\n   ')}`)
}
function logHeader(label) {
  console.log(`\n\x1b[36m── ${label} ──\x1b[0m`)
}

function buildCookieHeader() {
  return cookies.length ? cookies.map(c => `${c.name}=${c.value}`).join('; ') : ''
}

function parseSetCookie(setCookieHeaderArr) {
  // setCookieHeaderArr é uma string única ou array. Vamos lidar com qualquer um.
  const arr = Array.isArray(setCookieHeaderArr) ? setCookieHeaderArr : [setCookieHeaderArr].filter(Boolean)
  for (const raw of arr) {
    if (!raw) continue
    const first = raw.split(';')[0]
    const [name, ...rest] = first.split('=')
    if (!name) continue
    const value = rest.join('=')
    const idx = cookies.findIndex(c => c.name === name.trim())
    if (idx >= 0) cookies[idx].value = value
    else cookies.push({ name: name.trim(), value })
  }
}

async function httpJson(method, urlPath, body, extraHeaders = {}) {
  const url = `${BASE_URL}${urlPath}`
  const headers = { 'Content-Type': 'application/json', ...extraHeaders }
  const cookieHeader = buildCookieHeader()
  if (cookieHeader) headers['Cookie'] = cookieHeader
  const res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : res.headers.get('set-cookie')
  if (setCookie) parseSetCookie(setCookie)
  let json = null
  const text = await res.text()
  try { json = text ? JSON.parse(text) : null } catch { json = text }
  return { status: res.status, json }
}

async function httpForm(urlPath, formFields) {
  const url = `${BASE_URL}${urlPath}`
  const fd = new FormData()
  for (const [k, v] of Object.entries(formFields)) {
    fd.append(k, v)
  }
  const headers = {}
  const cookieHeader = buildCookieHeader()
  if (cookieHeader) headers['Cookie'] = cookieHeader
  const res = await fetch(url, { method: 'POST', headers, body: fd })
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : res.headers.get('set-cookie')
  if (setCookie) parseSetCookie(setCookie)
  let json = null
  const text = await res.text()
  try { json = text ? JSON.parse(text) : null } catch { json = text }
  return { status: res.status, json }
}

function fileFromPath(absPath, mime) {
  const buf = fs.readFileSync(absPath)
  return new Blob([buf], { type: mime || 'application/octet-stream' })
}

async function waitFor(predicate, { timeoutMs = 10000, intervalMs = 250, label = '' } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const v = await predicate()
      if (v) return v
    } catch {}
    await new Promise(r => setTimeout(r, intervalMs))
  }
  throw new Error(`waitFor timeout (${timeoutMs}ms): ${label}`)
}

async function ensureLoggedIn() {
  const { status, json } = await httpJson('POST', '/api/auth/login', {
    email: 'admin@test.com',
    senha: '123456',
  })
  if (status !== 200) throw new Error(`login falhou status=${status} body=${JSON.stringify(json)}`)
  if (!json?.client?.id) throw new Error(`login sem client: ${JSON.stringify(json)}`)
  return json.client
}

async function testServerUp() {
  try {
    const res = await fetch(`${BASE_URL}/`)
    if (res.ok) logPass('Server is up', `${BASE_URL}`)
    else throw new Error(`status=${res.status}`)
  } catch (err) {
    logFail('Server is up', err)
    throw err
  }
}

async function testLogin() {
  try {
    const client = await ensureLoggedIn()
    if (!client.isAdmin) throw new Error('cliente não é admin')
    logPass('Admin login (admin@test.com/123456)', `id=${client.id.slice(0, 8)}`)
  } catch (err) {
    logFail('Admin login', err)
    throw err
  }
}

async function testListEvents() {
  try {
    const { status, json } = await httpJson('GET', '/api/events')
    if (status !== 200) throw new Error(`status=${status}`)
    if (!Array.isArray(json)) throw new Error('resposta não é array')
    const ev = json.find(e => e.id === TEST_EVENT_ID)
    if (!ev) throw new Error(`evento ${TEST_EVENT_ID} não encontrado`)
    logPass('GET /api/events lista evento de teste', `name="${ev.name}"`)
  } catch (err) {
    logFail('GET /api/events', err)
  }
}

async function testListPhotos() {
  try {
    const { status, json } = await httpJson('GET', `/api/photos?eventId=${TEST_EVENT_ID}&limit=5`)
    if (status !== 200) throw new Error(`status=${status}`)
    if (!Array.isArray(json)) throw new Error('resposta não é array')
    if (json.length === 0) throw new Error('nenhuma foto retornada')
    const sample = json[0]
    if (!sample.urls?.modal) throw new Error('foto sem urls.modal')
    if (!sample.pathGridWm?.startsWith(TEST_EVENT_ID + '/')) {
      throw new Error(`pathGridWm não tem prefixo de evento: ${sample.pathGridWm}`)
    }
    logPass('GET /api/photos retorna fotos com paths per-event', `1ª: ${sample.publicId}`)
  } catch (err) {
    logFail('GET /api/photos', err)
  }
}

async function testPhotoUploadWithBackgroundJob() {
  let uploadedFilename = null
  let savedPhotoId = null
  try {
    // 1) Pega uma JPG existente como amostra
    const sampleDir = path.join(ROOT, 'public', 'uploads', TEST_EVENT_ID, 'grid', 'wm')
    const samples = fs.readdirSync(sampleDir).filter(n => n.endsWith('.jpg'))
    if (samples.length === 0) throw new Error('nenhuma amostra jpg disponível')
    const samplePath = path.join(sampleDir, samples[0])
    const blob = fileFromPath(samplePath, 'image/jpeg')

    // 2) POST /api/upload (deve retornar rapidamente, sem derivadas)
    const startUpload = Date.now()
    const fd = new FormData()
    fd.append('file', blob, `testbot-${Date.now()}.jpg`)
    fd.append('eventId', TEST_EVENT_ID)
    const cookieHeader = buildCookieHeader()
    const upRes = await fetch(`${BASE_URL}/api/upload`, {
      method: 'POST',
      headers: { Cookie: cookieHeader },
      body: fd,
    })
    const uploadMs = Date.now() - startUpload
    const upJson = await upRes.json()
    if (!upRes.ok) throw new Error(`upload status=${upRes.status} body=${JSON.stringify(upJson)}`)
    if (!upJson.filename) throw new Error('resposta sem filename')
    uploadedFilename = upJson.filename
    logPass('POST /api/upload (sem derivadas inline)', `${uploadMs}ms · filename=${uploadedFilename}`)

    // 3) Confirma que NÃO há derivadas no disco ainda
    const gridWmPath = path.join(ROOT, 'public', 'uploads', TEST_EVENT_ID, 'grid', 'wm', uploadedFilename)
    if (fs.existsSync(gridWmPath)) {
      logFail('Upload sem derivadas inline (esperado: arquivo grid/wm não existe ainda)',
        new Error(`mas existe: ${gridWmPath}`))
    } else {
      logPass('Após /api/upload, derivadas ainda NÃO existem no disco (worker é assíncrono)')
    }

    // 4) POST /api/photos para registrar metadados (enfileira derivadas)
    const photoBody = {
      eventId: TEST_EVENT_ID,
      filename: uploadedFilename,
      price: 1.5,
      originalName: 'testbot.jpg',
      size: upJson.size,
      author: 'testbot',
      originalPath: upJson.originalPath,
    }
    const photoRes = await httpJson('POST', '/api/photos', photoBody)
    if (photoRes.status !== 201) throw new Error(`photos POST status=${photoRes.status} body=${JSON.stringify(photoRes.json)}`)
    if (!photoRes.json?.id) throw new Error('photos POST sem id')
    savedPhotoId = photoRes.json.id
    if (photoRes.json.pathGridWm !== `${TEST_EVENT_ID}/grid/wm/${uploadedFilename}`) {
      throw new Error(`pathGridWm errado: ${photoRes.json.pathGridWm}`)
    }
    logPass('POST /api/photos retorna 201 com pathGridWm per-event', `id=${savedPhotoId.slice(0, 8)}`)

    // 5) Verifica que o job foi enfileirado em data/jobs.json (pode já ter sido processado)
    const jobsPath = path.join(ROOT, 'data', 'jobs.json')
    if (fs.existsSync(jobsPath)) {
      const jobs = JSON.parse(fs.readFileSync(jobsPath, 'utf-8'))
      logPass('data/jobs.json existe', `${jobs.length} job(s) na fila no momento da leitura`)
    } else {
      logFail('data/jobs.json não foi criado', new Error('arquivo ausente'))
    }

    // 6) Aguarda até o worker gerar todas as 6 derivadas
    const expectedKinds = [
      ['grid', 'wm'], ['grid', 'clean'],
      ['thumbs', 'wm'], ['thumbs', 'clean'],
      ['mini', 'wm'], ['mini', 'clean'],
    ]
    await waitFor(() => {
      return expectedKinds.every(([k, w]) => {
        const p = path.join(ROOT, 'public', 'uploads', TEST_EVENT_ID, k, w, uploadedFilename)
        return fs.existsSync(p)
      })
    }, { timeoutMs: 30000, label: 'derivadas geradas pelo worker' })
    logPass('Worker em segundo plano gerou todas as 6 derivadas (grid/thumbs/mini × wm/clean)')

    // 7) Confirma que jobs.json eventualmente remove o job (o worker
    // remove o registro logo após escrever os arquivos, mas pode haver
    // microsegundos de janela; faz polling curto).
    try {
      await waitFor(() => {
        const j = JSON.parse(fs.readFileSync(jobsPath, 'utf-8'))
        return !j.find(x => x.payload?.photoId === savedPhotoId)
      }, { timeoutMs: 5000, intervalMs: 100, label: 'job removido após sucesso' })
      logPass('Job photo-derivatives foi removido da fila após sucesso')
    } catch (err) {
      const j = JSON.parse(fs.readFileSync(jobsPath, 'utf-8'))
      const stillForThis = j.find(x => x.payload?.photoId === savedPhotoId)
      logFail('Job da foto deveria ter sido removido após sucesso',
        new Error(`ainda na fila: ${JSON.stringify(stillForThis)}`))
    }
  } catch (err) {
    logFail('Upload + worker pipeline', err)
  } finally {
    // Cleanup: deleta a foto criada
    if (savedPhotoId && !KEEP) {
      try {
        await httpJson('DELETE', `/api/photos?id=${savedPhotoId}&permanente=1`,
          { estrategia: 'agressivo', permanente: true })
      } catch {}
    }
  }
}

async function testVideoUploadWithBackgroundJobs() {
  let videoFilename = null
  let videoId = null
  try {
    // Procura um MP4 íntegro (size razoável) para reusar como amostra.
    // Ignora MP4 truncados de testes anteriores (< 1MB) e arquivos *_wm já
    // processados por watermark.
    let samplePath = null
    let sampleSize = 0
    const videoBuckets = fs.readdirSync(path.join(ROOT, 'storage', 'originals'))
    for (const bucket of videoBuckets) {
      const dir = path.join(ROOT, 'storage', 'originals', bucket, 'videos')
      if (!fs.existsSync(dir)) continue
      for (const name of fs.readdirSync(dir)) {
        if (!name.endsWith('.mp4') || name.includes('_wm')) continue
        const fp = path.join(dir, name)
        const sz = fs.statSync(fp).size
        if (sz < 1_000_000) continue // pula amostras pequenas/corrompidas
        samplePath = fp
        sampleSize = sz
        break
      }
      if (samplePath) break
    }
    if (!samplePath) {
      logFail('Video upload', new Error('nenhuma amostra MP4 íntegra (>=1MB) disponível para teste'))
      return
    }
    logPass('Sample MP4 selecionado', `${path.basename(samplePath)} · ${(sampleSize / 1024 / 1024).toFixed(1)} MB`)

    // 1) /api/upload-video — deve usar .partial e renomear atomicamente
    const blob = fileFromPath(samplePath, 'video/mp4')
    const fd = new FormData()
    fd.append('file', blob, `testbot-${Date.now()}.mp4`)
    fd.append('eventId', TEST_EVENT_ID)
    const cookieHeader = buildCookieHeader()
    const startUpload = Date.now()
    const upRes = await fetch(`${BASE_URL}/api/upload-video`, {
      method: 'POST',
      headers: { Cookie: cookieHeader },
      body: fd,
    })
    const uploadMs = Date.now() - startUpload
    const upJson = await upRes.json()
    if (!upRes.ok) throw new Error(`upload-video status=${upRes.status} body=${JSON.stringify(upJson)}`)
    if (!upJson.filename) throw new Error('resposta sem filename')
    videoFilename = upJson.filename
    if (upJson.previewWmStatus !== 'pending') {
      logFail('upload-video deveria retornar previewWmStatus=pending (delegado ao worker)',
        new Error(`recebido: ${upJson.previewWmStatus}`))
    } else {
      logPass('POST /api/upload-video (rápido, preview pendente para worker)', `${uploadMs}ms`)
    }

    // 2) Confirma que não tem .partial sobrando
    const partialPath = path.join(ROOT, 'storage', 'originals', TEST_EVENT_ID, 'videos', `${videoFilename}.partial`)
    if (fs.existsSync(partialPath)) {
      logFail('Upload deveria renomear .partial → final', new Error(`.partial ainda existe: ${partialPath}`))
    } else {
      logPass('Upload de vídeo renomeou .partial para o nome final atômicamente')
    }

    // 3) /api/videos POST — registra e enfileira jobs
    const regBody = {
      eventId: TEST_EVENT_ID,
      filename: videoFilename,
      originalName: 'testbot.mp4',
      originalPath: upJson.originalPath,
      size: upJson.size,
      width: 1920,
      height: 1080,
      duration: 5,
      price: 2.0,
      resolutions: [],
    }
    const regRes = await httpJson('POST', '/api/videos', regBody)
    if (regRes.status !== 201) throw new Error(`videos POST status=${regRes.status} body=${JSON.stringify(regRes.json)}`)
    videoId = regRes.json.id
    logPass('POST /api/videos registrou vídeo', `id=${videoId.slice(0, 8)}`)

    // 4) Worker deve gerar poster (clean+wm) — pode levar uns segundos
    await waitFor(async () => {
      const r = await httpJson('GET', `/api/videos?eventId=${TEST_EVENT_ID}&ids=${videoId}`)
      const v = r.json?.find?.(x => x.id === videoId)
      return v?.posterClean && v?.posterWm
    }, { timeoutMs: 60000, label: 'worker gerou posters clean+wm' })
    logPass('Worker gerou poster clean + posterWm em segundo plano')

    // 5) Worker deve gerar preview MP4 (com WM via ffmpeg)
    await waitFor(async () => {
      const r = await httpJson('GET', `/api/videos?eventId=${TEST_EVENT_ID}&ids=${videoId}`)
      const v = r.json?.find?.(x => x.id === videoId)
      return v?.previewWmStatus === 'ready'
    }, { timeoutMs: 5 * 60_000, label: 'worker gerou preview MP4 com WM' })
    logPass('Worker gerou preview MP4 com WM (ffmpeg)')

    // 6) Verifica arquivos no disco
    const cleanPosterFile = path.join(ROOT, 'public', 'uploads', 'video-posters', 'clean', videoFilename.replace(/\.\w+$/, '.jpg'))
    const wmPosterFile = path.join(ROOT, 'public', 'uploads', 'video-posters', 'wm', videoFilename.replace(/\.\w+$/, '.jpg'))
    const previewWmFile = path.join(ROOT, 'storage', 'originals', TEST_EVENT_ID, 'videos', videoFilename.replace(/\.\w+$/, '_wm.mp4'))
    const allOk = fs.existsSync(cleanPosterFile) && fs.existsSync(wmPosterFile) && fs.existsSync(previewWmFile)
    if (!allOk) {
      throw new Error(`arquivos esperados ausentes: clean=${fs.existsSync(cleanPosterFile)} wm=${fs.existsSync(wmPosterFile)} preview=${fs.existsSync(previewWmFile)}`)
    }
    logPass('Arquivos físicos: posterClean, posterWm e preview_wm.mp4 estão no disco')
  } catch (err) {
    logFail('Video upload + background pipeline', err)
  } finally {
    if (videoId && !KEEP) {
      try {
        await httpJson('DELETE', `/api/videos?id=${videoId}`)
      } catch {}
    }
  }
}

async function testJobsQueueBootRecovery() {
  // Usa diretamente o lib via require seria complicado em next runtime; aqui
  // só validamos que o arquivo data/jobs.json existe e é válido JSON.
  try {
    const jobsPath = path.join(ROOT, 'data', 'jobs.json')
    if (!fs.existsSync(jobsPath)) {
      logFail('data/jobs.json existe', new Error('arquivo ausente'))
      return
    }
    const jobs = JSON.parse(fs.readFileSync(jobsPath, 'utf-8'))
    if (!Array.isArray(jobs)) throw new Error('jobs.json não é array')
    // Garante que nenhum job ficou em "processing" pendurado
    const stuck = jobs.filter(j => j.status === 'processing')
    if (stuck.length > 0) {
      logFail('Nenhum job preso em "processing"',
        new Error(`${stuck.length} jobs em processing: ${stuck.map(j => j.id).join(', ')}`))
    } else {
      logPass('Nenhum job preso em "processing" (boot recovery saudável)')
    }
  } catch (err) {
    logFail('Jobs queue health', err)
  }
}

async function testPartialFilesCleanup() {
  // Verifica que não há .partial sobrando em videos
  try {
    const dir = path.join(ROOT, 'storage', 'originals')
    if (!fs.existsSync(dir)) {
      logPass('storage/originals limpo', '(diretório não existe)')
      return
    }
    let stale = []
    for (const bucket of fs.readdirSync(dir)) {
      const vdir = path.join(dir, bucket, 'videos')
      if (!fs.existsSync(vdir)) continue
      for (const f of fs.readdirSync(vdir)) {
        if (f.endsWith('.partial')) stale.push(`${bucket}/videos/${f}`)
      }
    }
    if (stale.length > 0) {
      logFail('Sem arquivos .partial sobrando', new Error(stale.join(', ')))
    } else {
      logPass('Sem arquivos .partial sobrando em storage/originals/<eventId>/videos')
    }
  } catch (err) {
    logFail('Partial files check', err)
  }
}

async function testPerEventPaths() {
  // Verifica que os derivativos das fotos existem em <eventId>/<kind>/<wm>/
  try {
    const r = await httpJson('GET', `/api/photos?eventId=${TEST_EVENT_ID}&limit=3`)
    const sample = r.json?.[0]
    if (!sample) throw new Error('nenhuma foto')
    const expected = path.join(ROOT, 'public', 'uploads', TEST_EVENT_ID, 'grid', 'wm', sample.filename)
    if (!fs.existsSync(expected)) {
      throw new Error(`arquivo esperado ausente: ${expected}`)
    }
    logPass('Layout per-event: derivada existe em public/uploads/<eventId>/grid/wm/...')
  } catch (err) {
    logFail('Layout per-event', err)
  }
}

async function testVideoWatermarkOnPosterWm() {
  // Verifica que ao menos um vídeo tem posterWm com tamanho razoável
  try {
    const r = await httpJson('GET', `/api/videos?eventId=${TEST_EVENT_ID}`)
    const list = Array.isArray(r.json) ? r.json : []
    const withWmPoster = list.filter(v => v.posterWm)
    if (withWmPoster.length === 0) {
      logFail('Algum vídeo tem posterWm', new Error('nenhum vídeo com posterWm encontrado'))
      return
    }
    // Verifica que o arquivo existe no disco
    const v = withWmPoster[0]
    const wmPath = path.join(ROOT, 'public', 'uploads', 'video-posters', 'wm', v.filename.replace(/\.\w+$/, '.jpg'))
    if (!fs.existsSync(wmPath)) {
      throw new Error(`posterWm referenciado mas arquivo não existe: ${wmPath}`)
    }
    const stat = fs.statSync(wmPath)
    if (stat.size < 1000) throw new Error(`posterWm muito pequeno: ${stat.size} bytes`)
    logPass(`Vídeo "${v.originalName}" tem posterWm no disco`, `${(stat.size / 1024).toFixed(1)} KB`)
  } catch (err) {
    logFail('Video posterWm check', err)
  }
}

async function testPublicEventPage() {
  // Apenas valida que a página renderiza (status 200) — UX é validada no Chrome.
  try {
    const res = await fetch(`${BASE_URL}/evento/${TEST_EVENT_ID}`)
    if (!res.ok) throw new Error(`status=${res.status}`)
    const html = await res.text()

    // Checa que o HTML não tem padrões claramente errados
    // (anchor aninhada gera erro de hidratação no Chrome)
    if (/<a[^>]*>[^<]*<a[^>]*>/.test(html)) {
      logFail('Página pública do evento — sem <a> aninhada',
        new Error('encontrou <a> aninhada no HTML servido'))
    } else {
      logPass(`Página pública /evento/${TEST_EVENT_ID.slice(0, 8)}... carrega sem nested <a>`)
    }
  } catch (err) {
    logFail('Página pública do evento', err)
  }
}

async function testAdminEventPage() {
  try {
    const res = await fetch(`${BASE_URL}/admin/eventos/${TEST_EVENT_ID}`, {
      headers: { Cookie: buildCookieHeader() },
    })
    if (!res.ok) throw new Error(`status=${res.status}`)
    logPass(`Página admin /admin/eventos/${TEST_EVENT_ID.slice(0, 8)}... carrega (200)`)
  } catch (err) {
    logFail('Página admin do evento', err)
  }
}

async function testUploadFotosPage() {
  try {
    const res = await fetch(`${BASE_URL}/admin/upload-fotos/${TEST_EVENT_ID}`, {
      headers: { Cookie: buildCookieHeader() },
    })
    if (!res.ok) throw new Error(`status=${res.status}`)
    logPass(`Página upload-fotos carrega (200)`)
  } catch (err) {
    logFail('Página upload-fotos', err)
  }
}

async function testMiddlewareBlocksNonDerivative() {
  // /uploads/<eventId>/<kind>/... deveria passar; /uploads/foo deveria bloquear.
  try {
    const res = await fetch(`${BASE_URL}/uploads/foo-private.txt`)
    if (res.status !== 404) {
      logFail('Middleware bloqueia /uploads/<arquivo-não-público>',
        new Error(`status esperado 404, recebido ${res.status}`))
    } else {
      logPass('Middleware bloqueia /uploads/foo-private.txt → 404')
    }
  } catch (err) {
    logFail('Middleware check', err)
  }
}

async function testWatermarkEndpointFallback() {
  // Acessa /api/images/derive de uma foto existente; deve gerar e redirecionar.
  try {
    const r = await httpJson('GET', `/api/photos?eventId=${TEST_EVENT_ID}&limit=1`)
    const sample = r.json?.[0]
    if (!sample) throw new Error('nenhuma foto')
    const url = `/api/images/derive?filename=${encodeURIComponent(sample.filename)}&kind=thumbs&watermark=wm&eventId=${TEST_EVENT_ID}&mode=ensure`
    const { status, json } = await httpJson('GET', url)
    if (status !== 200) throw new Error(`status=${status}`)
    if (!json?.ok) throw new Error(`resposta não ok: ${JSON.stringify(json)}`)
    if (!json.url || !json.url.includes(TEST_EVENT_ID)) {
      throw new Error(`url não tem eventId: ${json.url}`)
    }
    logPass('/api/images/derive (mode=ensure) retorna URL per-event', `${json.url}`)
  } catch (err) {
    logFail('/api/images/derive endpoint', err)
  }
}

async function main() {
  console.log(`\n\x1b[1mBot de testes — ${BASE_URL}\x1b[0m`)

  logHeader('Infraestrutura')
  await testServerUp()
  await testLogin()

  logHeader('API básica')
  await testListEvents()
  await testListPhotos()

  logHeader('Pipeline assíncrono — fotos')
  await testPhotoUploadWithBackgroundJob()

  logHeader('Pipeline assíncrono — vídeos')
  await testVideoUploadWithBackgroundJobs()

  logHeader('Saúde da fila + recuperação')
  await testJobsQueueBootRecovery()
  await testPartialFilesCleanup()

  logHeader('Layout per-event + watermark')
  await testPerEventPaths()
  await testVideoWatermarkOnPosterWm()
  await testWatermarkEndpointFallback()

  logHeader('Páginas web (status only)')
  await testPublicEventPage()
  await testAdminEventPage()
  await testUploadFotosPage()
  await testMiddlewareBlocksNonDerivative()

  console.log(`\n\x1b[1mResumo:\x1b[0m \x1b[32m${pass} PASS\x1b[0m  ${fail > 0 ? '\x1b[31m' + fail + ' FAIL\x1b[0m' : '0 FAIL'}`)
  if (fail > 0) {
    console.log(`\n\x1b[31mFalhas:\x1b[0m`)
    failures.forEach(f => console.log(`  - ${f.name}`))
    process.exit(1)
  }
}

main().catch(err => {
  console.error('\n\x1b[31mErro fatal:\x1b[0m', err)
  process.exit(2)
})
