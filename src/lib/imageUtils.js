// src/lib/imageUtils.js
// Shared image-processing helpers for server contexts only.

import fs from 'fs'
import sharp from 'sharp'
import { getWatermarkAbsolutePath } from './watermark'
import { computeWatermarkBox, normalizeAnchor, normalizeSizeMode, clampOffset, clampScalePercent } from './watermarkPlacement'

function roundDimension(value) {
  return Math.max(1, Math.round(value))
}

function escapeXml(input) {
  return String(input || '').replace(/[<>&"']/g, (ch) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
  }[ch]))
}

// Composes an SVG label with the photo's publicId (#) and originalName.
// White text + dark stroke + drop shadow for readability over any background.
// Returns a sharp-compatible buffer (JPEG) of the same dimensions as `inputBuffer`.
export async function applyLabelOverlayToBuffer(inputBuffer, { publicId = '', originalName = '', quality = 80 } = {}) {
  if (!publicId && !originalName) return inputBuffer
  const meta = await sharp(inputBuffer).metadata()
  const width = meta.width || 0
  const height = meta.height || 0
  if (!width || !height) return inputBuffer

  const idLine = publicId ? `#${escapeXml(publicId)}` : ''
  const nameLine = originalName ? escapeXml(originalName) : ''

  // Scale font with image; cap on max size.
  const baseFont = Math.max(11, Math.min(28, Math.round(width / 36)))
  const lineHeight = Math.round(baseFont * 1.15)
  const padX = Math.round(baseFont * 0.65)
  const padBottom = Math.round(baseFont * 0.85)
  // Bottom-left anchor.
  const yName = height - padBottom
  const yId = yName - (idLine && nameLine ? lineHeight : 0)
  const stroke = Math.max(1, Math.round(baseFont / 9))

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <filter id="dropShadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="${Math.round(baseFont / 6)}" stdDeviation="${Math.round(baseFont / 6)}" flood-color="#000" flood-opacity="0.85"/>
      </filter>
    </defs>
    <g font-family="-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-weight="700" filter="url(#dropShadow)">
      ${idLine ? `<text x="${padX}" y="${yId}" font-size="${baseFont}" fill="#ffffff" stroke="#000" stroke-width="${stroke}" stroke-linejoin="round" paint-order="stroke">${idLine}</text>` : ''}
      ${nameLine ? `<text x="${padX}" y="${yName}" font-size="${Math.round(baseFont * 0.85)}" fill="#ffffff" stroke="#000" stroke-width="${Math.max(1, stroke - 1)}" stroke-linejoin="round" paint-order="stroke" opacity="0.95">${nameLine}</text>` : ''}
    </g>
  </svg>`

  return sharp(inputBuffer)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality })
    .toBuffer()
}

export async function applyWatermarkToBuffer(resizedBuffer, opacity = 0.45, quality = 75, options = {}) {
  const normalizedOptions = typeof options === 'string'
    ? { authorName: options }
    : (options || {})

  const authorName = normalizedOptions.authorName || 'Vinicius Rodrigues'
  const anchor = normalizeAnchor(normalizedOptions.anchor || normalizedOptions.position || 'center')
  const sizeMode = normalizeSizeMode(normalizedOptions.sizeMode || 'proportional')
  const offsetX = clampOffset(normalizedOptions.offsetX)
  const offsetY = clampOffset(normalizedOptions.offsetY)
  const scalePercent = clampScalePercent(normalizedOptions.scalePercent)
  const fallbackPath = getWatermarkAbsolutePath('global')
  const watermarkPath = normalizedOptions.watermarkPath && fs.existsSync(normalizedOptions.watermarkPath)
    ? normalizedOptions.watermarkPath
    : (fs.existsSync(fallbackPath) ? fallbackPath : null)

  const { width, height } = await sharp(resizedBuffer).metadata()

  if (watermarkPath) {
    const source = sharp(watermarkPath)
    const meta = await source.metadata()
    const placement = computeWatermarkBox({
      imageWidth: width,
      imageHeight: height,
      watermarkWidth: meta.width,
      watermarkHeight: meta.height,
      sizeMode,
      anchor,
      offsetX,
      offsetY,
      scalePercent,
    })

    const overlayWidth = roundDimension(placement.width)
    const overlayHeight = roundDimension(placement.height)

    const wmBuffer = await source
      .resize(overlayWidth, overlayHeight, {
        fit: placement.fitMode || 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const { data, info } = wmBuffer
    const pixels = new Uint8Array(data)
    for (let i = 3; i < pixels.length; i += 4) pixels[i] = Math.floor(pixels[i] * opacity)

    const wmFinal = await sharp(Buffer.from(pixels), {
      raw: { width: info.width, height: info.height, channels: 4 },
    }).png().toBuffer()

    const targetLeft = Math.round(placement.left)
    const targetTop = Math.round(placement.top)
    const extractLeft = Math.max(0, -targetLeft)
    const extractTop = Math.max(0, -targetTop)
    const visibleWidth = Math.min(overlayWidth - extractLeft, width - Math.max(0, targetLeft))
    const visibleHeight = Math.min(overlayHeight - extractTop, height - Math.max(0, targetTop))

    if (visibleWidth <= 0 || visibleHeight <= 0) {
      return sharp(resizedBuffer)
        .jpeg({ quality })
        .toBuffer()
    }

    const wmVisible = await sharp(wmFinal)
      .extract({
        left: extractLeft,
        top: extractTop,
        width: visibleWidth,
        height: visibleHeight,
      })
      .png()
      .toBuffer()

    return sharp(resizedBuffer)
      .composite([{
        input: wmVisible,
        left: Math.max(0, targetLeft),
        top: Math.max(0, targetTop),
      }])
      .jpeg({ quality })
      .toBuffer()
  }

  const fontSize = Math.max(18, Math.floor(width / 14))
  const placement = computeWatermarkBox({
    imageWidth: width,
    imageHeight: height,
    watermarkWidth: fontSize * 8,
    watermarkHeight: fontSize * 2,
    sizeMode,
    anchor,
    offsetX,
    offsetY,
    scalePercent,
  })
  const centerX = placement.left + placement.width / 2
  const centerY = placement.top + placement.height / 2

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <text x="${centerX}" y="${centerY}" font-family="Georgia, serif" font-size="${fontSize}px"
      font-style="italic" fill="rgba(255,255,255,${opacity})"
      text-anchor="middle" dominant-baseline="middle"
      transform="rotate(-30 ${centerX} ${centerY})">&#169; ${authorName}</text>
  </svg>`

  return sharp(resizedBuffer)
    .composite([{ input: Buffer.from(svg) }])
    .jpeg({ quality })
    .toBuffer()
}
