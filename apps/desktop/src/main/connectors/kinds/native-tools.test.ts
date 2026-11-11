import { it, expect, describe } from 'vitest'

import {
  pathId,
  mapLimit,
  numberArg,
  stringArg,
  ToolOutput,
  NativeSource,
  ArgumentError,
  stringListArg,
} from './native-tools'
import type { NativeCall, NativeTool } from './native-tools'

describe('mapLimit', () => {
  it('не больше limit разом, порядок как у входа', async () => {
    let running = 0
    let peak = 0
    const result = await mapLimit([5, 1, 4, 2, 3], 2, async (value) => {
      running += 1
      peak = Math.max(peak, running)
      await new Promise((resolve) => setTimeout(resolve, value))
      running -= 1

      return value * 10
    })

    expect(result).toEqual([50, 10, 40, 20, 30])
    expect(peak).toBe(2)
  })
})

describe('аргументы', () => {
  it('строка, список и число с пределами', () => {
    expect(stringArg({ a: 'x' }, 'a', true)).toBe('x')
    expect(() => stringArg({}, 'a', true)).toThrow(ArgumentError)
    expect(stringListArg({ a: 'one' }, 'a')).toEqual(['one'])
    expect(numberArg({ a: 500 }, 'a', { min: 1, max: 50, fallback: 10 })).toBe(50)
  })
})

describe('pathId', () => {
  it('экранирует id и не пускает «.» и «..»', () => {
    expect(pathId('a/b', 'id')).toBe('a%2Fb')
    expect(() => pathId('..', 'event_id')).toThrow(ArgumentError)
    expect(() => pathId('.', 'event_id')).toThrow(ArgumentError)
  })
})

describe('NativeSource', () => {
  const calls: NativeCall[] = []
  const tools: NativeTool<null>[] = [
    {
      name: 'who',
      description: '',
      access: 'read',
      inputSchema: { type: 'object' },
      run: (_args, _api, call) => {
        calls.push(call)

        return Promise.resolve({ ok: true })
      },
    },
    {
      name: 'picture',
      description: '',
      access: 'read',
      inputSchema: { type: 'object' },
      run: () =>
        Promise.resolve(
          new ToolOutput({ content: [{ type: 'image', data: 'AA==', mimeType: 'image/png' }] }),
        ),
    },
  ]

  it('передаёт инструменту процесс разговора; без него - null', async () => {
    const source = new NativeSource(tools, null, [])
    const signal = new AbortController().signal

    const launch = { id: 'l1', projectPath: '/p', workDir: '/p', conversationId: 'c1' }

    await source.callTool('who', {}, signal, launch)
    await source.callTool('who', {})

    expect(calls).toEqual([
      { launch, signal },
      { launch: null, signal: undefined },
    ])
  })

  it('ToolOutput уходит как есть, остальное - JSON', async () => {
    const source = new NativeSource(tools, null, [])

    expect(await source.callTool('picture', {})).toEqual({
      content: [{ type: 'image', data: 'AA==', mimeType: 'image/png' }],
    })
    expect(await source.callTool('who', {})).toEqual({
      content: [{ type: 'text', text: JSON.stringify({ ok: true }, null, 2) }],
    })
  })

  it('конец процесса, конец разговора и dispose - в хуки источника', async () => {
    const released: string[] = []
    const ended: string[] = []
    let disposed = false
    const source = new NativeSource(tools, null, [], {
      release: (launch) => released.push(launch.id),
      endConversation: (conversationId) => ended.push(conversationId),
      dispose: () => {
        disposed = true

        return Promise.resolve()
      },
    })

    source.release({ id: 'l1', projectPath: '/p', workDir: '/p', conversationId: 'c1' })
    source.endConversation('c1')
    await source.dispose()

    expect(released).toEqual(['l1'])
    expect(ended).toEqual(['c1'])
    expect(disposed).toBe(true)
  })
})
