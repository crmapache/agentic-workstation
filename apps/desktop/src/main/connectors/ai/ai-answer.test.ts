import { it, expect, describe } from 'vitest'

import type { ImportCandidate } from '@shared/connectors'

import { readAnswer } from './ai-answer'

const tool = {
  name: 'forecast',
  description: 'Daily forecast',
  access: 'read',
  method: 'GET',
  path: '/forecast',
  query: ['latitude'],
  body: [],
  inputSchema: { type: 'object', properties: { latitude: { type: 'number' } } },
}

const spec = {
  service: 'Weather',
  baseUrl: 'https://api.weather.dev/v1',
  auth: { type: 'none' },
  authHelp: '',
  tools: [tool],
}

const server = (name: string, blocked: ImportCandidate['blocked']): ImportCandidate => ({
  key: `${name}:${String(blocked)}`,
  name,
  serverName: name,
  kind: 'mcp',
  target: 'https://example.com/mcp',
  scope: 'user',
  projectPath: null,
  needsSignIn: false,
  blocked,
  pending: false,
})

describe('readAnswer', () => {
  it('описание HTTP проверяется как при добавлении: негодный инструмент выбрасывается', () => {
    const broken = { ...tool, name: 'Bad Name' }

    expect(
      readAnswer(
        { outcome: 'http', message: 'Done', spec: { ...spec, tools: [tool, broken] } },
        [],
      ),
    ).toEqual({
      kind: 'proposal',
      message: 'Done',
      proposal: { kind: 'http', spec, dropped: ['Bad Name'] },
    })
  })

  it('MCP - только https и без ключа в адресе', () => {
    const answer = (url: string) =>
      readAnswer({ outcome: 'mcp', message: '', mcp: { url, auth: 'oauth' } }, [])

    expect(answer('https://mcp.linear.app/mcp').kind).toBe('proposal')
    expect(answer('http://mcp.linear.app/mcp').kind).toBe('invalid')
    expect(answer('https://mcp.linear.app/mcp?token=abc').kind).toBe('invalid')
  })

  it('сервер Claude Code - по имени без регистра, из одинаковых - тот, что можно взять', () => {
    const free = server('Callmate', null)
    const read = readAnswer({ outcome: 'existing', message: '', existing: 'callmate' }, [
      server('callmate', 'duplicate'),
      free,
    ])

    expect(read).toEqual({
      kind: 'proposal',
      message: '',
      proposal: { kind: 'existing', candidate: free },
    })
    expect(readAnswer({ outcome: 'existing', message: '', existing: 'nope' }, [free]).kind).toBe(
      'invalid',
    )
  })

  it('без предложения - слова ИИ; ответ не по схеме - invalid', () => {
    expect(readAnswer({ outcome: 'none', message: 'Which Callmate?' }, [])).toEqual({
      kind: 'none',
      message: 'Which Callmate?',
    })
    expect(readAnswer({ supported: true }, []).kind).toBe('invalid')
  })
})
