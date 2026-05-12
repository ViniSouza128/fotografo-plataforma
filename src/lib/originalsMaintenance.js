import path from 'path'
import {
  buildOriginalRelativePath,
  getOriginalAbsolutePath,
  moveOriginalToEvent,
  resolveOriginalPath,
  sanitizeStoredFilename,
} from './imageStorage'

function samePath(left, right) {
  if (!left || !right) return false
  return path.resolve(left) === path.resolve(right)
}

export async function organizeOriginalsByEvent({
  photos = [],
  events = [],
  apply = true,
} = {}) {
  let photosDirty = false
  let eventsDirty = false
  let moved = 0
  let missing = 0

  const handled = new Set()

  for (const photo of photos) {
    const filename = sanitizeStoredFilename(photo?.filename)
    const eventId = photo?.eventId
    if (!filename || !eventId) continue

    const expectedPath = buildOriginalRelativePath({ eventId, filename })
    if (expectedPath && photo.originalPath !== expectedPath) {
      photo.originalPath = expectedPath
      photosDirty = true
    }

    const dedupeKey = `${eventId}:${filename}`
    if (handled.has(dedupeKey)) continue
    handled.add(dedupeKey)

    const currentPath = resolveOriginalPath({
      filename,
      eventId,
      originalPath: photo.originalPath,
    })
    if (!currentPath) {
      missing += 1
      continue
    }

    const targetPath = getOriginalAbsolutePath({ filename, eventId })
    if (apply) {
      const movedPath = await moveOriginalToEvent({ filename, eventId, currentPath })
      if (movedPath && !samePath(movedPath, currentPath)) moved += 1
    } else if (targetPath && !samePath(currentPath, targetPath)) {
      moved += 1
    }
  }

  for (const event of events) {
    const filename = sanitizeStoredFilename(event?.coverImage)
    const eventId = event?.id
    if (!filename || !eventId) continue

    const expectedPath = buildOriginalRelativePath({ eventId, filename })
    if (expectedPath && event.coverOriginalPath !== expectedPath) {
      event.coverOriginalPath = expectedPath
      eventsDirty = true
    }

    const dedupeKey = `${eventId}:${filename}`
    if (handled.has(dedupeKey)) continue
    handled.add(dedupeKey)

    const currentPath = resolveOriginalPath({
      filename,
      eventId,
      originalPath: event.coverOriginalPath,
    })
    if (!currentPath) {
      missing += 1
      continue
    }

    const targetPath = getOriginalAbsolutePath({ filename, eventId })
    if (apply) {
      const movedPath = await moveOriginalToEvent({ filename, eventId, currentPath })
      if (movedPath && !samePath(movedPath, currentPath)) moved += 1
    } else if (targetPath && !samePath(currentPath, targetPath)) {
      moved += 1
    }
  }

  return {
    moved,
    missing,
    photosDirty,
    eventsDirty,
  }
}
