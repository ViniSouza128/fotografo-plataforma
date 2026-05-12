// src/lib/vision/engines/faceApi.js
// Engine de reconhecimento facial usando @vladmandic/face-api (opcional).
// Tudo é dynamic import — se a lib não estiver instalada, retorna 'unavailable'.
//
// Setup (admin/operador):
//   1) npm install @vladmandic/face-api @tensorflow/tfjs-node (opcional, mais rápido)
//   2) Baixar modelos para data/vision/models/ (ssd_mobilenetv1, face_landmark_68, face_recognition)
//      do repositório oficial do projeto.
//   3) Em /admin/reconhecimento, escolher engine = "face-api-local" e clicar em "Recarregar".
//
// Sem internet: o engine retorna 'unavailable' e cai para o engine 'manual'.

import path from 'path'
import fs from 'fs'

let _faceapi = null
let _modelsLoaded = false
let _initError = null
const MODELS_DIR = path.join(process.cwd(), 'data', 'vision', 'models')

async function tryLoadFaceApi() {
  if (_faceapi) return _faceapi
  if (_initError) throw _initError
  try {
    const lib = await import('@vladmandic/face-api')
    _faceapi = lib.default || lib
    return _faceapi
  } catch (err) {
    _initError = new Error('face-api-not-installed')
    _initError.cause = err
    throw _initError
  }
}

async function ensureModelsLoaded(faceapi) {
  if (_modelsLoaded) return
  if (!fs.existsSync(MODELS_DIR)) {
    throw new Error(`models-dir-missing:${MODELS_DIR}`)
  }
  // Confere alguns arquivos esperados
  const required = [
    'ssd_mobilenetv1_model-weights_manifest.json',
    'face_landmark_68_model-weights_manifest.json',
    'face_recognition_model-weights_manifest.json',
  ]
  for (const f of required) {
    if (!fs.existsSync(path.join(MODELS_DIR, f))) {
      throw new Error(`models-missing:${f}`)
    }
  }
  // tfjs-node opcional para velocidade
  try { await import('@tensorflow/tfjs-node') } catch {}
  await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODELS_DIR)
  await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_DIR)
  await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_DIR)
  _modelsLoaded = true
}

export async function isFaceApiAvailable() {
  try {
    await tryLoadFaceApi()
    if (!fs.existsSync(MODELS_DIR)) return { available: false, reason: 'models-missing' }
    const required = [
      'ssd_mobilenetv1_model-weights_manifest.json',
      'face_landmark_68_model-weights_manifest.json',
      'face_recognition_model-weights_manifest.json',
    ]
    for (const f of required) {
      if (!fs.existsSync(path.join(MODELS_DIR, f))) {
        return { available: false, reason: `models-incomplete:${f}` }
      }
    }
    return { available: true }
  } catch (err) {
    return { available: false, reason: err.message }
  }
}

export async function extractEmbeddingsFromImage(absolutePath) {
  const faceapi = await tryLoadFaceApi()
  await ensureModelsLoaded(faceapi)
  const buffer = await fs.promises.readFile(absolutePath)
  // Em Node, face-api usa canvas/sharp; tentamos com tfjs decodeImage
  let tf
  try { tf = (await import('@tensorflow/tfjs-node')).default || (await import('@tensorflow/tfjs-node')) } catch {}
  if (!tf) {
    try { tf = (await import('@tensorflow/tfjs')).default || (await import('@tensorflow/tfjs')) } catch {}
  }
  if (!tf) throw new Error('tf-runtime-missing')
  const tensor = tf.node ? tf.node.decodeImage(buffer, 3) : tf.browser.fromPixels(await sharpToImageData(buffer))
  try {
    const detections = await faceapi
      .detectAllFaces(tensor)
      .withFaceLandmarks()
      .withFaceDescriptors()
    return detections.map(d => ({
      embedding: Array.from(d.descriptor),
      box: d.detection?.box ? {
        x: d.detection.box.x, y: d.detection.box.y,
        width: d.detection.box.width, height: d.detection.box.height,
      } : null,
      score: d.detection?.score || null,
    }))
  } finally {
    try { tensor.dispose && tensor.dispose() } catch {}
  }
}

async function sharpToImageData(buffer) {
  const sharp = (await import('sharp')).default || (await import('sharp'))
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data: new Uint8ClampedArray(data), width: info.width, height: info.height }
}

export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0
  if (a.length !== b.length) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

export function euclideanDistance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return Infinity
  if (a.length !== b.length) return Infinity
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i]
    sum += d * d
  }
  return Math.sqrt(sum)
}

// Match um embedding contra a lista de fotos indexadas (entry.embeddings = [[...], ...])
// Retorna fotos cuja distância seja <= threshold.
export function searchByEmbedding({ entries, queryEmbedding, threshold = 0.55 }) {
  const results = []
  for (const entry of entries) {
    if (!Array.isArray(entry.embeddings) || entry.embeddings.length === 0) continue
    let bestDistance = Infinity
    for (const emb of entry.embeddings) {
      const dist = euclideanDistance(emb, queryEmbedding)
      if (dist < bestDistance) bestDistance = dist
    }
    if (bestDistance <= threshold) {
      results.push({
        photoId: entry.photoId,
        eventId: entry.eventId,
        score: 1 - Math.min(1, bestDistance / threshold),
        distance: bestDistance,
      })
    }
  }
  results.sort((a, b) => a.distance - b.distance)
  return results
}
