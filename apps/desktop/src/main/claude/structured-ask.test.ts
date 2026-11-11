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
})
