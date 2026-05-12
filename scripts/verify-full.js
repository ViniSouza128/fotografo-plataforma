const { spawn, spawnSync } = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const PORT = Number(process.env.VERIFY_PORT || 3100)
const BASE_URL = `http://127.0.0.1:${PORT}`
const REPORT_DIR = path.join(ROOT, 'reports')
const REPORT_MD = path.join(REPORT_DIR, 'verify-latest.md')
const REPORT_JSON = path.join(REPORT_DIR, 'verify-latest.json')
const SCREENSHOT_DIR = path.join(REPORT_DIR, 'screenshots')

const WAIT_SERVER_MS = 45000
const PAGE_TIMEOUT_MS = 15000
const AUTH_SECRET = process.env.AUTH_SECRET || 'fotografo-plataforma-secret-key-2024'

function nowIso() {
  return new Date().toISOString()
}

function readJson(relativePath, fallback) {
  try {
    const file = path.join(ROOT, relativePath)
    if (!fs.existsSync(file)) return fallback
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    return fallback
  }
}

function writeFileRestore(relativePath, previousContent) {
  const file = path.join(ROOT, relativePath)
  if (previousContent === null) {
    if (fs.existsSync(file)) fs.rmSync(file, { force: true })
    return
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, previousContent, 'utf-8')
}

function getFileContentOrNull(relativePath) {
  const file = path.join(ROOT, relativePath)
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null
}

function getAdminClient() {
  const clients = readJson('data/clients.json', [])
  if (!Array.isArray(clients)) return null
  return clients.find(client => client?.isAdmin && client?.ativo !== false && !client?.mustChangePassword) || null
}

function publicClientData(client) {
  if (!client) return null
  const { senha, ...rest } = client
  return rest
}

function createAuthToken(client) {
  const payload = {
    id: client.id,
    email: client.email,
    isAdmin: !!client.isAdmin,
    isSuperAdmin: !!client.isSuperAdmin,
    sessionVersion: Number(client.sessionVersion || 0),
    mustChangePassword: !!client.mustChangePassword,
    exp: Date.now() + 60 * 60 * 1000,
  }
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(data).digest('base64url')
  return `${data}.${sig}`
}

async function createAuthenticatedContext(browser, client) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 950 },
    ignoreHTTPSErrors: true,
  })
  await context.addCookies([{
    name: 'auth_token',
    value: createAuthToken(client),
    url: BASE_URL,
    httpOnly: true,
    sameSite: 'Lax',
  }])
  await context.addInitScript((clientData) => {
    window.localStorage.setItem('clienteLogado', JSON.stringify(clientData))
  }, publicClientData(client))
  return context
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function run(command, args, options = {}) {
  const startedAt = Date.now()
  const isNpmOnWindows = process.platform === 'win32' && command === 'npm.cmd'
  const finalCommand = isNpmOnWindows ? 'cmd.exe' : command
  const finalArgs = isNpmOnWindows ? ['/d', '/s', '/c', ['npm', ...args].join(' ')] : args
  const result = spawnSync(finalCommand, finalArgs, {
    cwd: ROOT,
    encoding: 'utf-8',
    shell: false,
    maxBuffer: 1024 * 1024 * 8,
    ...options,
  })
  return {
    command: [command, ...args].join(' '),
    status: result.status,
    durationMs: Date.now() - startedAt,
    stdout: result.stdout || '',
    stderr: result.stderr || result.error?.message || '',
    ok: result.status === 0,
  }
}

function rimraf(relativePath) {
  const target = path.join(ROOT, relativePath)
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true })
}

function stopProcessOnPort(port) {
  if (process.platform !== 'win32') return
  spawnSync('powershell.exe', [
    '-NoProfile',
    '-Command',
    `$pids = Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($pid in $pids) { if ($pid -and $pid -ne 0) { Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue } }`,
  ], { cwd: ROOT, encoding: 'utf-8' })
}

function discoverStaticRoutes() {
  const appDir = path.join(ROOT, 'src', 'app')
  const routes = new Set()

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name.startsWith('api')) continue
        walk(full)
        continue
      }
      if (entry.name !== 'page.js') continue
      const relative = path.relative(appDir, dir)
      const parts = relative.split(path.sep).filter(Boolean)
      if (parts.some(part => part.startsWith('('))) continue
      if (parts.length === 0) {
        routes.add('/')
      } else {
        routes.add('/' + parts.join('/'))
      }
    }
  }

  walk(appDir)
  return [...routes].sort()
}

function resolveDynamicRoutes(routes) {
  const events = readJson('data/events.json', [])
  const firstEvent = Array.isArray(events) ? events.find(ev => ev?.id) : null

  return routes.flatMap(route => {
    if (!route.includes('[')) return [route]
    if (route === '/evento/[id]' && firstEvent?.id) return [`/evento/${encodeURIComponent(firstEvent.id)}`]
    if (route === '/admin/eventos/[id]' && firstEvent?.id) return [`/admin/eventos/${encodeURIComponent(firstEvent.id)}`]
    if (route === '/admin/upload-fotos/[eventId]' && firstEvent?.id) return [`/admin/upload-fotos/${encodeURIComponent(firstEvent.id)}`]
    return []
  })
}

function buildRoutesToVisit() {
  const discovered = resolveDynamicRoutes(discoverStaticRoutes())
  const important = [
    '/',
    '/login',
    '/cadastro',
    '/carrinho',
    '/checkout',
    '/compras',
    '/minha-conta',
    '/minha-conta/compras',
    '/minha-conta/carrinho',
    '/minha-conta/favoritos',
    '/minha-conta/remocoes',
    '/admin',
    '/admin/eventos',
    '/admin/pedidos',
    '/admin/clientes',
    '/admin/contatos',
    '/admin/configuracoes',
    '/politica-de-privacidade',
    '/termos-de-uso',
    '/politica-de-cookies',
    '/autenticidade',
    '/contato',
  ]
  return [...new Set([...important, ...discovered])].sort()
}

function getContextKindForRoute(route) {
  if (route.startsWith('/admin')) return 'admin'
  if (route.startsWith('/minha-conta')) return 'admin'
  return 'anon'
}

function startDevServer() {
  const isWindows = process.platform === 'win32'
  const command = isWindows ? 'cmd.exe' : 'npm'
  const args = isWindows
    ? ['/d', '/s', '/c', `npm run dev -- -p ${PORT} -H 127.0.0.1`]
    : ['run', 'dev', '--', '-p', String(PORT), '-H', '127.0.0.1']
  const child = spawn(command, args, {
    cwd: ROOT,
    env: { ...process.env, BROWSER: 'none' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  const logs = []
  child.stdout.on('data', chunk => logs.push(String(chunk)))
  child.stderr.on('data', chunk => logs.push(String(chunk)))
  return { child, logs }
}

async function waitForServer() {
  const deadline = Date.now() + WAIT_SERVER_MS
  let lastError = ''
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE_URL, { cache: 'no-store' })
      if (res.status < 500) return true
      lastError = `HTTP ${res.status}`
    } catch (error) {
      lastError = error.message
    }
    await new Promise(resolve => setTimeout(resolve, 750))
  }
  throw new Error(`Dev server nao respondeu em ${WAIT_SERVER_MS}ms. Ultimo erro: ${lastError}`)
}

function compactLog(text, limit = 5000) {
  const clean = String(text || '').trim()
  if (clean.length <= limit) return clean
  return clean.slice(-limit)
}

function isIgnorableConsole(msg) {
  const text = msg.text || ''
  return (
    text.includes('Download the React DevTools') ||
    text.includes('Next.js (14.2.0) is outdated') ||
    text.includes('Failed to load resource: the server responded with a status of 404')
  )
}

async function launchBrowser(playwright) {
  const launchOptions = { headless: process.env.VERIFY_HEADLESS !== '0' }
  try {
    return await playwright.chromium.launch({ ...launchOptions, channel: 'chrome' })
  } catch {
    return playwright.chromium.launch({ ...launchOptions })
  }
}

async function visitRoute(context, route, index) {
  const page = await context.newPage()
  const record = {
    route,
    contextKind: getContextKindForRoute(route),
    url: `${BASE_URL}${route}`,
    status: null,
    finalUrl: null,
    title: '',
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    warnings: [],
    ok: true,
    screenshot: null,
  }

  page.on('console', msg => {
    if (!['error', 'warning'].includes(msg.type())) return
    const item = { type: msg.type(), text: msg.text(), location: msg.location() }
    if (item.text.includes('Each child in a list should have a unique "key" prop')) {
      record.warnings.push({ url: record.url, method: 'console', error: item.text.split('\n')[0] })
      return
    }
    if (!isIgnorableConsole(item)) record.consoleErrors.push(item)
  })
  page.on('pageerror', error => {
    record.pageErrors.push(error.message)
  })
  page.on('requestfailed', request => {
    const failure = request.failure()
    record.failedRequests.push({
      url: request.url(),
      method: request.method(),
      error: failure?.errorText || 'request failed',
    })
  })
  page.on('response', response => {
    const status = response.status()
    const url = response.url()
    if (status >= 400 && url.startsWith(BASE_URL) && !url.endsWith('/favicon.ico')) {
      const item = { url, method: 'GET', error: `HTTP ${status}` }
      if (status >= 500) record.failedRequests.push(item)
      else record.warnings.push(item)
    }
  })

  try {
    const response = await page.goto(record.url, {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_TIMEOUT_MS,
    })
    record.status = response?.status() || null
    record.finalUrl = page.url()
    await page.waitForLoadState('networkidle', { timeout: 7000 }).catch(() => {})
    record.title = await page.title().catch(() => '')

    const crashText = await page.locator('text=/Unhandled Runtime Error|Application error|TypeError:|ReferenceError:/i').count().catch(() => 0)
    if (crashText > 0) {
      record.pageErrors.push('Tela contem mensagem de erro runtime.')
    }

    if (record.status >= 500 || record.pageErrors.length || record.consoleErrors.some(e => e.type === 'error')) {
      record.ok = false
      const name = `${String(index + 1).padStart(2, '0')}-${route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home'}.png`
      const screenshotPath = path.join(SCREENSHOT_DIR, name)
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {})
      record.screenshot = path.relative(ROOT, screenshotPath).replace(/\\/g, '/')
    }
  } catch (error) {
    record.ok = false
    record.pageErrors.push(error.message)
    const name = `${String(index + 1).padStart(2, '0')}-${route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home'}-exception.png`
    const screenshotPath = path.join(SCREENSHOT_DIR, name)
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {})
    record.screenshot = path.relative(ROOT, screenshotPath).replace(/\\/g, '/')
  } finally {
    await page.close().catch(() => {})
  }

  if (record.status >= 500 || record.pageErrors.length || record.consoleErrors.some(e => e.type === 'error')) {
    record.ok = false
  }
  return record
}

async function runBrowserAudit() {
  const playwright = require('playwright')
  const browser = await launchBrowser(playwright)
  const anonContext = await browser.newContext({
    viewport: { width: 1440, height: 950 },
    ignoreHTTPSErrors: true,
  })
  const adminContext = await createAdminContext(browser)

  const routes = buildRoutesToVisit()
  const results = []
  for (let i = 0; i < routes.length; i++) {
    const context = getContextKindForRoute(routes[i]) === 'admin' ? adminContext : anonContext
    results.push(await visitRoute(context, routes[i], i))
  }

  const checks = await runInteractiveChecks({ browser, anonContext, adminContext })
  await anonContext.close().catch(() => {})
  await adminContext.close().catch(() => {})
  await browser.close()
  return { routes: results, checks }
}

async function createAdminContext(browser) {
  const admin = getAdminClient()
  const context = admin
    ? await createAuthenticatedContext(browser, admin)
    : await browser.newContext({
      viewport: { width: 1440, height: 950 },
      ignoreHTTPSErrors: true,
    })
  if (!admin) return context
  await context.addInitScript((client) => {
    window.localStorage.setItem('adminLogado', 'true')
  }, publicClientData(admin))
  return context
}

async function recordCheck(checks, name, fn) {
  const check = { name, ok: false, details: [], screenshot: null }
  try {
    await fn(check)
    check.ok = true
  } catch (error) {
    check.ok = false
    check.details.push(error.message)
  }
  checks.push(check)
}

function assertCondition(condition, message) {
  if (!condition) throw new Error(message)
}

async function screenshotCheck(page, check, name) {
  const screenshotPath = path.join(SCREENSHOT_DIR, `check-${name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}.png`)
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {})
  check.screenshot = path.relative(ROOT, screenshotPath).replace(/\\/g, '/')
}

async function runInteractiveChecks({ browser, anonContext, adminContext }) {
  const checks = []

  await recordCheck(checks, 'API admin /api/auth/me valida sessao sintetica', async (check) => {
    const admin = getAdminClient()
    assertCondition(admin, 'Nenhum admin ativo encontrado em data/clients.json.')
    const res = await adminContext.request.get(`${BASE_URL}/api/auth/me`)
    const data = await res.json().catch(() => null)
    assertCondition(res.ok(), `/api/auth/me retornou HTTP ${res.status()}.`)
    assertCondition(data?.client?.isAdmin === true, '/api/auth/me nao retornou client admin.')
    check.details.push(`Admin autenticado: ${data.client.email || data.client.id}`)
  })

  await recordCheck(checks, 'Home mostra acesso ao painel para admin logado', async (check) => {
    const page = await adminContext.newPage()
    try {
      await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS })
      await page.waitForLoadState('networkidle', { timeout: 7000 }).catch(() => {})
      const adminLink = page.getByRole('link', { name: /area do fotografo|área do fotógrafo|fotografo|fotógrafo/i }).first()
      await assertLocatorVisible(adminLink, 'Link/botao "Area do fotografo" nao apareceu na home/navbar.')
      const href = await adminLink.getAttribute('href')
      assertCondition(href === '/admin' || href?.startsWith('/admin'), `Link admin aponta para ${href || 'vazio'}.`)
    } catch (error) {
      await screenshotCheck(page, check, 'home-admin-link')
      throw error
    } finally {
      await page.close().catch(() => {})
    }
  })

  await recordCheck(checks, 'Painel admin abre sem cair em Minha Conta ou Login', async (check) => {
    const page = await adminContext.newPage()
    try {
      await page.goto(`${BASE_URL}/admin`, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS })
      await page.waitForLoadState('networkidle', { timeout: 7000 }).catch(() => {})
      const finalUrl = page.url()
      assertCondition(!finalUrl.includes('/minha-conta'), `Redirecionou indevidamente para ${finalUrl}.`)
      assertCondition(!finalUrl.includes('/login'), `Redirecionou indevidamente para ${finalUrl}.`)
      await assertLocatorVisible(page.getByRole('heading', { name: /dashboard/i }).first(), 'Heading Dashboard nao encontrado.')
    } catch (error) {
      await screenshotCheck(page, check, 'admin-dashboard')
      throw error
    } finally {
      await page.close().catch(() => {})
    }
  })

  await recordCheck(checks, 'Menu admin tem links essenciais clicaveis', async (check) => {
    const page = await adminContext.newPage()
    try {
      await page.goto(`${BASE_URL}/admin`, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS })
      const expectedLinks = [
        { label: 'Pedidos', href: '/admin/pedidos' },
        { label: 'Albuns', href: '/admin/eventos' },
        { label: 'Comentarios', href: '/admin/comentarios' },
        { label: 'Contas', href: '/admin/clientes' },
        { label: 'Carrinhos', href: '/admin/carrinhos' },
        { label: 'Contatos', href: '/admin/contatos' },
        { label: 'Remocoes', href: '/admin/remocoes' },
      ]
      for (const expected of expectedLinks) {
        const link = page.locator(`a[href="${expected.href}"]`).first()
        await assertLocatorVisible(link, `Link admin "${expected.label}" nao encontrado.`)
        const href = await link.getAttribute('href')
        assertCondition(Boolean(href), `Link admin "${expected.label}" sem href.`)
      }
      const buttons = await page.locator('button').count()
      check.details.push(`${buttons} botoes encontrados no dashboard/admin layout.`)
    } catch (error) {
      await screenshotCheck(page, check, 'admin-menu')
      throw error
    } finally {
      await page.close().catch(() => {})
    }
  })

  await recordCheck(checks, 'Formulario de contato envia e persiste mensagem consultavel', async (check) => {
      const previousContacts = getFileContentOrNull('data/contatos.json')
    const page = await anonContext.newPage()
    try {
      await page.goto(`${BASE_URL}/contato`, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS })
      await page.waitForLoadState('networkidle', { timeout: 7000 }).catch(() => {})
      await page.locator('#nome').waitFor({ state: 'visible', timeout: 7000 })
      await page.locator('#nome').fill('Teste Automatico')
      await page.locator('#email').fill('teste-automatico@example.com')
      await page.locator('#assunto').fill('Verificacao automatica')
      await page.locator('#mensagem').fill('Mensagem temporaria criada pelo verify-full e restaurada ao final.')
      await assertCondition(await page.locator('#nome').inputValue() === 'Teste Automatico', 'Campo nome nao manteve o valor preenchido.')
      await assertCondition(await page.locator('#assunto').inputValue() === 'Verificacao automatica', 'Campo assunto nao manteve o valor preenchido.')
      const responsePromise = page.waitForResponse(resp => resp.url().includes('/api/contato') && resp.request().method() === 'POST', { timeout: 10000 })
      await page.getByRole('button', { name: /enviar mensagem/i }).click()
      const response = await responsePromise
      assertCondition(response.ok(), `/api/contato retornou HTTP ${response.status()}.`)
      await assertLocatorVisible(page.getByText(/mensagem enviada/i).first(), 'Mensagem de sucesso do contato nao apareceu.')
      const contacts = readJson('data/contatos.json', [])
      assertCondition(Array.isArray(contacts), 'data/contatos.json nao virou array.')
      assertCondition(contacts.some(item => item.email === 'teste-automatico@example.com'), 'Mensagem de teste nao apareceu no JSON.')
      check.details.push('Contato foi salvo e o arquivo foi restaurado depois do teste.')
    } catch (error) {
      await screenshotCheck(page, check, 'contact-form')
      throw error
    } finally {
      await page.close().catch(() => {})
      writeFileRestore('data/contatos.json', previousContacts)
    }
  })

  await recordCheck(checks, 'Admin consulta contatos e campos de triagem renderizam', async (check) => {
    const page = await adminContext.newPage()
    try {
      await page.goto(`${BASE_URL}/admin/contatos`, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS })
      await page.waitForLoadState('networkidle', { timeout: 7000 }).catch(() => {})
      await assertLocatorVisible(page.getByRole('heading', { name: /contatos/i }).first(), 'Pagina admin/contatos nao renderizou titulo.')
      await assertLocatorVisible(page.getByPlaceholder(/buscar por nome/i).first(), 'Busca de contatos nao apareceu.')
      await assertLocatorVisible(page.locator('select').first(), 'Filtro/status de contatos nao apareceu.')
    } catch (error) {
      await screenshotCheck(page, check, 'admin-contatos')
      throw error
    } finally {
      await page.close().catch(() => {})
    }
  })

  await recordCheck(checks, 'APIs principais retornam formatos esperados', async (check) => {
    const publicChecks = [
      ['/api/events', Array.isArray],
      ['/api/photos', Array.isArray],
      ['/api/config', value => value && typeof value === 'object' && !JSON.stringify(value).includes('api_key') && !JSON.stringify(value).includes('secret_key')],
    ]
    for (const [url, validate] of publicChecks) {
      const res = await anonContext.request.get(`${BASE_URL}${url}`)
      const data = await res.json().catch(() => null)
      assertCondition(res.ok(), `${url} retornou HTTP ${res.status()}.`)
      assertCondition(validate(data), `${url} retornou formato inesperado.`)
    }

    const adminChecks = [
      ['/api/pedidos?admin=1', Array.isArray],
      ['/api/clients', Array.isArray],
      ['/api/contato', Array.isArray],
    ]
    for (const [url, validate] of adminChecks) {
      const res = await adminContext.request.get(`${BASE_URL}${url}`)
      const data = await res.json().catch(() => null)
      assertCondition(res.ok(), `${url} retornou HTTP ${res.status()}.`)
      assertCondition(validate(data), `${url} retornou formato inesperado.`)
    }
    check.details.push(`${publicChecks.length + adminChecks.length} endpoints validados.`)
  })

  await recordCheck(checks, 'Fluxo LGPD exporta, solicita e aprova exclusao de cliente temporario', async (check) => {
    const snapshots = {
      clients: getFileContentOrNull('data/clients.json'),
      pedidos: getFileContentOrNull('data/pedidos.json'),
      audit: getFileContentOrNull('data/audit_log.json'),
      remocoes: getFileContentOrNull('data/remocoes.json'),
      comentarios: getFileContentOrNull('data/comentarios.json'),
      carrinhos: getFileContentOrNull('data/carrinhos.json'),
    }
    let clientContext = null
    try {
      const suffix = crypto.randomUUID().slice(0, 8)
      const tempClient = {
        id: `verify-lgpd-${suffix}`,
        nomeCompleto: 'Cliente Verify LGPD',
        email: `verify-lgpd-${suffix}@example.com`,
        whatsapp: '11999990000',
        cpf: '12345678909',
        senha: 'verify-only',
        ativo: true,
        isAdmin: false,
        sessionVersion: 0,
        favoritos: ['foto-favorita-lgpd'],
        curtidas: ['foto-curtida-lgpd'],
        carrinho: [{ id: 'foto-carrinho-lgpd', price: 10 }],
        criadoEm: nowIso(),
        atualizadoEm: nowIso(),
      }
      const tempPedido = {
        id: `pedido-lgpd-${suffix}`,
        clientId: tempClient.id,
        nome: tempClient.nomeCompleto,
        email: tempClient.email,
        whatsapp: tempClient.whatsapp,
        cpf: tempClient.cpf,
        status: 'pago',
        total: 10,
        itens: [{ id: 'foto-paga-lgpd', photoId: 'foto-paga-lgpd', price: 10 }],
        criadoEm: nowIso(),
      }

      const clients = readJson('data/clients.json', [])
      const pedidos = readJson('data/pedidos.json', [])
      fs.writeFileSync(path.join(ROOT, 'data', 'clients.json'), JSON.stringify([...clients, tempClient], null, 2), 'utf-8')
      fs.writeFileSync(path.join(ROOT, 'data', 'pedidos.json'), JSON.stringify([...pedidos, tempPedido], null, 2), 'utf-8')

      clientContext = await createAuthenticatedContext(browser, tempClient)

      const exportRes = await clientContext.request.get(`${BASE_URL}/api/clients/lgpd`)
      const exportData = await exportRes.json().catch(() => null)
      assertCondition(exportRes.ok(), `/api/clients/lgpd export retornou HTTP ${exportRes.status()}.`)
      assertCondition(exportData?.titular?.id === tempClient.id, 'Exportacao LGPD nao retornou o titular temporario.')
      assertCondition(!('senha' in (exportData?.titular || {})), 'Exportacao LGPD vazou campo senha no titular.')
      assertCondition(Array.isArray(exportData?.pedidos) && exportData.pedidos.some(p => p.id === tempPedido.id), 'Exportacao LGPD nao incluiu pedido vinculado.')

      const requestRes = await clientContext.request.post(`${BASE_URL}/api/clients/lgpd`, {
        data: { reason: 'Teste automatico verify-full' },
      })
      const requestData = await requestRes.json().catch(() => null)
      assertCondition(requestRes.ok(), `/api/clients/lgpd POST retornou HTTP ${requestRes.status()}.`)
      assertCondition(requestData?.request?.status === 'pending', 'Solicitacao LGPD nao ficou pendente.')

      const approveRes = await adminContext.request.patch(`${BASE_URL}/api/clients/lgpd`, {
        data: { clientId: tempClient.id, action: 'approve', adminNote: 'Aprovado pelo verify-full' },
      })
      const approveData = await approveRes.json().catch(() => null)
      assertCondition(approveRes.ok(), `/api/clients/lgpd PATCH approve retornou HTTP ${approveRes.status()}: ${approveData?.error || ''}`)
      assertCondition(approveData?.client?.lgpdDeleted === true, 'Aprovacao LGPD nao marcou cliente como removido.')

      const updatedClients = readJson('data/clients.json', [])
      const updatedPedidos = readJson('data/pedidos.json', [])
      const updatedAudit = readJson('data/audit_log.json', [])
      const deletedClient = updatedClients.find(client => client.id === tempClient.id)
      const anonymizedOrder = updatedPedidos.find(pedido => pedido.id === tempPedido.id)
      assertCondition(deletedClient?.email === `deleted-${tempClient.id}@local.invalid`, 'Cliente temporario nao foi desidentificado.')
      assertCondition(anonymizedOrder?.lgpdAnonymized === true && anonymizedOrder?.clientId === null, 'Pedido temporario nao foi desidentificado/preservado.')
      assertCondition(updatedAudit.some(entry => entry.action === 'client.data_exported' && entry.target?.id === tempClient.id), 'Audit log nao registrou exportacao LGPD.')
      assertCondition(updatedAudit.some(entry => entry.action === 'client.deletion_requested' && entry.target?.id === tempClient.id), 'Audit log nao registrou solicitacao LGPD.')
      assertCondition(updatedAudit.some(entry => entry.action === 'client.deletion_approved' && entry.target?.id === tempClient.id), 'Audit log nao registrou aprovacao LGPD.')
      check.details.push('Cliente e pedido temporarios foram criados, exportados, solicitados, aprovados, desidentificados e restaurados.')
    } catch (error) {
      throw error
    } finally {
      if (clientContext) await clientContext.close().catch(() => {})
      for (const [key, content] of Object.entries(snapshots)) {
        const map = {
          clients: 'data/clients.json',
          pedidos: 'data/pedidos.json',
          audit: 'data/audit_log.json',
          remocoes: 'data/remocoes.json',
          comentarios: 'data/comentarios.json',
          carrinhos: 'data/carrinhos.json',
        }
        writeFileRestore(map[key], content)
      }
    }
  })

  await recordCheck(checks, 'Formularios essenciais possuem inputs e botoes esperados', async (check) => {
    const pages = [
      { url: '/login', selectors: ['input[type="email"]', 'input[type="password"]'], button: /entrar/i },
      { url: '/cadastro', selectors: ['input[type="text"]', 'input[type="email"]', 'input[type="tel"]', 'input[type="password"]'], button: /criar conta|cadastrar/i },
      { url: '/contato', selectors: ['#nome', '#assunto', '#mensagem'], button: /enviar mensagem/i },
    ]
    for (const spec of pages) {
      const page = await anonContext.newPage()
      try {
        await page.goto(`${BASE_URL}${spec.url}`, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS })
        for (const selector of spec.selectors) {
          await assertLocatorVisible(page.locator(selector).first(), `${spec.url}: input ${selector} nao encontrado.`)
        }
        await assertLocatorVisible(page.getByRole('button', { name: spec.button }).first(), `${spec.url}: botao principal nao encontrado.`)
      } finally {
        await page.close().catch(() => {})
      }
    }
    check.details.push(`${pages.length} formularios verificados.`)
  })

  return checks
}

async function assertLocatorVisible(locator, message) {
  try {
    await locator.waitFor({ state: 'visible', timeout: 7000 })
  } catch {
    throw new Error(message)
  }
}

function renderMarkdown(report) {
  const failed = report.routes.filter(route => !route.ok)
  const warnings = report.routes.filter(route => route.ok && (route.consoleErrors.length || route.warnings?.length))
  const failedChecks = (report.checks || []).filter(check => !check.ok)
  const lines = []
  lines.push('# Relatorio de verificacao automatica')
  lines.push('')
  lines.push(`Gerado em: ${report.finishedAt}`)
  lines.push(`Base URL: ${report.baseUrl}`)
  lines.push(`Resultado: ${report.ok ? 'APROVADO' : 'REPROVADO'}`)
  lines.push('')
  lines.push('## Comandos')
  for (const command of report.commands) {
    lines.push(`- ${command.ok ? 'OK' : 'FALHOU'} \`${command.command}\` (${command.durationMs}ms)`)
  }
  lines.push('')
  lines.push('## Resumo')
  lines.push(`- Rotas visitadas: ${report.routes.length}`)
  lines.push(`- Rotas com falha: ${failed.length}`)
  lines.push(`- Rotas com avisos de console: ${warnings.length}`)
  lines.push(`- Checks interativos: ${(report.checks || []).length}`)
  lines.push(`- Checks com falha: ${failedChecks.length}`)
  lines.push('')

  if ((report.checks || []).length) {
    lines.push('## Checks interativos')
    for (const check of report.checks) {
      lines.push(`### ${check.ok ? 'OK' : 'FALHOU'} ${check.name}`)
      for (const detail of check.details || []) lines.push(`- ${detail}`)
      if (check.screenshot) lines.push(`- Screenshot: \`${check.screenshot}\``)
      lines.push('')
    }
  }

  if (failed.length) {
    lines.push('## Falhas')
    for (const route of failed) {
      lines.push(`### ${route.route}`)
      lines.push(`- Status: ${route.status || 'sem resposta'}`)
      lines.push(`- URL final: ${route.finalUrl || route.url}`)
      if (route.screenshot) lines.push(`- Screenshot: \`${route.screenshot}\``)
      for (const err of route.pageErrors) lines.push(`- Page error: ${err}`)
      for (const err of route.consoleErrors) lines.push(`- Console ${err.type}: ${err.text}`)
      for (const err of route.failedRequests.slice(0, 6)) lines.push(`- Request: ${err.method} ${err.url} -> ${err.error}`)
      for (const err of (route.warnings || []).slice(0, 6)) lines.push(`- Warning request: ${err.method} ${err.url} -> ${err.error}`)
      lines.push('')
    }
  }

  if (warnings.length) {
    lines.push('## Avisos')
    for (const route of warnings) {
      lines.push(`### ${route.route}`)
      for (const err of route.consoleErrors) lines.push(`- Console ${err.type}: ${err.text}`)
      for (const err of (route.warnings || []).slice(0, 10)) lines.push(`- Request: ${err.method} ${err.url} -> ${err.error}`)
      lines.push('')
    }
  }

  lines.push('## Rotas')
  for (const route of report.routes) {
    lines.push(`- ${route.ok ? 'OK' : 'FALHOU'} ${route.route} -> ${route.status || '-'} ${route.finalUrl || ''}`)
  }

  if (report.serverLog) {
    lines.push('')
    lines.push('## Log do servidor dev')
    lines.push('```text')
    lines.push(report.serverLog)
    lines.push('```')
  }

  return lines.join('\n')
}

async function main() {
  ensureDir(REPORT_DIR)
  ensureDir(SCREENSHOT_DIR)

  const report = {
    startedAt: nowIso(),
    finishedAt: null,
    baseUrl: BASE_URL,
    ok: false,
    commands: [],
    routes: [],
    checks: [],
    serverLog: '',
  }

  let dev = null
  try {
    rimraf('.next')
    stopProcessOnPort(PORT)
    const build = run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'])
    report.commands.push(build)
    if (!build.ok) {
      report.serverLog = compactLog(`${build.stdout}\n${build.stderr}`)
      throw new Error('Build falhou.')
    }

    dev = startDevServer()
    await waitForServer()
    const audit = await runBrowserAudit()
    report.routes = audit.routes
    report.checks = audit.checks
    report.ok = report.routes.every(route => route.ok) && report.checks.every(check => check.ok)
  } catch (error) {
    report.error = error.message
  } finally {
    if (dev?.child && !dev.child.killed) {
      if (process.platform === 'win32') {
        spawnSync('taskkill.exe', ['/pid', String(dev.child.pid), '/t', '/f'], { encoding: 'utf-8' })
      } else {
        dev.child.kill()
      }
    }
    report.serverLog = compactLog(dev?.logs?.join('') || report.serverLog)
    report.finishedAt = nowIso()
    ensureDir(REPORT_DIR)
    fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), 'utf-8')
    fs.writeFileSync(REPORT_MD, renderMarkdown(report), 'utf-8')
  }

  console.log(`Relatorio: ${REPORT_MD}`)
  if (!report.ok) {
    console.error(report.error || 'Verificacao encontrou falhas.')
    process.exit(1)
  }
}

main()
