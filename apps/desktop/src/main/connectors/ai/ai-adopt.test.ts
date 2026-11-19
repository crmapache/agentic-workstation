import { it, expect, describe } from 'vitest'

import type { AiJob, AiProposal } from '@shared/connector-spec'

import { adoptionOf } from './ai-adopt'

const job = (proposal: AiProposal | null, docsUrl = ''): AiJob => ({
  id: 'j1',
  request: { service: 'Linear', goal: '', docsUrl, provider: 'claude', model: '', effort: '' },
  createdAt: 1,
  status: 'ready',
  activity: null,
  message: '',
  proposal,
  error: null,
  detail: '',
})

describe('adoptionOf', () => {
  it('сервер из Claude Code - перенос по ключу кандидата', () => {
    const candidate = { key: 'user:shotter', serverName: 'shotter' } as never

    expect(adoptionOf(job({ kind: 'existing', candidate }))).toEqual({
      kind: 'import',
      key: 'user:shotter',
      serverName: 'shotter',
    })
  })

  it('MCP со входом в браузере - форма своего MCP с именем сервиса и без ключа', () => {
    expect(
      adoptionOf(job({ kind: 'mcp', url: 'https://mcp.linear.app/mcp', auth: 'oauth' })),
    ).toEqual({
      kind: 'add',
      request: {
        kind: 'mcp',
        url: 'https://mcp.linear.app/mcp',
        auth: 'oauth',
        token: '',
        name: 'Linear',
        multiple: false,
        label: '',
      },
    })
  })

  it('ничего, если нужен ключ, адрес чужой или предложения нет', () => {
    const docs = 'https://linear.app/docs'

    expect(
      adoptionOf(job({ kind: 'mcp', url: 'https://mcp.linear.app', auth: 'token' })),
    ).toBeNull()
    expect(
      adoptionOf(job({ kind: 'mcp', url: 'https://evil.dev/mcp', auth: 'oauth' }, docs)),
    ).toBeNull()
    expect(adoptionOf(job(null))).toBeNull()
  })
})
