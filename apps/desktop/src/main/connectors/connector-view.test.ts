import { it, expect, describe } from 'vitest'

import { EVERYWHERE } from '@shared/connector-availability'

import type { StoredConnector } from './connector-store'
import { statusOf, enabledTools, connectorView, instructionsFor } from './connector-view'

const connector: StoredConnector = {
  id: 'a',
  kind: 'gmail',
  label: 'Work',
  typeId: null,
  description: '',
  serverName: 'gmail-work',
  url: null,
  auth: null,
  transport: null,
  command: null,
  spec: null,
  availability: EVERYWHERE,
  account: 'me@work.com',
  enabled: true,
  toolOverrides: {},
  tools: [
    { name: 'search_threads', description: '', access: 'read' },
    { name: 'send_draft', description: '', access: 'outbound' },
  ],
}

const live = { signedIn: true, signingIn: false, failure: null }

describe('statusOf', () => {
  it('выключен - главнее всего, дальше вход, потом сбой', () => {
    expect(statusOf({ ...connector, enabled: false }, { ...live, signingIn: true })).toBe(
      'disabled',
    )
    expect(statusOf(connector, { ...live, signingIn: true })).toBe('signing-in')
    expect(statusOf(connector, { ...live, signedIn: false })).toBe('signed-out')
    expect(statusOf(connector, { ...live, failure: 'unreachable' })).toBe('failed')
    expect(statusOf(connector, live)).toBe('connected')
  })
})

describe('enabledTools', () => {
  it('отправка выключена, пока человек её не включил', () => {
    expect(enabledTools(connector.tools, {}).map((tool) => tool.name)).toEqual(['search_threads'])
    expect(enabledTools(connector.tools, { send_draft: true, search_threads: false })).toEqual([
      connector.tools[1],
    ])
  })
})

describe('connectorView', () => {
  it('отправка выключена, адрес своего MCP - как в реестре', () => {
    const view = connectorView({ ...connector, kind: 'mcp', url: 'https://x.dev/mcp' }, live, null)

    expect(view.url).toBe('https://x.dev/mcp')
    expect(view.description).toBe('')
    expect(view).toMatchObject({ typeId: null, name: null })
    expect(view.tools.map((tool) => tool.enabled)).toEqual([true, false])
  })
})

describe('instructionsFor', () => {
  it('говорит, чей ящик и что отправка выключена', () => {
    const text = instructionsFor(connector, live, null)

    expect(text).toContain('me@work.com')
    expect(text).toContain('prepare drafts')
  })

  it('без входа - просит войти на виде Connectors', () => {
    expect(instructionsFor(connector, { ...live, signedIn: false }, null)).toContain(
      'not signed in',
    )
  })

  it('свой тип - по имени, «один раз» без подписи', () => {
    const playwright = {
      ...connector,
      kind: 'command' as const,
      label: '',
      serverName: 'playwright',
      account: null,
    }

    expect(instructionsFor(playwright, live, 'Playwright')).toMatch(
      /^Playwright \(MCP server\), connected through Agentic Workstation\./,
    )
    expect(instructionsFor({ ...playwright, enabled: false }, live, 'Playwright')).toContain(
      'Connectors → Playwright.',
    )
    expect(instructionsFor({ ...playwright, label: '1' }, live, 'Playwright')).toMatch(
      /^Playwright \(MCP server\) \("1"\)/,
    )
  })

  it('Browser: действовать на странице рукой, evaluate - только читать; выключенному - не надо', () => {
    const browser = { ...connector, kind: 'browser' as const, label: '', account: null, tools: [] }
    const text = instructionsFor(browser, live, null)

    expect(text).toMatch(/^the user's Chrome, connected through Agentic Workstation\.\n/)
    expect(text).toContain('Use evaluate only to read or compute')
    expect(instructionsFor({ ...browser, enabled: false }, live, null)).not.toContain('evaluate')
    expect(instructionsFor(connector, live, null)).not.toContain('evaluate')
  })

  it('описание человека - отдельной строкой, пустое не добавляет ничего', () => {
    const described = { ...connector, description: '  Client mail: invoices only  ' }

    expect(instructionsFor(described, live, null)).toMatch(
      /\nThe user describes this connector: Client mail: invoices only$/,
    )
    expect(instructionsFor(connector, live, null)).not.toContain('describes')
  })
})
