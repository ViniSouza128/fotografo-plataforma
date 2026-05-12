// Helper utilities to determine when a photo or album should be treated as free
// and to expose an effective client-facing price without mutating persisted data.

export function isAlbumFree(event) {
  return Boolean(event?.albumGratis)
}

export function isPriceZero(value) {
  const num = Number(value)
  return Number.isFinite(num) && num === 0
}

export function isPhotoExplicitFree(photo) {
  return Boolean(photo?.gratis)
}

export function isPhotoFree(photo, event) {
  if (!photo) return false
  if (photo.isFree) return true
  if (isAlbumFree(event) || isAlbumFree(photo) || isPhotoExplicitFree(photo)) return true
  const effective = Number(photo?.priceEffective)
  if (Number.isFinite(effective) && effective === 0) return true
  return isPriceZero(photo?.price)
}

export function getEffectivePrice(photo, event) {
  const explicit = Number(photo?.priceEffective)
  if (Number.isFinite(explicit)) return explicit
  const raw = Number(photo?.price)
  const basePrice = Number.isFinite(raw) ? raw : 0
  return isPhotoFree(photo, event) ? 0 : basePrice
}

export function withFreeFlags(photo, event) {
  const effectivePrice = getEffectivePrice(photo, event)
  return {
    ...photo,
    isFree: isPhotoFree(photo, event),
    priceEffective: effectivePrice,
    albumGratis: isAlbumFree(event),
  }
}
