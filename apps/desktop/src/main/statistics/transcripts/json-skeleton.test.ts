import { it, expect, describe } from 'vitest'

import { readSkeleton } from './json-skeleton'

const wanted = new Set(['type', 'timestamp', 'isSidechain', 'toolUseResult', 'name'])

describe('readSkeleton', () => {
  it('reads top-level strings and booleans and skips nested look-alikes', () => {
    const line = Buffer.from(
      JSON.stringify({
        message: { type: 'nested', content: [{ timestamp: 'inner', text: 'a "quoted" \\ slash' }] },
        type: 'user',
        isSidechain: false,
        count: 12,
        timestamp: '2026-11-10T10:00:00.000Z',
      }),
    )
    const head = readSkeleton(line, wanted)

    expect(head?.get('type')).toBe('user')
    expect(head?.get('timestamp')).toBe('2026-11-10T10:00:00.000Z')
    expect(head?.get('isSidechain')).toBe(false)
  })

  it('returns the place of a nested value', () => {
    const line = Buffer.from('{"type":"user","toolUseResult":{"structuredPatch":[1,2]},"x":null}')
    const range = readSkeleton(line, wanted)?.get('toolUseResult')

    expect(range).toEqual({ start: line.indexOf('{"structuredPatch"'), end: line.indexOf(',"x"') })
    expect(typeof range === 'object' && line.toString('utf8', range.start, range.end)).toBe(
      '{"structuredPatch":[1,2]}',
    )
  })

  it('decodes escapes and unicode in wanted strings', () => {
    const line = Buffer.from(JSON.stringify({ name: 'путь "в" кавычках\\' }))

    expect(readSkeleton(line, wanted)?.get('name')).toBe('путь "в" кавычках\\')
  })

  it('gives up on broken lines', () => {
    expect(readSkeleton(Buffer.from('{"type":"user","message":{"a":'), wanted)).toBeNull()
    expect(readSkeleton(Buffer.from('[1,2]'), wanted)).toBeNull()
    expect(readSkeleton(Buffer.from('{"type":"us'), wanted)).toBeNull()
  })
})
