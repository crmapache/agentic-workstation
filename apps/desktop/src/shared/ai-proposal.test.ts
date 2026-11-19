import { it, expect, describe } from 'vitest'

import { proposalNeed, isForeignHost } from './ai-proposal'
import type { AiProposal, HttpConnectorSpec } from './connector-spec'

const spec = (patch: Partial<HttpConnectorSpec> = {}): HttpConnectorSpec => ({
  service: 'Todoist',
  baseUrl: 'https://api.todoist.com/rest/v2',
  auth: { type: 'bearer' },
  authHelp: '',
  tools: [],
  ...patch,
})

const http = (patch: Partial<HttpConnectorSpec> = {}): AiProposal => ({
  kind: 'http',
  spec: spec(patch),
  dropped: [],
})

const docs = 'https://developer.todoist.com'

describe('isForeignHost', () => {
  it('API на сайте документации - своё, на другом сайте - повод проверить', () => {
    expect(isForeignHost('https://api.todoist.com/rest/v2', 'https://developer.todoist.com')).toBe(
      false,
    )
    expect(isForeignHost('https://api.bbc.co.uk/v1', 'https://docs.bbc.co.uk')).toBe(false)
    expect(isForeignHost('https://evil.dev/api', 'https://developer.todoist.com')).toBe(true)
    expect(isForeignHost('https://evil.dev/api', '')).toBe(false)
  })
})

describe('proposalNeed', () => {
  it('ничего не ждёт от человека у сервера из Claude Code', () => {
    const candidate = { key: 'user:shotter', name: 'shotter' } as never

    expect(proposalNeed({ kind: 'existing', candidate }, docs)).toBeNull()
  })

  it('ждёт ключ у API и MCP с ключом, даже на чужом адресе', () => {
    expect(proposalNeed(http(), docs)).toBe('key')
    expect(proposalNeed(http({ baseUrl: 'https://evil.dev/api' }), docs)).toBe('key')
    expect(proposalNeed({ kind: 'mcp', url: 'https://mcp.todoist.com', auth: 'token' }, docs)).toBe(
      'key',
    )
  })

  it('ждёт взгляда на адрес не с сайта документации', () => {
    expect(proposalNeed(http({ auth: { type: 'none' }, baseUrl: 'https://evil.dev' }), docs)).toBe(
      'host',
    )
    expect(proposalNeed({ kind: 'mcp', url: 'https://evil.dev/mcp', auth: 'oauth' }, docs)).toBe(
      'host',
    )
  })

  it('добавляется само без ключа на адресе с сайта документации', () => {
    expect(proposalNeed(http({ auth: { type: 'none' } }), docs)).toBeNull()
    expect(proposalNeed({ kind: 'mcp', url: 'https://mcp.todoist.com', auth: 'oauth' }, docs)).toBe(
      null,
    )
    expect(proposalNeed({ kind: 'mcp', url: 'https://mcp.linear.app', auth: 'oauth' }, '')).toBe(
      null,
    )
  })
})
