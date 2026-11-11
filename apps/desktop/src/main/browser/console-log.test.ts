import { it, expect, describe } from 'vitest'

import {
  appendConsole,
  CONSOLE_LIMIT,
  formatConsole,
  consoleEntryOf,
  CONSOLE_OUTPUT_MAX,
} from './console-log'
import type { ConsoleEntry } from './console-log'

describe('консоль вкладки', () => {
  it('console.log: строки как есть, остальное - значением или описанием', () => {
    const entry = consoleEntryOf(
      'Runtime.consoleAPICalled',
      {
        type: 'warning',
        args: [
          { type: 'string', value: 'count' },
          { type: 'number', value: 3 },
          { type: 'object', description: 'HTMLButtonElement' },
          { type: 'undefined' },
        ],
      },
      1,
    )

    expect(entry).toEqual({ level: 'warn', text: 'count 3 HTMLButtonElement undefined', at: 1 })
  })

  it('исключение и запись журнала браузера', () => {
    expect(
      consoleEntryOf(
        'Runtime.exceptionThrown',
        { exceptionDetails: { text: 'Uncaught', exception: { description: 'TypeError: x' } } },
        2,
      ),
    ).toEqual({ level: 'error', text: 'TypeError: x', at: 2 })
    expect(
      consoleEntryOf(
        'Log.entryAdded',
        { entry: { level: 'error', text: '404', url: 'https://x/a' } },
        3,
      ),
    ).toEqual({ level: 'error', text: '404 (https://x/a)', at: 3 })
    expect(consoleEntryOf('Page.loadEventFired', {}, 4)).toBeNull()
  })

  it('держит хвост и отдаёт только ошибки по просьбе', () => {
    const entries: ConsoleEntry[] = []

    for (let index = 0; index < CONSOLE_LIMIT + 5; index += 1) {
      appendConsole(entries, { level: index % 2 ? 'error' : 'log', text: String(index), at: index })
    }

    expect(entries).toHaveLength(CONSOLE_LIMIT)
    expect(entries[0]?.text).toBe('5')
    expect(formatConsole(entries, 2, false)).toBe('[error] 203\n[log] 204')
    expect(formatConsole(entries, 2, true)).toBe('[error] 201\n[error] 203')
  })

  it('весь ответ не длиннее предела: старые записи режутся с пометкой', () => {
    const entries: ConsoleEntry[] = Array.from({ length: CONSOLE_LIMIT }, (_, index) => ({
      level: 'log',
      text: `${index} ${'x'.repeat(1990)}`,
      at: index,
    }))
    const text = formatConsole(entries, CONSOLE_LIMIT, false)
    const lines = text.split('\n')

    expect(text.length).toBeLessThanOrEqual(CONSOLE_OUTPUT_MAX + 40)
    expect(lines[0]).toMatch(/^… \d+ earlier messages cut$/)
    expect(lines.at(-1)?.startsWith(`[log] ${CONSOLE_LIMIT - 1} `)).toBe(true)
  })
})
