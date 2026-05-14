import runtimePaths from './runtimePaths.cjs'

export const {
  APP_PERSIST_DIR,
  PROJECT_ROOT,
  DATA_DIR,
  STORAGE_DIR,
  UPLOADS_DIR,
  BACKUP_DIR,
  isPersistMode,
  ensureRuntimeDirs,
  resolveRuntimePath,
} = runtimePaths
