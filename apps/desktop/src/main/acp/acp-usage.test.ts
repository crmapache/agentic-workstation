import { it, vi, expect, describe } from 'vitest'

import type { AccountUsage } from '@shared/account-usage'

import type { JsonFile } from '../storage/json-file'
import { AcpUsage, parseUsage } from './acp-usage'

const USAGE: AccountUsage = {
  windows: [{ group: 'session', model: '', percent: 86, resetsAt: 1_000, severity: 'normal' }],
  extra: null,
  fetchedAt: 500,
}

/** Файл в памяти: что лежит и что записали. */
const memoryFile = (stored: unknown) => {
  const written: unknown[] = []
  const file = {
    read: () => Promise.resolve(stored),
    write: (value: unknown) => {
      written.push(value)

      return Promise.resolve()
    },
  } as unknown as JsonFile<AccountUsage | null>

  return { file, written }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('лимиты агента ACP', () => {
  it('цифры с диска - сразу, до первого ответа сервера', async () => {
    const changed = vi.fn()
    const { file } = memoryFile(USAGE)
    const usage = new AcpUsage({ usage: () => Promise.resolve(null) }, file, changed)

    await settle()

    expect(usage.view()).toEqual({ '': USAGE })
    expect(changed).toHaveBeenCalled()
  })

  it('ответ сервера - окну и на диск; второй вопрос в пределах шага не идёт', async () => {
    const ask = vi.fn(() => Promise.resolve(USAGE))
    const { file, written } = memoryFile(null)
    const usage = new AcpUsage({ usage: ask }, file, () => undefined)

    await usage.refresh()
    await usage.refresh()

    expect(ask).toHaveBeenCalledTimes(1)
    expect(usage.view()).toEqual({ '': USAGE })
    expect(written).toEqual([USAGE])
  })

  it('сервер молчит (токен истёк) - прежние цифры остаются', async () => {
    const { file } = memoryFile(USAGE)
    const usage = new AcpUsage({ usage: () => Promise.resolve(null) }, file, () => undefined)

    await settle()
    await usage.refresh()

    expect(usage.view()).toEqual({ '': USAGE })
  })

  it('агент без лимитов файла не читает и колец не даёт', async () => {
    const read = vi.fn(() => Promise.resolve(USAGE))
    const file = { read, write: vi.fn() } as unknown as JsonFile<AccountUsage | null>
    const usage = new AcpUsage({}, file, () => undefined)

    await usage.refresh()

    expect(read).not.toHaveBeenCalled()
    expect(usage.view()).toEqual({})
  })

  it('битое на диске - не цифры', () => {
    expect(parseUsage(USAGE)).toEqual(USAGE)
    expect(parseUsage({ ...USAGE, windows: [{ group: 'session' }] })).toBeNull()
    expect(parseUsage('x')).toBeNull()
  })
})
