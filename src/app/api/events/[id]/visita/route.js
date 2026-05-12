// POST /api/events/[id]/visita — incrementa contador de visitas do evento
import { NextResponse } from 'next/server'
import { readEvents, writeEvents } from '@/lib/events'

export async function POST(request, { params }) {
  try {
    const { id } = await params
    const events = readEvents()
    const index = events.findIndex(e => e.id === id)
    if (index === -1) {
      return NextResponse.json({ error: 'Evento não encontrado' }, { status: 404 })
    }
    events[index].visitas = (events[index].visitas || 0) + 1
    writeEvents(events)
    return NextResponse.json({ visitas: events[index].visitas })
  } catch {
    return NextResponse.json({ error: 'Erro ao registrar visita' }, { status: 500 })
  }
}
