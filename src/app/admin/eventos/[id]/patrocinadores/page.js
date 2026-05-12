'use client'
// src/app/admin/eventos/[id]/patrocinadores/page.js
// Compatibilidade: redireciona para a aba "Patrocinadores" do painel do evento.

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function PatrocinadoresRedirectPage() {
  const { id } = useParams()
  const router = useRouter()
  useEffect(() => {
    router.replace(`/admin/eventos/${id}?tab=patrocinadores`)
  }, [id, router])
  return (
    <div className="flex-center" style={{ minHeight: '40vh' }}>
      <div className="spinner" style={{ width: '32px', height: '32px' }} />
    </div>
  )
}
