import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { it, expect, describe } from 'vitest'

import { AcpFeedBuilder } from '../acp/feed/acp-feed-builder'
import type { AcpSessionUpdate } from '../acp/protocol/acp-types'
import { mcpOf, antigravityLens } from './antigravity-tools'

type Row = { from: string; message: { method?: string; params?: { update: AcpSessionUpdate } } }

/** Живой поток записи `agy` (до перезапуска пробника) - в ленту с линзой Antigravity. */
const liveFeed = () => {
  const builder = new AcpFeedBuilder(undefined, undefined, antigravityLens(['probe']))
  const lines = readFileSync(
    join(__dirname, '..', 'acp', '__fixtures__', 'agy-session.ndjson'),
    'utf8',
  )

  for (const line of lines.trim().split('\n')) {
    const row = JSON.parse(line) as Row

    if (row.from === 'probe' && (row.message as unknown) === 'restarted') break
    if (row.message.method === 'session/update' && row.message.params) {
      builder.update(row.message.params.update)
    }
  }

  return builder.items.filter((item) => item.kind === 'tool')
}

describe('вызовы Antigravity в ленте', () => {
  it('план, записанный артефактом, - карточка артефакта с описанием', () => {
    const artifact = liveFeed().find((tool) => tool.action.kind === 'artifact')

    expect(artifact?.action).toMatchObject({
      kind: 'artifact',
      summary: 'Implementation plan for adding a subtract function to src/app.js',
      review: true,
    })
    expect(artifact?.action.kind === 'artifact' && artifact.action.path).toMatch(
      /brain\/.+\/subtract_function_plan\.md$/,
    )
  })

  it('коннектор и вопрос - своими видами', () => {
    const tools = liveFeed()

    expect(tools.find((tool) => tool.name === 'mcp_probe_probe_echo')?.action).toMatchObject({
      kind: 'mcp',
      server: 'probe',
      tool: 'probe_echo',
    })
    expect(tools.find((tool) => tool.name === 'ask_question')?.action.kind).toBe('question')
  })

  it('сервер коннектора - длинное имя раньше короткого', () => {
    expect(mcpOf('mcp_gmail-work_search', ['gmail', 'gmail-work'])).toMatchObject({
      server: 'gmail-work',
      tool: 'search',
    })
    expect(mcpOf('read_file', ['gmail'])).toBeNull()
  })
})
