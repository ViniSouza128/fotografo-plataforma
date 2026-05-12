'use client'
// src/app/admin/eventos/[id]/videos/page.js
// Compatibilidade: redireciona para a aba "Vídeos" do painel do evento.
// Mantido para não quebrar URLs antigas/links externos.

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function VideosRedirectPage() {
  const { id } = useParams()
  const router = useRouter()
  useEffect(() => {
    router.replace(`/admin/eventos/${id}?tab=videos`)
  }, [id, router])
  return (
    <div className="flex-center" style={{ minHeight: '40vh' }}>
      <div className="spinner" style={{ width: '32px', height: '32px' }} />
    </div>
  )
}
