'use client';

import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getPhotoDuplicateKey } from '@/lib/commerceUtils';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import SafeDeleteModal from '@/components/SafeDeleteModal';
import CartPricePolicyModal from '@/components/CartPricePolicyModal';

const PREVIEW_SIZE = 220;
const PREVIEW_WORKERS = 1;
const PREVIEW_VISIBLE_MAX = 18;
const GRID_MIN_WIDTH = 190;
const GRID_GAP = 16;
const GRID_OVERSCAN = 2;
const GRID_HEIGHT = 560;
const UPLOAD_MAX_CONCURRENCY = 3;
const UPLOAD_SAVE_BATCH = 8;
const FILE_PROCESS_CHUNK_SIZE = 80;

const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const supportedVideoTypes = ['video/mp4', 'video/quicktime', 'video/webm'];
const supportedMediaTypes = [...supportedTypes, ...supportedVideoTypes];

function isVideoFile(file) {
  if (!file) return false;
  if (typeof file.type === 'string' && file.type.startsWith('video/')) return true;
  const name = String(file.name || '').toLowerCase();
  return name.endsWith('.mp4') || name.endsWith('.mov') || name.endsWith('.webm');
}
const canUseBitmapResize = typeof createImageBitmap === 'function';
const EMPTY_UPLOAD_SUMMARY = {
  selected: 0,
  queued: 0,
  sent: 0,
  duplicates: 0,
  errors: 0,
  invalidTypes: 0,
  lastFinishedAt: null,
};

function getRemotePreviewUrl(photo) {
  return photo?.urls?.grid || photo?.urls?.cart || photo?.urls?.modal || null;
}

function queueReducer(state, action) {
  if (action.type === 'add') {
    const byId = { ...state.byId };
    const order = [...state.order];
    action.items.forEach((item) => {
      byId[item.id] = item;
      order.push(item.id);
    });
    return { byId, order };
  }

  if (action.type === 'update') {
    if (!action.items.length) return state;
    const byId = { ...state.byId };
    let changed = false;

    action.items.forEach(({ id, patch }) => {
      const current = byId[id];
      if (!current) return;
      byId[id] = { ...current, ...patch };
      changed = true;
    });

    return changed ? { ...state, byId } : state;
  }

  if (action.type === 'remove') {
    if (!state.byId[action.id]) return state;
    const byId = { ...state.byId };
    delete byId[action.id];
    return { byId, order: state.order.filter((id) => id !== action.id) };
  }

  if (action.type === 'removeByStatus') {
    const statuses = action.statuses || [];
    if (!statuses.length) return state;

    const byId = { ...state.byId };
    const order = [];
    let changed = false;

    state.order.forEach((id) => {
      const item = byId[id];
      if (!item) return;
      if (statuses.includes(item.status)) {
        delete byId[id];
        changed = true;
        return;
      }
      order.push(id);
    });

    return changed ? { byId, order } : state;
  }

  return state;
}

function getItemStatusText(item) {
  if (item.status === 'ok') return 'Enviado';
  if (item.status === 'erro') return 'Erro no envio';
  if (item.status === 'ignorado') return 'Ignorado';
  if (item.status === 'enviando') return item.progress >= 100 ? 'Finalizando...' : `Enviando ${item.progress}%`;
  return item.previewUrl ? 'Na fila' : 'Preparando miniatura...';
}

function formatBytes(size) {
  if (!Number.isFinite(size)) return '--';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatCurrency(value) {
  const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function yieldThread() {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => resolve(), { timeout: 80 });
      return;
    }
    setTimeout(resolve, 0);
  });
}

function revokeUrl(url, kind) {
  if (!url || kind !== 'blob') return;
  try {
    URL.revokeObjectURL(url);
  } catch {}
}

function pickUploadConcurrency() {
  if (typeof navigator === 'undefined') return 2;
  const cpu = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;
  if (memory <= 4) return 1;
  if (cpu >= 12 && memory >= 8) return 3;
  return 2;
}

async function createPreviewBlob(file) {
  if (!canUseBitmapResize) return null;
  const bitmap = await createImageBitmap(file, {
    resizeWidth: PREVIEW_SIZE,
    resizeHeight: PREVIEW_SIZE,
    resizeQuality: 'high',
  });
  const ratio = Math.min(PREVIEW_SIZE / bitmap.width, PREVIEW_SIZE / bitmap.height);
  const width = Math.max(1, Math.round(bitmap.width * ratio));
  const height = Math.max(1, Math.round(bitmap.height * ratio));

  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close?.();
      return null;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.62 });
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close?.();
    return null;
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.62));
}

async function createPreviewUrl(file) {
  try {
    const blob = await createPreviewBlob(file);
    if (blob) return { url: URL.createObjectURL(blob), kind: 'blob' };
  } catch {}

  return new Promise((resolve) => {
    const fileUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(PREVIEW_SIZE / img.width, PREVIEW_SIZE / img.height);
      const width = Math.max(1, Math.round(img.width * ratio));
      const height = Math.max(1, Math.round(img.height * ratio));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(fileUrl);
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(fileUrl);
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        resolve({ url: URL.createObjectURL(blob), kind: 'blob' });
      }, 'image/jpeg', 0.62);
    };
    img.onerror = () => {
      URL.revokeObjectURL(fileUrl);
      resolve(null);
    };
    img.src = fileUrl;
  });
}

function uploadFileWithProgress(file, eventId, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const fd = new FormData();
    fd.append('file', file);
    if (eventId) fd.append('eventId', eventId);
    xhr.open('POST', '/api/upload');
    xhr.responseType = 'json';

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const value = Math.min(99, Math.round((event.loaded / event.total) * 100));
      onProgress(value);
    };

    xhr.onload = () => {
      const ok = xhr.status >= 200 && xhr.status < 300;
      if (!ok) {
        const body = xhr.response && typeof xhr.response === 'object'
          ? xhr.response
          : (() => {
              try { return JSON.parse(xhr.responseText || '{}'); } catch { return {}; }
            })();
        reject(new Error(body.error || 'Falha no upload'));
        return;
      }
      if (xhr.response && typeof xhr.response === 'object') {
        resolve(xhr.response);
        return;
      }
      try {
        resolve(JSON.parse(xhr.responseText || '{}'));
      } catch {
        reject(new Error('Resposta inválida do upload'));
      }
    };

    xhr.onerror = () => reject(new Error('Falha de rede no upload'));
    xhr.onabort = () => reject(new Error('Upload cancelado'));
    xhr.send(fd);
  });
}

const QueueItem = memo(function QueueItem({ item, onRemove }) {
  const progress = item.status === 'ok' ? 100 : Math.max(0, Math.min(100, item.progress || 0));
  const statusClass = item.status === 'ok'
    ? 'ok'
    : item.status === 'erro' || item.status === 'ignorado'
      ? 'error'
      : item.status === 'enviando'
        ? 'uploading'
        : '';

  return (
    <div className="upload-preview-item">
      <div className="upload-preview-media">
        {item.previewUrl
          ? <img src={item.previewUrl} alt={item.name} loading="lazy" />
          : <div className="upload-preview-placeholder">🖼</div>}
        {item.status === 'pendente' && (
          <button className="upload-preview-remove" onClick={() => onRemove(item.id)}>✕</button>
        )}
      </div>

      <div className="upload-card-meta">
        <div className="upload-card-name" title={item.name}>{item.name}</div>
        <div className="upload-card-size">{formatBytes(item.size)}</div>
        <div className={`upload-status-line ${statusClass}`}>{item.error || getItemStatusText(item)}</div>
        <div className="upload-progress-track">
          <div className={`upload-progress-fill ${statusClass}`} style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
});

export default function UploadFotosPage() {
  const { eventId } = useParams();
  const [event, setEvent] = useState(null);
  const [existingPhotos, setExistingPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [deletePrompt, setDeletePrompt] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [pricePolicyPrompt, setPricePolicyPrompt] = useState(null);
  const [pricePolicyBusy, setPricePolicyBusy] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [precoGlobal, setPrecoGlobal] = useState(29.9);
  const [precoVideoPadrao, setPrecoVideoPadrao] = useState(null);
  const [uploadNotice, setUploadNotice] = useState({ type: '', text: '' });
  const [uploadSummary, setUploadSummary] = useState(EMPTY_UPLOAD_SUMMARY);
  // Fila simples paralela para vídeos (cada item: { id, name, size, status, progress, error })
  const [videoQueue, setVideoQueue] = useState([]);
  const [queueState, dispatchQueue] = useReducer(queueReducer, { byId: {}, order: [] });
  const [editandoPreco, setEditandoPreco] = useState({});
  const [salvandoPreco, setSalvandoPreco] = useState(null);
  const [gridViewport, setGridViewport] = useState({ width: 0, height: GRID_HEIGHT, scrollTop: 0 });
  const { confirm, confirmDialog } = useConfirmDialog();

  const draggingRef = useRef(false);
  const fileInputRef = useRef(null);
  const gridRef = useRef(null);
  const gridRafRef = useRef(null);
  const queueRef = useRef(queueState);
  const pendingUpdatesRef = useRef(new Map());
  const updateRafRef = useRef(null);
  const uploadRunnerRef = useRef(false);
  const progressUpdateRef = useRef(new Map());
  const pendingPriceChangeRef = useRef(null);
  const previewQueueRef = useRef([]);
  const previewQueuedRef = useRef(new Set());
  const previewRunningRef = useRef(0);
  const previewLoopScheduledRef = useRef(false);

  useEffect(() => {
    queueRef.current = queueState;
  }, [queueState]);

  const fila = useMemo(
    () => queueState.order.map((id) => queueState.byId[id]).filter(Boolean),
    [queueState],
  );

  const queueStats = useMemo(() => {
    let pending = 0;
    let uploading = 0;
    let ok = 0;
    let erro = 0;
    let ignorado = 0;
    fila.forEach((item) => {
      if (item.status === 'pendente') pending += 1;
      else if (item.status === 'enviando') uploading += 1;
      else if (item.status === 'ok') ok += 1;
      else if (item.status === 'ignorado') ignorado += 1;
      else if (item.status === 'erro') erro += 1;
    });
    return { pending, uploading, ok, erro, ignorado };
  }, [fila]);

  const queueProgress = useMemo(() => {
    if (!fila.length) return { percent: 0, done: 0, total: 0 };

    let progressTotal = 0;
    let done = 0;

    fila.forEach((item) => {
      if (['ok', 'ignorado', 'erro'].includes(item.status)) {
        progressTotal += 100;
        done += 1;
        return;
      }
      if (item.status === 'enviando') {
        progressTotal += Math.max(0, Math.min(99, Number(item.progress) || 0));
      }
    });

    return {
      percent: Math.round(progressTotal / fila.length),
      done,
      total: fila.length,
    };
  }, [fila]);

  const hasUploadSummary = uploadSummary.selected > 0
    || uploadSummary.sent > 0
    || uploadSummary.duplicates > 0
    || uploadSummary.errors > 0
    || uploadSummary.invalidTypes > 0;
  const finalSummaryReady = hasUploadSummary
    && !enviando
    && queueStats.pending === 0
    && queueStats.uploading === 0;

  const enqueueUpdates = useCallback((updates) => {
    if (!updates?.length) return;

    updates.forEach(({ id, patch }) => {
      const previous = pendingUpdatesRef.current.get(id);
      pendingUpdatesRef.current.set(id, previous ? { ...previous, ...patch } : patch);
    });

    if (updateRafRef.current) return;
    updateRafRef.current = requestAnimationFrame(() => {
      updateRafRef.current = null;
      const merged = [];
      pendingUpdatesRef.current.forEach((patch, id) => merged.push({ id, patch }));
      pendingUpdatesRef.current.clear();

      const currentById = queueRef.current.byId;
      merged.forEach(({ id, patch }) => {
        const current = currentById[id];
        if (!current) {
          if (patch.previewUrl) revokeUrl(patch.previewUrl, patch.previewKind);
          return;
        }
        if (patch.previewUrl !== undefined && patch.previewUrl !== current.previewUrl) {
          revokeUrl(current.previewUrl, current.previewKind);
        }
      });

      dispatchQueue({ type: 'update', items: merged });
    });
  }, []);

  const enqueuePreview = useCallback((id, highPriority = false) => {
    const item = queueRef.current.byId[id];
    if (!item || item.previewUrl || !item.file) return;
    if (previewQueuedRef.current.has(id)) return;

    previewQueuedRef.current.add(id);
    if (highPriority) previewQueueRef.current.unshift(id);
    else previewQueueRef.current.push(id);
  }, []);

  const schedulePreviewLoop = useCallback(() => {
    if (previewLoopScheduledRef.current) return;
    previewLoopScheduledRef.current = true;

    const run = async () => {
      previewLoopScheduledRef.current = false;

      while (previewRunningRef.current < PREVIEW_WORKERS && previewQueueRef.current.length > 0) {
        const id = previewQueueRef.current.shift();
        previewQueuedRef.current.delete(id);
        const item = queueRef.current.byId[id];
        if (!item || item.previewUrl || !item.file) continue;

        previewRunningRef.current += 1;
        yieldThread()
          .then(() => createPreviewUrl(item.file))
          .then((preview) => {
            if (!preview) return;
            enqueueUpdates([{ id, patch: { previewUrl: preview.url, previewKind: preview.kind } }]);
          })
          .finally(() => {
            previewRunningRef.current -= 1;
            schedulePreviewLoop();
          });
      }
    };

    setTimeout(run, 0);
  }, [enqueueUpdates]);

  useEffect(() => {
    return () => {
      if (updateRafRef.current) cancelAnimationFrame(updateRafRef.current);
      Object.values(queueRef.current.byId).forEach((item) => revokeUrl(item.previewUrl, item.previewKind));
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [evRes, phRes, cfgRes] = await Promise.all([
          fetch(`/api/events/${eventId}`),
          fetch(`/api/photos?eventId=${eventId}`),
          fetch('/api/config'),
        ]);
        const eventData = evRes.ok ? await evRes.json() : null;
        const configData = cfgRes.ok ? await cfgRes.json() : null;

        if (!cancelled && eventData) setEvent(eventData);
        if (!cancelled && phRes.ok) setExistingPhotos(await phRes.json());
        if (!cancelled) {
          const albumPriceRaw = eventData?.precoFotoPadrao;
          const albumPrice = Number(albumPriceRaw);
          const configPrice = Number(configData?.precoFotoDefault);

          if (albumPriceRaw !== null && albumPriceRaw !== undefined && albumPriceRaw !== '' && Number.isFinite(albumPrice)) {
            setPrecoGlobal(albumPrice);
          } else if (Number.isFinite(configPrice)) {
            setPrecoGlobal(configPrice);
          }

          // Preço de vídeo (P+): álbum > global > null
          const albumVideoPrice = Number(eventData?.precoVideoPadrao);
          const configVideoPrice = Number(configData?.precoVideoDefault);
          if (Number.isFinite(albumVideoPrice) && albumVideoPrice > 0) {
            setPrecoVideoPadrao(albumVideoPrice);
          } else if (Number.isFinite(configVideoPrice) && configVideoPrice > 0) {
            setPrecoVideoPadrao(configVideoPrice);
          }
        }
      } catch (error) {
        console.error(error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [eventId]);

  useEffect(() => {
    const gridEl = gridRef.current;
    if (!gridEl) return undefined;

    const updateMetrics = () => {
      gridRafRef.current = null;
      setGridViewport({
        width: gridEl.clientWidth,
        height: gridEl.clientHeight,
        scrollTop: gridEl.scrollTop,
      });
    };

    const schedule = () => {
      if (gridRafRef.current) return;
      gridRafRef.current = requestAnimationFrame(updateMetrics);
    };

    let observer = null;
    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(schedule);
      observer.observe(gridEl);
    } else {
      window.addEventListener('resize', schedule);
    }

    gridEl.addEventListener('scroll', schedule, { passive: true });
    schedule();

    return () => {
      gridEl.removeEventListener('scroll', schedule);
      if (observer) observer.disconnect();
      else window.removeEventListener('resize', schedule);
      if (gridRafRef.current) cancelAnimationFrame(gridRafRef.current);
      gridRafRef.current = null;
    };
  }, [fila.length]);

  const gridData = useMemo(() => {
    const width = Math.max(0, gridViewport.width);
    const cols = Math.max(1, Math.floor((width + GRID_GAP) / (GRID_MIN_WIDTH + GRID_GAP)));
    const cardWidth = (Math.max(width, GRID_MIN_WIDTH) - GRID_GAP * (cols - 1)) / cols;
    const cardHeight = cardWidth * 1.42;
    const rowStep = cardHeight + GRID_GAP;
    const rowCount = Math.ceil(fila.length / cols);
    const startRow = Math.max(0, Math.floor(gridViewport.scrollTop / Math.max(1, rowStep)) - GRID_OVERSCAN);
    const endRow = Math.min(
      rowCount,
      Math.ceil((gridViewport.scrollTop + gridViewport.height) / Math.max(1, rowStep)) + GRID_OVERSCAN,
    );
    const first = startRow * cols;
    const last = Math.min(fila.length, endRow * cols);

    const items = [];
    for (let i = first; i < last; i += 1) {
      const item = fila[i];
      if (!item) continue;
      const row = Math.floor(i / cols);
      const col = i % cols;
      items.push({
        id: item.id,
        item,
        top: row * rowStep,
        left: col * (cardWidth + GRID_GAP),
      });
    }

    return {
      items,
      cardWidth,
      cardHeight,
      totalHeight: rowCount > 0 ? rowCount * cardHeight + (rowCount - 1) * GRID_GAP : 0,
    };
  }, [fila, gridViewport]);

  useEffect(() => {
    const visibleIds = gridData.items.slice(0, PREVIEW_VISIBLE_MAX).map(({ id }) => id);
    visibleIds.forEach((id) => enqueuePreview(id, true));
    schedulePreviewLoop();
  }, [enqueuePreview, gridData.items, schedulePreviewLoop]);

  const runAutoUpload = useCallback(async () => {
    if (uploadRunnerRef.current) return;
    uploadRunnerRef.current = true;
    setEnviando(true);

    const savedBuffer = [];
    let ignoredInUpload = 0;
    let sentInRun = 0;
    let errorsInRun = 0;
    const maxConcurrency = Math.max(1, Math.min(UPLOAD_MAX_CONCURRENCY, pickUploadConcurrency()));

    const flushSaved = () => {
      if (!savedBuffer.length) return;
      const chunk = savedBuffer.splice(0, savedBuffer.length);
      setExistingPhotos((prev) => [...prev, ...chunk]);
    };

    const updateProgress = (id, value) => {
      const now = Date.now();
      const prev = progressUpdateRef.current.get(id);
      if (prev && value - prev.value < 2 && now - prev.time < 120) return;
      progressUpdateRef.current.set(id, { value, time: now });
      enqueueUpdates([{ id, patch: { progress: value } }]);
    };

    try {
      while (true) {
        const pendentes = queueRef.current.order.filter((id) => queueRef.current.byId[id]?.status === 'pendente');
        if (!pendentes.length) break;

        let cursor = 0;
        const workerCount = Math.min(maxConcurrency, pendentes.length);

        async function worker() {
          while (true) {
            const index = cursor;
            cursor += 1;
            if (index >= pendentes.length) return;

            const id = pendentes[index];
            const current = queueRef.current.byId[id];
            if (!current || current.status !== 'pendente') continue;

            enqueueUpdates([{ id, patch: { status: 'enviando', progress: 0, error: '' } }]);
            enqueuePreview(id, true);
            schedulePreviewLoop();

            try {
              const uploaded = await uploadFileWithProgress(current.file, eventId, (progress) => updateProgress(id, progress));
              enqueueUpdates([{
                id,
                patch: {
                  progress: 100,
                  previewUrl: uploaded.thumbUrl || null,
                  previewKind: uploaded.thumbUrl ? 'remote' : current.previewKind,
                },
              }]);

              const photoRes = await fetch('/api/photos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  eventId,
                  filename: uploaded.filename,
                  filenameWm: uploaded.filenameWm,
                  filenameThumb: uploaded.filenameThumb,
                  filenameMini: uploaded.filenameMini,
                  price: Number(current.price),
                  originalName: uploaded.originalName,
                  size: uploaded.size,
                  takenAt: uploaded.takenAt,
                  author: uploaded.author,
                  originalWidth: uploaded.originalWidth,
                  originalHeight: uploaded.originalHeight,
                }),
              });

              if (!photoRes.ok) throw new Error('Falha ao salvar metadados');
              const savedPhoto = await photoRes.json();

              if (savedPhoto?.skipped) {
                ignoredInUpload += 1;
                enqueueUpdates([{
                  id,
                  patch: {
                    status: 'ignorado',
                    progress: 100,
                    error: 'Arquivo já existe neste evento',
                    previewUrl: getRemotePreviewUrl(savedPhoto) || queueRef.current.byId[id]?.previewUrl,
                    previewKind: getRemotePreviewUrl(savedPhoto) ? 'remote' : queueRef.current.byId[id]?.previewKind,
                  },
                }]);
                continue;
              }

              savedBuffer.push(savedPhoto);
              sentInRun += 1;
              if (savedBuffer.length >= UPLOAD_SAVE_BATCH) flushSaved();
              enqueueUpdates([{
                id,
                patch: {
                  status: 'ok',
                  progress: 100,
                  error: '',
                  previewUrl: getRemotePreviewUrl(savedPhoto) || queueRef.current.byId[id]?.previewUrl,
                  previewKind: getRemotePreviewUrl(savedPhoto) ? 'remote' : queueRef.current.byId[id]?.previewKind,
                },
              }]);
            } catch (error) {
              errorsInRun += 1;
              enqueueUpdates([{
                id,
                patch: {
                  status: 'erro',
                  error: error.message || 'Falha no envio',
                },
              }]);
            } finally {
              progressUpdateRef.current.delete(id);
            }

            await yieldThread();
          }
        }

        await Promise.all(Array.from({ length: workerCount }, () => worker()));
      }
    } finally {
      flushSaved();
      if (ignoredInUpload > 0) {
        setUploadNotice({
          type: 'warning',
          text: `${ignoredInUpload} upload(s) ignorado(s) por duplicidade no evento (mesmo nome original e tamanho).`,
        });
      }
      if (sentInRun || ignoredInUpload || errorsInRun) {
        setUploadSummary((prev) => ({
          ...prev,
          sent: prev.sent + sentInRun,
          duplicates: prev.duplicates + ignoredInUpload,
          errors: prev.errors + errorsInRun,
          lastFinishedAt: Date.now(),
        }));
      }
      setEnviando(false);
      uploadRunnerRef.current = false;

      const stillPending = queueRef.current.order.some((id) => queueRef.current.byId[id]?.status === 'pendente');
      if (stillPending) {
        setTimeout(() => runAutoUpload(), 0);
      }
    }
  }, [enqueuePreview, enqueueUpdates, eventId, schedulePreviewLoop]);

  // ── Upload de vídeo (paralelo à fila de fotos) ─────────────────────────────
  const updateVideoItem = useCallback((id, patch) => {
    setVideoQueue((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const generateVideoPoster = useCallback(async (file) => {
    return await new Promise((resolve) => {
      try {
        const url = URL.createObjectURL(file);
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.muted = true;
        v.playsInline = true;
        v.src = url;
        v.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
        v.onloadeddata = () => {
          try { v.currentTime = Math.min(1, Math.max(0, (v.duration || 2) / 2)); }
          catch { URL.revokeObjectURL(url); resolve(null); }
        };
        v.onseeked = () => {
          try {
            const c = document.createElement('canvas');
            c.width = v.videoWidth || 1280;
            c.height = v.videoHeight || 720;
            const ctx = c.getContext('2d');
            ctx.drawImage(v, 0, 0, c.width, c.height);
            c.toBlob((blob) => {
              URL.revokeObjectURL(url);
              if (blob) resolve({ poster: new File([blob], 'poster.jpg', { type: 'image/jpeg' }), width: c.width, height: c.height, duration: v.duration });
              else resolve(null);
            }, 'image/jpeg', 0.85);
          } catch { URL.revokeObjectURL(url); resolve(null); }
        };
      } catch { resolve(null); }
    });
  }, []);

  const uploadOneVideo = useCallback(async (item) => {
    updateVideoItem(item.id, { status: 'enviando', progress: 5, error: '' });

    // 1) Gera poster + metadata client-side
    const meta = await generateVideoPoster(item.file);
    updateVideoItem(item.id, { progress: 25 });

    try {
      const fd = new FormData();
      fd.append('file', item.file);
      fd.append('eventId', eventId);
      if (meta?.poster) fd.append('poster', meta.poster);

      // 2) POST /api/upload-video
      const upRes = await fetch('/api/upload-video', { method: 'POST', body: fd });
      const upData = await upRes.json().catch(() => ({}));
      if (!upRes.ok) {
        updateVideoItem(item.id, { status: 'erro', error: upData.error || 'Erro no upload', progress: 0 });
        return false;
      }
      updateVideoItem(item.id, { progress: 75 });

      // 3) POST /api/videos (registra metadados)
      const body = {
        eventId,
        filename: upData.filename,
        originalName: upData.originalName || item.file.name,
        originalPath: upData.originalPath,
        size: upData.size,
        width: meta?.width || null,
        height: meta?.height || null,
        duration: meta?.duration || null,
        takenAt: item.file.lastModified ? new Date(item.file.lastModified).toISOString() : null,
        posterClean: upData.posterClean || null,
        // Preço do vídeo: pega da config carregada (álbum > global), default null = usa server fallback
        price: precoVideoPadrao != null ? Number(precoVideoPadrao) : null,
        resolutions: [],
      };
      const regRes = await fetch('/api/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const regData = await regRes.json().catch(() => ({}));
      if (!regRes.ok) {
        updateVideoItem(item.id, { status: 'erro', error: regData.error || 'Erro ao registrar', progress: 0 });
        return false;
      }
      updateVideoItem(item.id, { status: 'enviado', progress: 100, videoId: regData.id });
      return true;
    } catch (err) {
      updateVideoItem(item.id, { status: 'erro', error: err.message || 'Erro de rede', progress: 0 });
      return false;
    }
  }, [eventId, generateVideoPoster, updateVideoItem, precoVideoPadrao]);

  const enqueueVideos = useCallback((files) => {
    const novos = files.map((file) => ({
      id: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
      file,
      name: file.name,
      size: file.size,
      status: 'pendente',
      progress: 0,
      error: '',
      videoId: null,
    }));
    if (!novos.length) return;
    setVideoQueue((prev) => [...prev, ...novos]);

    // Upload paralelo controlado (mesma concorrência das fotos).
    ;(async () => {
      const concurrency = Math.max(1, Math.min(UPLOAD_MAX_CONCURRENCY, novos.length));
      const queue = [...novos];
      const workers = Array.from({ length: concurrency }, async () => {
        while (queue.length) {
          const item = queue.shift();
          if (!item) break;
          await uploadOneVideo(item);
        }
      });
      await Promise.all(workers);
    })();
  }, [uploadOneVideo]);

  const removeVideoFromQueue = useCallback((id) => {
    setVideoQueue((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const processFiles = useCallback(async (files) => {
    const incoming = Array.from(files || []);
    if (!incoming.length) return;

    // Separa vídeos e imagens — vídeos seguem fluxo paralelo dedicado.
    const videosIncoming = incoming.filter(isVideoFile);
    const imagesIncoming = incoming.filter((f) => !isVideoFile(f));
    if (videosIncoming.length > 0) enqueueVideos(videosIncoming);

    files = imagesIncoming;
    const incomingImagens = imagesIncoming;
    if (!incomingImagens.length && videosIncoming.length > 0) {
      setUploadNotice({ type: 'success', text: `${videosIncoming.length} vídeo(s) na fila de upload.` });
      return;
    }
    if (!incomingImagens.length) return;

    const existingKeys = new Set(existingPhotos.map((photo) => getPhotoDuplicateKey(photo)).filter(Boolean));
    const queuedKeys = new Set();
    queueRef.current.order.forEach((id) => {
      const queued = queueRef.current.byId[id];
      if (!queued?.name || !Number.isFinite(queued.size)) return;
      const key = getPhotoDuplicateKey({ name: queued.name, size: queued.size });
      if (key) queuedKeys.add(key);
    });

    const novos = [];
    let ignoredExisting = 0;
    let ignoredQueue = 0;
    let ignoredType = 0;

    for (let index = 0; index < incomingImagens.length; index += 1) {
      const file = incomingImagens[index];
      if (!supportedTypes.includes(file.type)) {
        ignoredType += 1;
        continue;
      }

      const key = getPhotoDuplicateKey({ name: file.name, size: file.size });
      if (key && existingKeys.has(key)) {
        ignoredExisting += 1;
        continue;
      }
      if (key && queuedKeys.has(key)) {
        ignoredQueue += 1;
        continue;
      }
      if (key) queuedKeys.add(key);

      novos.push({
        id: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
        file,
        name: file.name,
        size: file.size,
        previewUrl: null,
        previewKind: null,
        price: precoGlobal,
        status: 'pendente',
        progress: 0,
        error: '',
      });

      if ((index + 1) % FILE_PROCESS_CHUNK_SIZE === 0) {
        await yieldThread();
      }
    }

    setUploadSummary((prev) => ({
      ...prev,
      selected: prev.selected + incomingImagens.length,
      queued: prev.queued + novos.length,
      duplicates: prev.duplicates + ignoredExisting + ignoredQueue,
      invalidTypes: prev.invalidTypes + ignoredType,
      lastFinishedAt: null,
    }));

    const ignored = ignoredExisting + ignoredQueue + ignoredType;
    if (ignored > 0) {
      const reasons = [];
      if (ignoredExisting) reasons.push(`${ignoredExisting} já existiam no evento`);
      if (ignoredQueue) reasons.push(`${ignoredQueue} já estavam na fila`);
      if (ignoredType) reasons.push(`${ignoredType} não são JPG, PNG ou WebP`);
      const videoNote = videosIncoming.length > 0 ? ` · ${videosIncoming.length} vídeo(s) na fila à parte` : '';
      setUploadNotice({
        type: 'warning',
        text: `${ignored} arquivo(s) ignorado(s): ${reasons.join(' · ')}${videoNote}`,
      });
    } else if (novos.length > 0 || videosIncoming.length > 0) {
      const partes = [];
      if (novos.length > 0) partes.push(`${novos.length} foto(s)`);
      if (videosIncoming.length > 0) partes.push(`${videosIncoming.length} vídeo(s)`);
      setUploadNotice({ type: 'success', text: `${partes.join(' + ')} na fila.` });
    }

    if (!novos.length) return;

    dispatchQueue({ type: 'add', items: novos });
    novos.slice(0, 8).forEach((item) => enqueuePreview(item.id, true));
    schedulePreviewLoop();
    setTimeout(() => runAutoUpload(), 0);
  }, [enqueuePreview, enqueueVideos, existingPhotos, precoGlobal, runAutoUpload, schedulePreviewLoop]);

  const removeFromFila = useCallback((id) => {
    const item = queueRef.current.byId[id];
    if (!item || item.status !== 'pendente') return;
    revokeUrl(item.previewUrl, item.previewKind);
    dispatchQueue({ type: 'remove', id });
  }, []);

  const limparEnviados = useCallback(() => {
    queueRef.current.order.forEach((id) => {
      const item = queueRef.current.byId[id];
      if (!item) return;
      if (item.status === 'ok' || item.status === 'ignorado') revokeUrl(item.previewUrl, item.previewKind);
    });
    dispatchQueue({ type: 'removeByStatus', statuses: ['ok', 'ignorado'] });
  }, []);

  const retryFailedPhotos = useCallback(() => {
    const updates = [];
    queueRef.current.order.forEach((id) => {
      const item = queueRef.current.byId[id];
      if (item && item.status === 'erro') {
        updates.push({ id, patch: { status: 'pendente', error: '', progress: 0 } });
      }
    });
    if (!updates.length) return;
    dispatchQueue({ type: 'update', items: updates });
    setTimeout(() => runAutoUpload(), 0);
  }, [runAutoUpload]);

  const retryFailedVideos = useCallback(() => {
    setVideoQueue((prev) => {
      const failed = prev.filter((v) => v.status === 'erro');
      if (!failed.length) return prev;
      // Marca como pendente e dispara upload paralelo somente para os que falharam.
      const reset = prev.map((v) => v.status === 'erro'
        ? { ...v, status: 'pendente', error: '', progress: 0 }
        : v);
      ;(async () => {
        const concurrency = Math.max(1, Math.min(UPLOAD_MAX_CONCURRENCY, failed.length));
        const queue = [...failed];
        const workers = Array.from({ length: concurrency }, async () => {
          while (queue.length) {
            const item = queue.shift();
            if (!item) break;
            await uploadOneVideo(item);
          }
        });
        await Promise.all(workers);
      })();
      return reset;
    });
  }, [uploadOneVideo]);

  const iniciarEdicaoPreco = useCallback((photo) => {
    setEditandoPreco((prev) => ({ ...prev, [photo.id]: photo.price }));
  }, []);

  const cancelarEdicaoPreco = useCallback((photoId) => {
    setEditandoPreco((prev) => {
      const next = { ...prev };
      delete next[photoId];
      return next;
    });
  }, []);

  const commitPriceChange = useCallback(async ({ photoId, price, cartPriceDecision = null }) => {
    const payload = { id: photoId, price: Number(price) };
    if (cartPriceDecision) payload.cartPriceDecision = cartPriceDecision;

    const res = await fetch('/api/photos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.status === 409) {
      const data = await res.json();
      pendingPriceChangeRef.current = { photoId, price };
      setPricePolicyPrompt(data.analysis);
      return false;
    }

    if (!res.ok) throw new Error('Falha ao salvar');
    setExistingPhotos((prev) => prev.map((p) => (p.id === photoId ? { ...p, price: Number(price) } : p)));
    cancelarEdicaoPreco(photoId);
    return true;
  }, [cancelarEdicaoPreco]);

  const salvarPreco = useCallback(async (photoId) => {
    const novoPreco = editandoPreco[photoId];
    if (novoPreco === undefined || novoPreco === '') return;
    setSalvandoPreco(photoId);
    try {
      await commitPriceChange({ photoId, price: novoPreco });
    } catch (error) {
      alert(error.message || 'Erro ao salvar preço.');
    } finally {
      setSalvandoPreco(null);
    }
  }, [commitPriceChange, editandoPreco]);

  const resolvePricePolicy = useCallback(async (decision) => {
    const pending = pendingPriceChangeRef.current;
    if (!pending) return;
    setPricePolicyBusy(true);
    try {
      await commitPriceChange({ ...pending, cartPriceDecision: decision });
      pendingPriceChangeRef.current = null;
      setPricePolicyPrompt(null);
    } catch (error) {
      alert(error.message || 'Erro ao aplicar decisão nos carrinhos.');
    } finally {
      setPricePolicyBusy(false);
    }
  }, [commitPriceChange]);

  const requestDeletePhotos = useCallback(async ({ ids, pasta = null }) => {
    if (!ids || ids.length === 0) return;
    const accepted = await confirm({
      title: ids.length === 1 ? 'Excluir foto' : `Excluir ${ids.length} fotos`,
      message: 'Analisaremos compras, carrinhos e favoritos antes de excluir. Deseja continuar?',
      confirmText: 'Continuar',
      cancelText: 'Cancelar',
      confirmTone: 'danger',
    });
    if (!accepted) return;

    try {
      const res = await fetch('/api/photos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, eventId, pasta }),
      });

      if (res.status === 409) {
        const data = await res.json();
        setDeletePrompt({
          analysis: data.analysis,
          context: { ids, pasta },
          message: data.message,
        });
        return;
      }

      if (!res.ok) throw new Error();
      setExistingPhotos((prev) => prev.filter((p) => !ids.includes(p.id)));
    } catch (error) {
      console.error(error);
      alert('Erro ao remover foto(s).');
    }
  }, [confirm, eventId]);

  const deleteExistingPhoto = useCallback((photoId) => {
    requestDeletePhotos({ ids: [photoId] });
  }, [requestDeletePhotos]);

  const handleDeleteDecision = useCallback(async (strategy, decisions = {}) => {
    if (!deletePrompt) return;
    setDeleteBusy(true);
    try {
      const res = await fetch('/api/photos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: deletePrompt.context.ids,
          eventId,
          pasta: deletePrompt.context.pasta,
          estrategia: strategy,
          decisoes: decisions,
        }),
      });
      if (!res.ok) throw new Error();
      setExistingPhotos((prev) => prev.filter((p) => !deletePrompt.context.ids.includes(p.id)));
      setDeletePrompt(null);
    } catch (error) {
      console.error(error);
      alert('Erro ao processar exclusão.');
    }
    setDeleteBusy(false);
  }, [deletePrompt, eventId]);

  useEffect(() => {
    if (!loading && queueStats.pending > 0) {
      runAutoUpload();
    }
  }, [loading, queueStats.pending, runAutoUpload]);

  if (loading) {
    return (
      <div className="flex-center" style={{ height: '60vh', gap: '1rem' }}>
        <div className="spinner" style={{ width: '32px', height: '32px' }} />
      </div>
    );
  }

  return (
    <>
      {confirmDialog}
      {pricePolicyPrompt && (
        <CartPricePolicyModal
          analysis={pricePolicyPrompt}
          busy={pricePolicyBusy}
          onCancel={() => {
            pendingPriceChangeRef.current = null;
            setPricePolicyPrompt(null);
          }}
          onConfirm={resolvePricePolicy}
        />
      )}
      {deletePrompt && (
        <SafeDeleteModal
          analysis={deletePrompt.analysis}
          scopeLabel={deletePrompt.context?.ids?.length === 1 ? 'foto' : 'fotos'}
          busy={deleteBusy}
          onCancel={() => setDeletePrompt(null)}
          onConfirm={handleDeleteDecision}
        />
      )}
      <div className="admin-header">
        <div>
          <Link href="/admin" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>← Dashboard</Link>
          <h1 className="admin-page-title" style={{ marginTop: '0.25rem' }}>Upload de Fotos</h1>
          {event && <p style={{ color: 'var(--accent)', fontSize: '0.88rem', marginTop: '0.25rem' }}>📅 {event.name}</p>}
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link href={`/evento/${eventId}`} target="_blank" className="btn btn-ghost">🌐 Ver Galeria</Link>
          <Link href="/admin" className="btn btn-secondary">Voltar</Link>
        </div>
      </div>

      {uploadNotice.text && (
        <div className={`alert ${uploadNotice.type === 'warning' ? 'alert-info' : 'alert-success'}`} style={{ marginBottom: '1rem' }}>
          {uploadNotice.type === 'warning' ? '⚠️' : '✅'} {uploadNotice.text}
        </div>
      )}

      {hasUploadSummary && (
        <div className={`upload-summary ${finalSummaryReady ? 'done' : ''}`}>
          <div>
            <strong>{finalSummaryReady ? 'Resumo final do upload' : 'Resumo desta seleção'}</strong>
            <span>{uploadSummary.queued} de {uploadSummary.selected} arquivo(s) entraram na fila</span>
          </div>
          <div className="upload-summary-grid">
            <span>Enviados <strong>{uploadSummary.sent}</strong></span>
            <span>Duplicados <strong>{uploadSummary.duplicates}</strong></span>
            <span>Erros <strong>{uploadSummary.errors}</strong></span>
            <span>Tipos inválidos <strong>{uploadSummary.invalidTypes}</strong></span>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '2rem', alignItems: 'start' }}>
        <div>
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '1.25rem 1.5rem',
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label className="form-label" style={{ marginBottom: '0.4rem', display: 'block' }}>Preço aplicado no upload</label>
              <div style={{ color: 'var(--text)', fontSize: '1.15rem', fontWeight: 700 }}>
                {formatCurrency(precoGlobal)}
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0.35rem 0 0' }}>
                Usa o preço padrão do álbum quando definido; depois do envio, ajuste valores na lista de fotos enviadas.
              </p>
            </div>
          </div>

          <div
            className={`upload-zone ${dragging ? 'dragging' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              if (!draggingRef.current) {
                draggingRef.current = true;
                setDragging(true);
              }
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget)) return;
              draggingRef.current = false;
              setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              draggingRef.current = false;
              setDragging(false);
              processFiles(event.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="upload-zone-icon">📤</div>
            <p className="upload-zone-text">
              {dragging ? 'Solte fotos e vídeos aqui' : 'Arraste fotos e vídeos aqui'}
            </p>
            <p className="upload-zone-sub">
              Clique para selecionar arquivos. Fotos e vídeos podem ser enviados juntos — o sistema separa automaticamente.
            </p>
            <div className="upload-zone-badges">
              <span>📷 JPG · PNG · WebP</span>
              <span>🎬 MP4 · MOV · WebM</span>
              <span>Duplicatas por nome + tamanho</span>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp,video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
            multiple
            onChange={(event) => {
              processFiles(event.target.files);
              event.target.value = '';
            }}
            style={{ display: 'none' }}
          />

          {videoQueue.length > 0 && (() => {
            const failedVideos = videoQueue.filter(v => v.status === 'erro').length
            const uploadingVideos = videoQueue.filter(v => v.status === 'enviando').length
            return (
            <div style={{ marginTop: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', margin: 0 }}>
                  🎬 Vídeos ({videoQueue.length})
                </h3>
                {failedVideos > 0 && uploadingVideos === 0 && (
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={retryFailedVideos}
                    title="Reenvia somente os vídeos que falharam"
                  >
                    ↻ Tentar novamente ({failedVideos})
                  </button>
                )}
              </div>
              <div style={{ display: 'grid', gap: '0.45rem' }}>
                {videoQueue.map((v) => (
                  <div key={v.id} style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: '0.6rem',
                    alignItems: 'center',
                    padding: '0.55rem 0.75rem',
                    background: 'var(--bg-card)',
                    border: `1px solid ${v.status === 'erro' ? 'rgba(220,38,38,0.4)' : v.status === 'enviado' ? 'rgba(34,197,94,0.4)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius)',
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        🎬 {v.name}
                      </p>
                      <div style={{ marginTop: '0.25rem', display: 'flex', gap: '0.55rem', alignItems: 'center', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                        <span>{(v.size / 1024 / 1024).toFixed(1)} MB</span>
                        <span>·</span>
                        {v.status === 'pendente' && <span>aguardando…</span>}
                        {v.status === 'enviando' && <span style={{ color: 'var(--accent)' }}>enviando {v.progress}%</span>}
                        {v.status === 'enviado' && <span style={{ color: '#86efac' }}>✓ enviado</span>}
                        {v.status === 'erro' && <span style={{ color: '#fca5a5' }}>✗ {v.error}</span>}
                      </div>
                      {(v.status === 'enviando' || v.status === 'pendente') && (
                        <div style={{ marginTop: '0.3rem', height: 4, background: 'var(--bg-input)', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${v.progress}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.3s' }} />
                        </div>
                      )}
                    </div>
                    {(v.status === 'enviado' || v.status === 'erro') && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => removeVideoFromQueue(v.id)}
                        style={{ fontSize: '0.7rem' }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p style={{ marginTop: '0.4rem', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                Vídeos são enviados em paralelo às fotos. Após o upload aparecem na aba <strong>Vídeos</strong> do álbum.
              </p>
            </div>
            )
          })()}

          {fila.length > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
              <div className="flex-between mb-2" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem' }}>
                  Fila ({fila.length})
                </h3>
                <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }}>
                  <span className="upload-pill">⏳ {queueStats.pending} na fila</span>
                  <span className="upload-pill">🚀 {queueStats.uploading} enviando</span>
                  <span className="upload-pill">✅ {queueStats.ok} concluídas</span>
                  {queueStats.erro > 0 && <span className="upload-pill error">⚠️ {queueStats.erro} com erro</span>}
                  {queueStats.ignorado > 0 && <span className="upload-pill">↪ {queueStats.ignorado} ignoradas</span>}
                  {queueStats.erro > 0 && queueStats.uploading === 0 && (
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={retryFailedPhotos}
                      title="Reenvia somente as fotos que falharam"
                    >
                      ↻ Tentar novamente ({queueStats.erro})
                    </button>
                  )}
                  {queueStats.ok > 0 && (
                    <button className="btn btn-sm btn-ghost" onClick={limparEnviados}>Limpar concluídas</button>
                  )}
                  {enviando && <span className="upload-pill">Processando...</span>}
                </div>
              </div>

              <div className="upload-overall-progress">
                <div className="upload-overall-header">
                  <span>Progresso geral da fila</span>
                  <strong>{queueProgress.percent}%</strong>
                </div>
                <div className="upload-overall-track">
                  <div className="upload-overall-fill" style={{ width: `${queueProgress.percent}%` }} />
                </div>
                <p>
                  {queueProgress.done} de {queueProgress.total} arquivo(s) finalizados. A barra considera enviados, duplicados e erros como concluídos para a fila não ficar presa.
                </p>
              </div>

              <div ref={gridRef} className="upload-preview-grid-virtual">
                <div style={{ position: 'relative', height: gridData.totalHeight }}>
                  {gridData.items.map(({ id, item, top, left }) => (
                    <div
                      key={id}
                      style={{
                        position: 'absolute',
                        width: gridData.cardWidth,
                        height: gridData.cardHeight,
                        transform: `translate(${left}px, ${top}px)`,
                      }}
                    >
                      <QueueItem item={item} onRemove={removeFromFila} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.25rem',
            position: 'sticky',
            top: '1rem',
          }}
        >
          <h3
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '1.1rem',
              marginBottom: '1rem',
              paddingBottom: '0.75rem',
              borderBottom: '1px solid var(--border)',
            }}
          >
            Fotos no Evento ({existingPhotos.length})
          </h3>

          {existingPhotos.length === 0 ? (
            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 0' }}>
              Nenhuma foto ainda.
            </p>
          ) : (
            <div style={{ maxHeight: '600px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {existingPhotos.map((photo) => {
                const editando = editandoPreco[photo.id] !== undefined;
                const displaySrc = getRemotePreviewUrl(photo);
                const editedRawValue = editandoPreco[photo.id];
                const editedNumeric = Number(editedRawValue);
                const currentNumeric = Number(photo.price);
                const isPriceDirty = editedRawValue !== '' && Number.isFinite(editedNumeric) && editedNumeric !== currentNumeric;

                return (
                  <div
                    key={photo.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      background: 'var(--bg-secondary)',
                      borderRadius: 'var(--radius)',
                      padding: '0.5rem',
                      border: editando ? '1px solid var(--accent)' : '1px solid transparent',
                    }}
                  >
                    {displaySrc ? (
                      <img
                        src={displaySrc}
                        alt=""
                        loading="lazy"
                        style={{ width: '50px', height: '38px', objectFit: 'cover', borderRadius: '3px', flexShrink: 0 }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '50px',
                          height: '38px',
                          borderRadius: '3px',
                          flexShrink: 0,
                          background: 'var(--bg-input)',
                          border: '1px dashed var(--border)',
                        }}
                      />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {editando ? (
                        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>R$</span>
                          <input
                            type="number"
                            value={editandoPreco[photo.id]}
                            min="0"
                            step="0.01"
                            autoFocus
                            onChange={(event) => setEditandoPreco((prev) => ({ ...prev, [photo.id]: event.target.value }))}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' && isPriceDirty) salvarPreco(photo.id);
                              if (event.key === 'Escape') cancelarEdicaoPreco(photo.id);
                            }}
                            style={{
                              background: 'var(--bg-input)',
                              border: '1px solid var(--accent)',
                              color: 'var(--accent)',
                              borderRadius: '4px',
                              padding: '0.2rem 0.4rem',
                              fontSize: '0.85rem',
                              width: '70px',
                            }}
                          />
                          <button
                            className={`btn btn-sm ${isPriceDirty ? 'btn-state-dirty' : 'btn-state-clean'}`}
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem' }}
                            onClick={() => salvarPreco(photo.id)}
                            disabled={salvandoPreco === photo.id || !isPriceDirty}
                          >
                            {salvandoPreco === photo.id ? <div className="spinner" style={{ width: '12px', height: '12px' }} /> : '✓'}
                          </button>
                          <button
                            className="btn btn-sm btn-ghost"
                            style={{ padding: '0.2rem 0.4rem', fontSize: '0.72rem' }}
                            onClick={() => cancelarEdicaoPreco(photo.id)}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontFamily: 'var(--font-heading)', color: 'var(--accent)', fontSize: '1rem' }}>
                            R$ {Number(photo.price).toFixed(2).replace('.', ',')}
                          </span>
                          <button
                            className="btn btn-sm btn-ghost"
                            style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem', color: 'var(--text-dim)' }}
                            onClick={() => iniciarEdicaoPreco(photo)}
                            title="Editar preço"
                          >
                            ✏️
                          </button>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => deleteExistingPhoto(photo.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--danger)',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        padding: '0.2rem',
                        opacity: 0.7,
                        flexShrink: 0,
                      }}
                      title="Remover foto"
                    >
                      🗑
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
