// Modal generico para decidir lixeira segura e preservacao de midias vinculadas.
import { useMemo, useState } from 'react'

export default function SafeDeleteModal({ analysis, onCancel, onConfirm, scopeLabel = 'itens', busy = false }) {
  const importantes = analysis?.importantes || []
  const [mode, setMode] = useState(importantes.length > 1 ? 'individual' : 'preservar')
  const [decisions, setDecisions] = useState(() => {
    const initial = {}
    importantes.forEach(item => { initial[item.id] = 'preservar' })
    return initial
  })

  const totalVinculos = useMemo(() => {
    return importantes.reduce((s, item) => s + (item.vinculos?.total || 0), 0)
  }, [importantes])

  function toggleDecision(id, value) {
    setDecisions(prev => ({ ...prev, [id]: value }))
  }

  function handleConfirm(selectedMode) {
    const chosen = selectedMode || mode
    if (onConfirm) onConfirm(chosen, chosen === 'individual' ? decisions : {})
  }

  return (
    <div className="confirm-dialog-backdrop" style={{ zIndex: 9999 }} onClick={onCancel}>
      <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
        <h3 className="confirm-dialog-title">Lixeira segura</h3>
        <p className="confirm-dialog-message" style={{ marginBottom: '0.75rem' }}>
          Encontramos {importantes.length} {scopeLabel} com vinculos importantes (total de {totalVinculos} ocorrencias).
          Midias vinculadas serao preservadas em area protegida; midias sem vinculos vao para a lixeira fisica.
        </p>

        <div style={{ display: 'grid', gap: '0.6rem', marginBottom: '0.6rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <input
              type="radio"
              name="delete-mode"
              checked={mode === 'preservar'}
              onChange={() => setMode('preservar')}
            />
            <span><strong>Preservar vinculadas e mover o restante para lixeira</strong></span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <input
              type="radio"
              name="delete-mode"
              checked={mode === 'agressivo'}
              onChange={() => setMode('agressivo')}
            />
            <span><strong>Limpar itens sem vinculo e manter vinculadas preservadas</strong></span>
          </label>
          {importantes.length > 1 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <input
                type="radio"
                name="delete-mode"
                checked={mode === 'individual'}
                onChange={() => setMode('individual')}
              />
              <span><strong>Revisar individualmente</strong></span>
            </label>
          )}
        </div>

        {mode === 'individual' && importantes.length > 0 && (
          <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.5rem', marginBottom: '0.75rem' }}>
            {importantes.map(item => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '0.35rem 0' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{item.photo?.originalName || item.photo?.filename || item.id}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                    {(() => {
                      const parts = []
                      if (item.vinculos?.compras) parts.push(`compras: ${item.vinculos.compras}`)
                      if (item.vinculos?.carrinhos) parts.push(`carrinhos: ${item.vinculos.carrinhos}`)
                      if (item.vinculos?.favoritos) parts.push(`favoritos: ${item.vinculos.favoritos}`)
                      if (item.vinculos?.curtidas) parts.push(`curtidas: ${item.vinculos.curtidas}`)
                      return parts.join(' | ')
                    })()}
                  </div>
                </div>
                <select
                  className="form-input"
                  value={decisions[item.id] || 'preservar'}
                  onChange={e => toggleDecision(item.id, e.target.value)}
                  style={{ width: '160px' }}
                >
                  <option value="preservar">Preservar</option>
                  <option value="agressivo">Lixeira se seguro</option>
                </select>
              </div>
            ))}
          </div>
        )}

        <div className="confirm-dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className={`btn ${mode === 'agressivo' ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => handleConfirm()}
            disabled={busy}
          >
            {busy ? 'Processando...' : 'Confirmar movimentacao'}
          </button>
        </div>
      </div>
    </div>
  )
}
