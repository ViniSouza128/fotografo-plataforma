import { sanitizeDerivedImages } from './derivedImagesMaintenance'

const state = {
  running: false,
  startedAt: null,
  finishedAt: null,
  total: 0,
  done: 0,
  generated: 0,
  skipped: 0,
  failed: 0,
  archived: 0,
  orphans: 0,
  originalsMoved: 0,
  originalsMissing: 0,
  etaSeconds: null,
  current: null,
  archiveRoot: null,
  errors: [],
}

function snapshot() {
  return { ...state, errors: [...state.errors] }
}

function resetForStart() {
  state.running = true
  state.startedAt = Date.now()
  state.finishedAt = null
  state.total = 0
  state.done = 0
  state.generated = 0
  state.skipped = 0
  state.failed = 0
  state.archived = 0
  state.orphans = 0
  state.originalsMoved = 0
  state.originalsMissing = 0
  state.etaSeconds = null
  state.current = null
  state.archiveRoot = null
  state.errors = []
}

function updateEta() {
  if (!state.running || state.done <= 0 || state.total <= 0) {
    state.etaSeconds = null
    return
  }
  const elapsed = (Date.now() - state.startedAt) / 1000
  const avg = elapsed / state.done
  const remaining = Math.max(0, state.total - state.done)
  state.etaSeconds = Math.round(avg * remaining)
}

function finish() {
  state.running = false
  state.finishedAt = Date.now()
  state.current = null
  state.etaSeconds = 0
}

export function getMissingDerivativesJobState() {
  return snapshot()
}

export function startMissingDerivativesJob() {
  if (state.running) return { started: false, state: snapshot() }

  resetForStart()

  ;(async () => {
    try {
      const result = await sanitizeDerivedImages({
        apply: true,
        forceRegenerate: true,
        onProgress(progress) {
          state.total = progress.total
          state.done = progress.done
          state.generated = progress.generated
          state.skipped = progress.skipped
          state.failed = progress.failed
          state.archived = progress.archived || 0
          state.orphans = progress.orphans || 0
          state.current = progress.current || null
          updateEta()
        },
      })
      state.archiveRoot = result.archiveRoot || null
      state.originalsMoved = result.originalsMoved || 0
      state.originalsMissing = result.originalsMissing || 0
    } catch (error) {
      state.failed += 1
      state.errors.push({ task: state.current || 'sanitize', reason: error?.message || 'error' })
    } finally {
      finish()
    }
  })()

  return { started: true, state: snapshot() }
}
