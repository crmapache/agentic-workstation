import { it, expect, describe } from 'vitest'

import { askArgs } from './structured-ask'

describe('askArgs', () => {
  const args = askArgs({ schema: { type: 'object' }, tools: ['WebFetch', 'WebSearch'] })

  it('инструменты - белым списком, и только они разрешены без вопроса', () => {
    expect(args.slice(args.indexOf('--tools') + 1, args.indexOf('--allowedTools'))).toEqual([
      'WebFetch',
      'WebSearch',
    ])
    expect(args).not.toContain('--disallowedTools')
    expect(args.slice(args.indexOf('--allowedTools') + 1)).toEqual(['WebFetch', 'WebSearch'])
  })

  it('без настроек, хуков, CLAUDE.md и MCP человека; остальное - отказ без вопроса', () => {
    expect(args).toEqual(
      expect.arrayContaining(['--safe-mode', '--restricted', '--strict-mcp-config']),
    )
    expect(args[args.indexOf('--permission-mode') + 1]).toBe('dontAsk')
  })

  it('ответ - по схеме, одним JSON', () => {
    expect(args.slice(0, 5)).toEqual([
      '-p',
      '--output-format',
      'json',
      '--json-schema',
      '{"type":"object"}',
    ])
  })

  it('проверка поручения: конфиг шлюза и только названные инструменты из него, своё усилие', () => {
    const look = askArgs({
      schema: { type: 'object' },
      tools: ['WebFetch'],
      model: 'haiku',
      effort: 'low',
      mcpConfig: '/tmp/gateway.json',
      mcpTools: ['mcp__gmail-work__search_threads'],
    })

    expect(look[look.indexOf('--mcp-config') + 1]).toBe('/tmp/gateway.json')
    expect(look.slice(look.indexOf('--allowedTools') + 1, look.indexOf('--model'))).toEqual([
      'WebFetch',
      'mcp__gmail-work__search_threads',
    ])
    expect(look[look.indexOf('--effort') + 1]).toBe('low')
    // --safe-mode погасил бы и сервер шлюза: изоляция - без слоёв настроек и навыков.
    expect(look).not.toContain('--safe-mode')
    expect(look[look.indexOf('--setting-sources') + 1]).toBe('')
    expect(look).toContain('--disable-slash-commands')
    expect(askArgs({ schema: {}, tools: [], mcpTools: ['mcp__x__y'] })).not.toContain(
      '--allowedTools',
    )
  })
})
