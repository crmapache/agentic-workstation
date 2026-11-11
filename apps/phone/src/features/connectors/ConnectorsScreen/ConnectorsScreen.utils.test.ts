import type { TFunction } from 'i18next'
import { it, expect, describe } from 'vitest'

import type { ConnectorWire } from '@agentic-workstation/remote-protocol/machine-wire-types'

import { connectorName, connectorFacts } from './ConnectorsScreen.utils'

const t = ((key: string) => key) as unknown as TFunction

const connector = (patch: Partial<ConnectorWire>): ConnectorWire => ({
  id: 'c-1',
  kind: 'gmail',
  name: null,
  label: '',
  account: null,
  status: 'connected',
  failure: null,
  enabled: true,
  tools: 10,
  toolsOn: 8,
  ...patch,
})

describe('коннекторы на телефоне', () => {
  it('встроенный - по виду, свой тип - своим именем', () => {
    expect(connectorName(t, connector({}))).toBe('connectors.kinds.gmail')
    expect(connectorName(t, connector({ kind: 'http', name: 'Linear' }))).toBe('Linear')
  })

  it('подпись и чей вход - без пустых', () => {
    expect(connectorFacts(connector({ label: 'Work', account: 'm…x@gmail.com' }))).toBe(
      'Work · m…x@gmail.com',
    )
    expect(connectorFacts(connector({}))).toBe('')
  })
})
