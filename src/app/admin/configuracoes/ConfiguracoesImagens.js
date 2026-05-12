'use client'

import { useMemo, useState } from 'react'
import { getDefaultDerivativeConfig } from '@/lib/derivedImagesConfig'
import { simulateProgressiveTable, detectIncoherentTiers } from '@/lib/pricing'

const CATEGORIAS_PADRAO = [
  'Futebol', 'Crossfit', 'Ciclismo', 'Beach Tennis', 'Futsal', 'Corrida', 'Natação',
  'Vôlei', 'Futevôlei', 'Basquete', 'Artes Marciais', 'Surf', 'Motociclismo',
  'Jiu-jítsu', 'Padel', 'Tenis', 'Canoa Havaiana', 'Mountain Bike', 'Ginástica',
  'Formaturas', 'Teatro e Musicais', 'Festas', 'Casamento', 'Aniversário Infantil',
  'Shows/Concertos', 'Festivais', 'Eventos', 'Corporativo', 'Ensaios', 'Outro',
].sort()

const DERIVATIVE_FIELDS = [
  {
    key: 'grid',
    title: 'Grid',
    description: 'Versão principal com proporção original e lado maior limitado.',
    sizeLabel: 'Lado maior (px)',
    sizeField: 'maxSize',
    sizeMin: 256,
    sizeMax: 6000,
    sizeStep: 64,
    qualityLabel: 'Qualidade JPEG',
    path: '/uploads/<eventId>/grid/{clean|wm}',
  },
  {
    key: 'thumbs',
    title: 'Thumb',
    description: 'Miniatura quadrada do catálogo e listagens.',
    sizeLabel: 'Lado quadrado (px)',
    sizeField: 'size',
    sizeMin: 64,
    sizeMax: 2000,
    sizeStep: 10,
    qualityLabel: 'Qualidade JPEG',
    path: '/uploads/<eventId>/thumbs/{clean|wm}',
  },
  {
    key: 'mini',
    title: 'Mini',
    description: 'Prévia ultraleve usada em grids compactos e cards rápidos.',
    sizeLabel: 'Lado quadrado (px)',
    sizeField: 'size',
    sizeMin: 32,
    sizeMax: 600,
    sizeStep: 5,
    qualityLabel: 'Qualidade JPEG',
    path: '/uploads/<eventId>/mini/{clean|wm}',
  },
  {
    key: 'covers',
    title: 'Cover',
    description: 'Capa reduzida do evento com proporção original preservada.',
    sizeLabel: 'Largura máxima (px)',
    sizeField: 'width',
    sizeMin: 120,
    sizeMax: 3000,
    sizeStep: 10,
    qualityLabel: 'Qualidade JPEG',
    path: '/uploads/<eventId>/covers/{clean|wm}',
  },
]

function cardStyle() {
  return {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '1.75rem',
  }
}

function getMergedDefaults(config) {
  const defaults = getDefaultDerivativeConfig()
  return {
    ...defaults,
    ...config,
    derivatives: {
      ...defaults.derivatives,
      ...(config?.derivatives || {}),
    },
    watermarkVariants: {
      ...defaults.watermarkVariants,
      ...(config?.watermarkVariants || {}),
    },
    uploadOptimization: {
      ...defaults.uploadOptimization,
      ...(config?.uploadOptimization || {}),
    },
  }
}

export default function ConfiguracoesImagens({
  config,
  setConfig,
  saving,
  isDirty,
  onSaveConfig,
  descontosRows,
  setDescontosRows,
  descontosAtivos,
  setDescontosAtivos,
  descontosVideoRows,
  setDescontosVideoRows,
  descontosVideoAtivos,
  setDescontosVideoAtivos,
  showMsg,
}) {
  const defaults = useMemo(() => getDefaultDerivativeConfig(), [])
  const [novaCategoria, setNovaCategoria] = useState('')

  const precoBase = Number(config.precoFotoDefault) || 0
  const precoBaseVideo = Number(config.precoVideoDefault) || 0
  const currentConfig = getMergedDefaults(config)

  function updateDerivative(kind, field, value) {
    const numeric = Number(value)
    setConfig((prev) => {
      const merged = getMergedDefaults(prev)
      return {
        ...merged,
        derivatives: {
          ...merged.derivatives,
          [kind]: {
            ...merged.derivatives[kind],
            [field]: numeric,
          },
        },
      }
    })
  }

  function resetDerivative(kind) {
    setConfig((prev) => {
      const merged = getMergedDefaults(prev)
      return {
        ...merged,
        derivatives: {
          ...merged.derivatives,
          [kind]: { ...defaults.derivatives[kind] },
        },
      }
    })
    showMsg('success', `Padrão restaurado para ${kind}.`)
  }

  function resetAllDerivatives() {
    setConfig((prev) => ({
      ...getMergedDefaults(prev),
      derivatives: {
        grid: { ...defaults.derivatives.grid },
        thumbs: { ...defaults.derivatives.thumbs },
        mini: { ...defaults.derivatives.mini },
        covers: { ...defaults.derivatives.covers },
      },
    }))
    showMsg('success', 'Padrões das imagens derivadas restaurados.')
  }

  function updateUploadOptimization(field, value) {
    setConfig((prev) => {
      const merged = getMergedDefaults(prev)
      const nextValue = field === 'preserveOriginal'
        ? Boolean(value)
        : value === '' || value === null || value === undefined
          ? null
          : Number(value)

      return {
        ...merged,
        uploadOptimization: {
          ...merged.uploadOptimization,
          [field]: nextValue,
        },
      }
    })
  }

  function resetUploadOptimization() {
    setConfig((prev) => ({
      ...getMergedDefaults(prev),
      uploadOptimization: { ...defaults.uploadOptimization },
    }))
    showMsg('success', 'Padrão de otimização de upload restaurado.')
  }

  function addDescontoRow() {
    setDescontosRows((prev) => [...prev, { quantidade: '', desconto: '' }])
  }

  function removeDescontoRow(index) {
    setDescontosRows((prev) => prev.filter((_, idx) => idx !== index))
  }

  function updateDescontoRow(index, field, value) {
    setDescontosRows((prev) => prev.map((row, idx) => (
      idx === index ? { ...row, [field]: value } : row
    )))
  }

  function addDescontoVideoRow() {
    setDescontosVideoRows((prev) => [...(prev || []), { quantidade: '', desconto: '' }])
  }

  function removeDescontoVideoRow(index) {
    setDescontosVideoRows((prev) => (prev || []).filter((_, idx) => idx !== index))
  }

  function updateDescontoVideoRow(index, field, value) {
    setDescontosVideoRows((prev) => (prev || []).map((row, idx) => (
      idx === index ? { ...row, [field]: value } : row
    )))
  }

  function addCategoria() {
    const nome = novaCategoria.trim()
    if (!nome) return
    if ((config.categoriasCustom || []).includes(nome) || CATEGORIAS_PADRAO.includes(nome)) {
      showMsg('error', 'Categoria já existe.')
      return
    }
    setConfig((prev) => ({ ...prev, categoriasCustom: [...(prev.categoriasCustom || []), nome] }))
    setNovaCategoria('')
  }

  function removeCategoria(nome) {
    setConfig((prev) => ({
      ...prev,
      categoriasCustom: (prev.categoriasCustom || []).filter((categoria) => categoria !== nome),
    }))
  }

  return (
    <>
      <div style={cardStyle()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', marginBottom: '0.4rem' }}>Imagens derivadas</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', lineHeight: '1.5', maxWidth: '56ch' }}>
              O super-admin define aqui o tamanho e a qualidade de cada variante canônica. A sanitização usa estes valores para apagar legado inválido e reconstruir tudo a partir dos originais.
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={resetAllDerivatives} type="button">
            Restaurar tudo para o padrão
          </button>
        </div>

        <div style={{ display: 'grid', gap: '1rem' }}>
          {DERIVATIVE_FIELDS.map((item) => {
            const settings = currentConfig.derivatives[item.key]
            const sizeValue = settings?.[item.sizeField] ?? defaults.derivatives[item.key][item.sizeField]
            const qualityValue = settings?.quality ?? defaults.derivatives[item.key].quality

            return (
              <div
                key={item.key}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '1rem',
                  background: 'var(--bg-secondary)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                  <div>
                    <h3 style={{ fontSize: '1rem', marginBottom: '0.25rem' }}>{item.title}</h3>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: '1.45', marginBottom: '0.3rem' }}>
                      {item.description}
                    </p>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Pasta canônica: <code>{item.path}</code>
                    </p>
                  </div>
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => resetDerivative(item.key)}>
                    Restaurar padrão
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">{item.sizeLabel}</label>
                    <input aria-label="{item.sizeLabel}"
                      type="number"
                      className="form-input"
                      min={item.sizeMin}
                      max={item.sizeMax}
                      step={item.sizeStep}
                      value={sizeValue}
                      onChange={(e) => updateDerivative(item.key, item.sizeField, e.target.value)}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">{item.qualityLabel} ({qualityValue}%)</label>
                    <input aria-label="{item.qualityLabel} ({qualityValue}%)"
                      type="range"
                      min={10}
                      max={100}
                      step={1}
                      value={qualityValue}
                      onChange={(e) => updateDerivative(item.key, 'quality', e.target.value)}
                      style={{ width: '100%', accentColor: 'var(--accent)', marginTop: '0.4rem' }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className={`btn ${isDirty ? 'btn-state-dirty' : 'btn-state-clean'}`} onClick={onSaveConfig} disabled={saving || !isDirty}>
            {saving ? 'Salvando...' : 'Salvar definições das derivadas'}
          </button>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
            Padrão atual: cover em {currentConfig.derivatives.covers.width}px com qualidade {currentConfig.derivatives.covers.quality}%.
          </span>
        </div>
      </div>

      <div style={cardStyle()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', marginBottom: '0.4rem' }}>Otimização de upload</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', lineHeight: '1.5', maxWidth: '58ch' }}>
              Controla o arquivo armazenado em <code>storage/originals</code>. Ao preservar o original, o arquivo enviado fica intacto; ao desligar, o servidor salva uma versão JPEG otimizada.
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" type="button" onClick={resetUploadOptimization}>
            Restaurar padrão
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', alignItems: 'end' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
              padding: '0.85rem 1rem',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              cursor: 'pointer',
              minHeight: '66px',
            }}
          >
            <span>
              <span style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text)', fontWeight: 600 }}>Preservar original</span>
              <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>Mantém o arquivo enviado sem recompressão.</span>
            </span>
            <input
              type="checkbox"
              checked={currentConfig.uploadOptimization.preserveOriginal}
              onChange={(e) => updateUploadOptimization('preserveOriginal', e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: 'var(--accent)', flexShrink: 0 }}
            />
          </label>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Lado maior máximo (px)</label>
            <input aria-label="Lado maior máximo (px)"
              type="number"
              className="form-input"
              min={1200}
              max={12000}
              step={100}
              value={currentConfig.uploadOptimization.maxLongSide ?? ''}
              onChange={(e) => updateUploadOptimization('maxLongSide', e.target.value)}
              disabled={currentConfig.uploadOptimization.preserveOriginal}
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Qualidade JPG ({currentConfig.uploadOptimization.jpgQuality}%)</label>
            <input aria-label="Qualidade JPG ({currentConfig.uploadOptimization.jpgQuality}%)"
              type="range"
              min={45}
              max={95}
              step={1}
              value={currentConfig.uploadOptimization.jpgQuality}
              onChange={(e) => updateUploadOptimization('jpgQuality', e.target.value)}
              disabled={currentConfig.uploadOptimization.preserveOriginal}
              style={{ width: '100%', accentColor: 'var(--accent)', marginTop: '0.4rem' }}
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Limite aproximado (MB)</label>
            <input aria-label="Limite aproximado (MB)"
              type="number"
              className="form-input"
              min={1}
              max={80}
              step={1}
              placeholder="Sem limite"
              value={currentConfig.uploadOptimization.targetMaxMb ?? ''}
              onChange={(e) => updateUploadOptimization('targetMaxMb', e.target.value)}
              disabled={currentConfig.uploadOptimization.preserveOriginal}
            />
          </div>
        </div>

        <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className={`btn ${isDirty ? 'btn-state-dirty' : 'btn-state-clean'}`} onClick={onSaveConfig} disabled={saving || !isDirty}>
            {saving ? 'Salvando...' : 'Salvar otimização'}
          </button>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
            {currentConfig.uploadOptimization.preserveOriginal
              ? 'Originais serão mantidos intactos.'
              : `Arquivos serão salvos como JPG até ${currentConfig.uploadOptimization.maxLongSide || 'sem limite'}px.`}
          </span>
        </div>
      </div>

      <DescontosCard
        descontosRows={descontosRows}
        setDescontosRows={setDescontosRows}
        descontosAtivos={descontosAtivos}
        setDescontosAtivos={setDescontosAtivos}
        precoBase={precoBase}
        addDescontoRow={addDescontoRow}
        removeDescontoRow={removeDescontoRow}
        updateDescontoRow={updateDescontoRow}
        cardStyle={cardStyle}
        isDirty={isDirty}
        saving={saving}
        onSaveConfig={onSaveConfig}
        showMsg={showMsg}
        title="📷 Descontos progressivos padrão (fotos)"
        applyMode="fotos"
      />

      <DescontosCard
        descontosRows={descontosVideoRows || []}
        setDescontosRows={setDescontosVideoRows}
        descontosAtivos={!!descontosVideoAtivos}
        setDescontosAtivos={setDescontosVideoAtivos}
        precoBase={precoBaseVideo}
        addDescontoRow={addDescontoVideoRow}
        removeDescontoRow={removeDescontoVideoRow}
        updateDescontoRow={updateDescontoVideoRow}
        cardStyle={cardStyle}
        isDirty={isDirty}
        saving={saving}
        onSaveConfig={onSaveConfig}
        showMsg={showMsg}
        title="🎬 Descontos progressivos padrão (vídeos)"
        applyMode="videos"
      />

      <div style={cardStyle()}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', marginBottom: '0.5rem' }}>Categorias / modalidades</h2>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: '1rem', lineHeight: '1.5' }}>
          Adicione categorias personalizadas além das padrão. Elas aparecem no seletor de categoria dos eventos.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1rem' }}>
          {(config.categoriasCustom || []).length === 0 && (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Nenhuma categoria personalizada ainda.</span>
          )}
          {(config.categoriasCustom || []).sort().map((categoria) => (
            <span
              key={categoria}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                background: 'var(--accent-dim)',
                color: 'var(--accent)',
                fontSize: '0.78rem',
                padding: '0.2rem 0.6rem',
                borderRadius: '100px',
              }}
            >
              {categoria}
              <button
                onClick={() => removeCategoria(categoria)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: '0.7rem', padding: 0, lineHeight: 1 }}
                type="button"
              >
                ×
              </button>
            </span>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Nova categoria..."
            value={novaCategoria}
            onChange={(e) => setNovaCategoria(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCategoria()
              }
            }}
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary btn-sm" onClick={addCategoria} disabled={!novaCategoria.trim()} type="button">
            Adicionar
          </button>
        </div>

        <div style={{ marginTop: '1.25rem' }}>
          <button className={`btn ${isDirty ? 'btn-state-dirty' : 'btn-state-clean'}`} onClick={onSaveConfig} disabled={saving || !isDirty}>
            {saving ? 'Salvando...' : 'Salvar categorias'}
          </button>
        </div>
      </div>
    </>
  )
}

function DescontosCard({
  descontosRows,
  setDescontosRows,
  descontosAtivos,
  setDescontosAtivos,
  precoBase,
  addDescontoRow,
  removeDescontoRow,
  updateDescontoRow,
  cardStyle,
  isDirty,
  saving,
  onSaveConfig,
  showMsg,
  title = 'Descontos progressivos padrão',
  applyMode = 'fotos',
}) {
  const [showSimulator, setShowSimulator] = useState(false)
  const [applying, setApplying] = useState(false)

  const incoherentSet = useMemo(
    () => detectIncoherentTiers({ precoBase, tabela: descontosRows, ativos: true }),
    [precoBase, descontosRows]
  )

  const simulatorRows = useMemo(
    () => simulateProgressiveTable({ precoBase, tabela: descontosRows, ativos: descontosAtivos }),
    [precoBase, descontosRows, descontosAtivos]
  )

  async function handleApplyToAll(mode) {
    if (applying) return
    setApplying(true)
    try {
      const res = await fetch('/api/events/aplicar-descontos-globais', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, target: applyMode }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Erro ao aplicar')
      showMsg('success', `Aplicado a ${data.touched} álbum${data.touched === 1 ? '' : 's'}.`)
    } catch (err) {
      showMsg('error', err.message || 'Falha ao aplicar.')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div style={cardStyle()}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem' }}>{title}</h2>
        <button
          onClick={() => setDescontosAtivos((value) => !value)}
          style={{
            width: '44px',
            height: '24px',
            borderRadius: '12px',
            border: 'none',
            cursor: 'pointer',
            background: descontosAtivos ? 'var(--accent)' : 'var(--bg-input)',
            position: 'relative',
            transition: 'background 0.2s',
            flexShrink: 0,
          }}
          title={descontosAtivos ? 'Desativar descontos padrão' : 'Ativar descontos padrão'}
          type="button"
        >
          <div
            style={{
              position: 'absolute',
              top: '3px',
              left: descontosAtivos ? '23px' : '3px',
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              background: '#fff',
              transition: 'left 0.2s',
            }}
          />
        </button>
      </div>
      <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: '1rem', lineHeight: '1.5' }}>
        {descontosAtivos ? 'Ativos. Aplicados como padrão em novos álbuns. Álbuns existentes só recebem se você usar o botão abaixo.' : 'Inativos. Novos álbuns não terão desconto automático.'}
      </p>

      {descontosRows.map((row, index) => {
        const resultante = (precoBase > 0 && row.desconto) ? precoBase * (1 - Number(row.desconto) / 100) : null
        const prevDesconto = index > 0 ? Number(descontosRows[index - 1].desconto) : -1
        const erroDesconto = row.desconto && Number(row.desconto) <= prevDesconto
        const isIncoherent = incoherentSet.has(index)
        const errorBorder = (erroDesconto || isIncoherent) ? 'var(--danger)' : undefined

        return (
          <div key={index} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ flex: '0 0 90px' }}>
              {index === 0 && <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'block', marginBottom: '0.2rem' }}>A partir de</label>}
              <input
                aria-label="Quantidade minima do tier"
                type="number"
                className="form-input"
                placeholder="Qtd"
                min="1"
                value={row.quantidade}
                onChange={(e) => updateDescontoRow(index, 'quantidade', e.target.value)}
                style={{ borderColor: errorBorder }}
              />
            </div>
            <div style={{ flex: '0 0 80px' }}>
              {index === 0 && <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'block', marginBottom: '0.2rem' }}>Desconto %</label>}
              <input
                aria-label="Desconto percentual do tier"
                type="number"
                className="form-input"
                placeholder="%"
                min="0"
                max="100"
                value={row.desconto}
                onChange={(e) => updateDescontoRow(index, 'desconto', e.target.value)}
                style={{ borderColor: errorBorder }}
              />
            </div>
            {resultante != null && (
              <div style={{ flex: 1 }}>
                {index === 0 && <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginBottom: '0.2rem' }}>Valor / foto</div>}
                <div style={{ padding: '0.52rem 0.6rem', background: 'var(--bg-input)', border: `1px solid ${errorBorder || 'var(--border)'}`, borderRadius: 'var(--radius)', fontSize: '0.78rem', color: errorBorder ? 'var(--danger)' : 'var(--accent)', fontWeight: 600 }}>
                  R$ {resultante.toFixed(2).replace('.', ',')}
                </div>
              </div>
            )}
            {erroDesconto && <span style={{ fontSize: '0.65rem', color: 'var(--danger)', alignSelf: 'center' }}>desconto deve ser maior que {prevDesconto}%</span>}
            {isIncoherent && !erroDesconto && <span style={{ fontSize: '0.65rem', color: 'var(--danger)', alignSelf: 'center' }}>⚠️ faixa incoerente — quantidade maior fica mais barata</span>}
            <button className="btn btn-ghost btn-sm" onClick={() => removeDescontoRow(index)} style={{ color: 'var(--danger)', flexShrink: 0 }} type="button">
              Remover
            </button>
          </div>
        )
      })}

      {descontosRows.length < 10 ? (
        <button className="btn btn-ghost btn-sm" onClick={addDescontoRow} style={{ marginTop: '0.25rem' }} type="button">
          Adicionar faixa
        </button>
      ) : (
        <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>Máximo de 10 faixas atingido.</p>
      )}

      <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => setShowSimulator((v) => !v)}>
          {showSimulator ? '▾ Esconder simulador' : '▸ Simular 1–40 fotos'}
        </button>
        {precoBase <= 0 && (
          <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Defina o preço padrão para simular.</span>
        )}
      </div>

      {showSimulator && precoBase > 0 && (
        <div style={{ marginTop: '0.75rem', overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-input)' }}>
                <th style={{ padding: '0.45rem 0.6rem', textAlign: 'left', color: 'var(--text-dim)' }}>Qtd</th>
                <th style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: 'var(--text-dim)' }}>Desconto</th>
                <th style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: 'var(--text-dim)' }}>Valor / foto</th>
                <th style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: 'var(--text-dim)' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {simulatorRows.map((r) => (
                <tr key={r.qty} style={{ borderTop: '1px solid var(--border)', background: r.warn ? 'rgba(220,38,38,0.08)' : 'transparent' }}>
                  <td style={{ padding: '0.4rem 0.6rem' }}>{r.qty}</td>
                  <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: r.pct > 0 ? 'var(--accent)' : 'var(--text-dim)' }}>{r.pct > 0 ? `${r.pct}%` : '—'}</td>
                  <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right' }}>R$ {r.unit.toFixed(2).replace('.', ',')}</td>
                  <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', fontWeight: 600 }}>
                    R$ {r.total.toFixed(2).replace('.', ',')}
                    {r.warn && <span title="Adicionar mais fotos baixa o total" style={{ marginLeft: '0.3rem', color: 'var(--danger)' }}>⚠️</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button className={`btn ${isDirty ? 'btn-state-dirty' : 'btn-state-clean'}`} onClick={onSaveConfig} disabled={saving || !isDirty}>
          {saving ? 'Salvando...' : 'Salvar descontos'}
        </button>
      </div>

      <hr className="divider" style={{ margin: '1.25rem 0' }} />

      <div>
        <h3 style={{ fontSize: '0.95rem', marginBottom: '0.4rem' }}>Aplicar a álbuns existentes</h3>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', lineHeight: 1.5, marginBottom: '0.75rem' }}>
          Salve as alterações primeiro. Depois escolha como aplicar nos álbuns já criados.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button className="btn btn-secondary btn-sm" type="button" disabled={applying || isDirty} onClick={() => handleApplyToAll('switchToGlobal')} title="Marca todos os álbuns para usar a tabela global">
            {applying ? 'Aplicando...' : '🔁 Trocar todos para "Usar global"'}
          </button>
          <button className="btn btn-ghost btn-sm" type="button" disabled={applying || isDirty} onClick={() => handleApplyToAll('onlyDefault')} title="Só ativa global em álbuns sem tabela própria">
            {applying ? 'Aplicando...' : '🆕 Apenas álbuns sem desconto próprio'}
          </button>
          <button className="btn btn-ghost btn-sm" type="button" disabled={applying || isDirty} onClick={() => handleApplyToAll('override')} title="Sobrescreve a tabela própria de cada álbum com a global" style={{ color: 'var(--danger)' }}>
            {applying ? 'Aplicando...' : '⚠️ Sobrescrever tabelas próprias'}
          </button>
        </div>
        {isDirty && (
          <p style={{ fontSize: '0.72rem', color: 'var(--accent)', marginTop: '0.5rem' }}>
            Salve as alterações antes de aplicar nos álbuns.
          </p>
        )}
      </div>
    </div>
  )
}
