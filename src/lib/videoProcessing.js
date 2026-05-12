// src/lib/videoProcessing.js
// Geração de pré-visualização de vídeo com marca d'água "queimada" no MP4.
//
// Usamos ffmpeg-static (binário embarcado) + child_process. A marca d'água é
// gerada como PNG via sharp (a partir de SVG com texto repetido em diagonal)
// e sobreposta no vídeo escalado para resolução reduzida.
//
// Nada de fontfile externo: o SVG renderizado por sharp já desenha o texto
// usando libraqm/pango embutido na build do sharp. Funciona em Win/Linux.

import { spawn } from 'child_process'
import path from 'path'
import os from 'os'
import fs from 'fs'
import crypto from 'crypto'
import sharp from 'sharp'
import ffmpegPath from 'ffmpeg-static'
import { computeWatermarkBox } from './watermarkPlacement'
import { getDerivativeRuntimeConfig } from './derivedImagesConfig'
import { getVideoWatermarkPath } from './watermark'

// Resolução máxima do preview (altura). Largura escalada mantendo proporção.
const PREVIEW_MAX_HEIGHT = 540
// Bitrate alvo do preview (preview é "barato" propositalmente).
const PREVIEW_VIDEO_BITRATE = '900k'
const PREVIEW_AUDIO_BITRATE = '96k'
// Limite de tempo de processamento por vídeo. Evita travamento.
export const PREVIEW_PROCESS_TIMEOUT_MS = 4 * 60 * 1000

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// Renderiza um PNG (semitransparente) com o texto da marca d'água repetido em
// padrão diagonal. Será sobreposto sobre o vídeo na resolução do preview.
async function renderWatermarkPng({ width, height, text }) {
  const safe = escapeXml(text || 'PREVIEW')
  const fontSize = Math.max(16, Math.round(height / 18))
  const cols = 4
  const rows = 4
  const cellW = width / cols
  const cellH = height / rows

  const stamps = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = c * cellW + cellW / 2 + (r % 2 ? cellW / 4 : -cellW / 4)
      const cy = r * cellH + cellH / 2
      stamps.push(
        `<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" ` +
        `transform="rotate(-22 ${cx.toFixed(1)} ${cy.toFixed(1)})" ` +
        `text-anchor="middle" dominant-baseline="middle" ` +
        `font-family="Georgia, 'Times New Roman', serif" font-weight="700" ` +
        `font-size="${fontSize}" fill="white" fill-opacity="0.32" ` +
        `stroke="black" stroke-opacity="0.45" stroke-width="1.2" ` +
        `paint-order="stroke" letter-spacing="2">${safe}</text>`
      )
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    stamps.join('') +
    `</svg>`

  return sharp(Buffer.from(svg)).png().toBuffer()
}

function ffprobeDimensions(input) {
  // Usa o próprio ffmpeg para sondar dimensões via "-f null" e parsing de stderr.
  // Mais simples do que adicionar ffprobe-static. Se falhar, retorna null.
  return new Promise((resolve) => {
    const args = ['-i', input, '-hide_banner']
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let buf = ''
    proc.stderr.on('data', (d) => { buf += d.toString() })
    proc.on('error', () => resolve(null))
    proc.on('close', () => {
      const m = /Stream\s+#0:\d+.*Video:.*?,\s*(?:[^,]+,\s*)?(\d{2,5})x(\d{2,5})/.exec(buf)
      if (m) resolve({ width: parseInt(m[1], 10), height: parseInt(m[2], 10) })
      else resolve(null)
    })
  })
}

// Pré-processa o PNG da marca d'água: redimensiona para o tamanho calculado
// pelo `computeWatermarkBox` e aplica opacidade. Retorna o caminho temporário
// do PNG já dimensionado/translucido pronto para overlay.
async function preparePositionedWatermarkPng({ wmPath, opacity, frameWidth, frameHeight, anchor, sizeMode, offsetX, offsetY, scalePercent }) {
  const meta = await sharp(wmPath).metadata()
  const placement = computeWatermarkBox({
    imageWidth: frameWidth,
    imageHeight: frameHeight,
    watermarkWidth: meta.width || frameWidth,
    watermarkHeight: meta.height || frameHeight,
    sizeMode,
    anchor,
    offsetX,
    offsetY,
    scalePercent,
  })

  const targetW = Math.max(1, Math.round(placement.width))
  const targetH = Math.max(1, Math.round(placement.height))

  const resized = await sharp(wmPath)
    .resize(targetW, targetH, {
      fit: placement.fitMode || 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const pixels = new Uint8Array(resized.data)
  for (let i = 3; i < pixels.length; i += 4) {
    pixels[i] = Math.floor(pixels[i] * opacity)
  }

  const finalPng = await sharp(Buffer.from(pixels), {
    raw: { width: resized.info.width, height: resized.info.height, channels: 4 },
  }).png().toBuffer()

  const tmp = path.join(os.tmpdir(), `wm-pos-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.png`)
  await fs.promises.writeFile(tmp, finalPng)

  return {
    tmpPath: tmp,
    left: Math.round(placement.left),
    top: Math.round(placement.top),
    width: targetW,
    height: targetH,
  }
}

// Extrai um frame do vídeo (em "atSeconds") e retorna como Buffer JPEG.
// Útil para gerar poster automático no upload quando o admin não envia capa.
export async function extractVideoFrameBuffer(inputPath, atSeconds = 1.0) {
  if (!ffmpegPath) throw new Error('ffmpeg-static não disponível.')
  if (!inputPath || !fs.existsSync(inputPath)) throw new Error('Arquivo de entrada não encontrado.')

  const tmp = path.join(os.tmpdir(), `frame-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.jpg`)
  const args = [
    '-y',
    '-ss', String(Math.max(0, Number(atSeconds) || 0)),
    '-i', inputPath,
    '-frames:v', '1',
    '-q:v', '2',
    tmp,
  ]

  await new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let errBuf = ''
    proc.stderr.on('data', (d) => { errBuf = (errBuf + d.toString()).slice(-1500) })
    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL') } catch {}
      reject(new Error('ffmpeg frame timeout'))
    }, 60_000)
    proc.on('error', (err) => { clearTimeout(timer); reject(err) })
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(null)
      else reject(new Error(`ffmpeg frame exit ${code}: ${errBuf.slice(-300)}`))
    })
  })

  try {
    const buf = await fs.promises.readFile(tmp)
    return buf
  } finally {
    try { await fs.promises.unlink(tmp) } catch {}
  }
}

// Gera o MP4 de preview com marca d'água queimada.
// inputPath/outputPath: absolutos.
// opts.text: texto da marca d'água (ex.: "PREVIEW · NOMEALBUM"), usado se não houver PNG.
// opts.watermarkImagePath: caminho do PNG da marca d'água (preferencial).
// opts.watermarkConfig: config bruto (global mesclado com evento) para extrair anchor/scale/opacity.
export async function generateWatermarkedPreview(inputPath, outputPath, opts = {}) {
  if (!ffmpegPath) throw new Error('ffmpeg-static não disponível.')
  if (!inputPath || !fs.existsSync(inputPath)) throw new Error('Arquivo de entrada não encontrado.')

  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true })

  // Sondagem de dimensões para gerar overlay no tamanho exato do preview.
  const probe = await ffprobeDimensions(inputPath)
  let outW, outH
  if (probe && probe.width && probe.height) {
    const scale = Math.min(1, PREVIEW_MAX_HEIGHT / probe.height)
    outH = Math.round(probe.height * scale / 2) * 2
    outW = Math.round(probe.width * scale / 2) * 2
  } else {
    // Fallback: assume 16:9.
    outH = PREVIEW_MAX_HEIGHT
    outW = Math.round(PREVIEW_MAX_HEIGHT * 16 / 9 / 2) * 2
  }

  // Resolve a marca d'água: usa o caminho explícito; senão, resolve a partir
  // do config (watermarks/video.png → fallback para WM principal das fotos).
  let wmSourcePath = null
  if (opts.watermarkImagePath && fs.existsSync(opts.watermarkImagePath)) {
    wmSourcePath = opts.watermarkImagePath
  } else if (opts.watermarkConfig) {
    const resolved = getVideoWatermarkPath(opts.watermarkConfig)
    if (resolved && fs.existsSync(resolved)) wmSourcePath = resolved
  }

  // Se temos um PNG, posicionamos com a regra do config (anchor/sizeMode/scale/opacity).
  // Senão, caímos no PNG diagonal de texto (legado) cobrindo o quadro inteiro em 0,0.
  let wmTmp
  let wmTmpOwned = false
  let overlayLeft = 0
  let overlayTop = 0

  if (wmSourcePath) {
    const cfg = getDerivativeRuntimeConfig(opts.watermarkConfig || {})
    const positioned = await preparePositionedWatermarkPng({
      wmPath: wmSourcePath,
      opacity: typeof cfg.opacity === 'number' ? cfg.opacity : 0.45,
      frameWidth: outW,
      frameHeight: outH,
      anchor: cfg.anchor,
      sizeMode: cfg.sizeMode,
      offsetX: cfg.offsetX,
      offsetY: cfg.offsetY,
      scalePercent: cfg.scalePercent,
    })
    wmTmp = positioned.tmpPath
    wmTmpOwned = true
    // overlay precisa estar dentro do frame; ffmpeg corta automaticamente o que vazar
    overlayLeft = positioned.left
    overlayTop = positioned.top
  } else {
    const wmBuf = await renderWatermarkPng({ width: outW, height: outH, text: opts.text || 'PREVIEW' })
    wmTmp = path.join(os.tmpdir(), `wm-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.png`)
    await fs.promises.writeFile(wmTmp, wmBuf)
    wmTmpOwned = true
  }

  try {
    const filterComplex =
      `[0:v]scale=${outW}:${outH}:force_original_aspect_ratio=decrease,pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2:color=black[v0];` +
      `[v0][1:v]overlay=${overlayLeft}:${overlayTop}[v]`

    const args = [
      '-y',
      '-i', inputPath,
      '-i', wmTmp,
      '-filter_complex', filterComplex,
      '-map', '[v]',
      '-map', '0:a?',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '28',
      '-maxrate', PREVIEW_VIDEO_BITRATE,
      '-bufsize', '1800k',
      '-c:a', 'aac',
      '-b:a', PREVIEW_AUDIO_BITRATE,
      '-ac', '2',
      '-movflags', '+faststart',
      '-pix_fmt', 'yuv420p',
      outputPath,
    ]

    await new Promise((resolve, reject) => {
      const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] })
      let errBuf = ''
      proc.stderr.on('data', (d) => {
        const s = d.toString()
        // Mantém somente as últimas linhas para diagnóstico.
        errBuf = (errBuf + s).slice(-2000)
      })
      const timer = setTimeout(() => {
        try { proc.kill('SIGKILL') } catch {}
        reject(new Error('ffmpeg timeout (' + Math.round(PREVIEW_PROCESS_TIMEOUT_MS / 1000) + 's)'))
      }, PREVIEW_PROCESS_TIMEOUT_MS)
      proc.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
      proc.on('close', (code) => {
        clearTimeout(timer)
        if (code === 0) resolve(null)
        else reject(new Error('ffmpeg falhou (exit ' + code + '): ' + errBuf.slice(-400)))
      })
    })

    if (!fs.existsSync(outputPath)) throw new Error('Preview não foi gerado.')
    const stat = fs.statSync(outputPath)
    return { size: stat.size, width: outW, height: outH }
  } finally {
    if (wmTmpOwned) {
      try { await fs.promises.unlink(wmTmp) } catch {}
    }
  }
}
