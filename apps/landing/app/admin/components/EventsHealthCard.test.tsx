import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import EventsHealthCard from './EventsHealthCard'
import type { EventsHealth } from '@/lib/adminEvents'

const healthyData: EventsHealth = {
  perHour24h: 42,
  activeClientsToday: 14,
  pipelineOk: true,
}

const unhealthyData: EventsHealth = {
  perHour24h: 0,
  activeClientsToday: 0,
  pipelineOk: false,
}

describe('EventsHealthCard', () => {
  it('renderiza pill verde quando pipelineOk true', () => {
    render(<EventsHealthCard data={healthyData} />)
    expect(screen.getByText('Pipeline saudável')).toBeTruthy()
    expect(screen.queryByText('Sem eventos recentes')).toBeNull()
  })

  it('renderiza pill amarelo quando pipelineOk false', () => {
    render(<EventsHealthCard data={unhealthyData} />)
    expect(screen.getByText('Sem eventos recentes')).toBeTruthy()
    expect(screen.queryByText('Pipeline saudável')).toBeNull()
  })

  it('renderiza métricas de eventos e clientes', () => {
    render(<EventsHealthCard data={healthyData} />)
    expect(screen.getByText('42')).toBeTruthy()
    expect(screen.getByText('14')).toBeTruthy()
  })
})
