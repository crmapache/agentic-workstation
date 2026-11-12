import { it, expect, describe } from 'vitest'

import type { HistoryEntry } from '@shared/local-history'

import type { HistoryRow } from './LocalHistoryView.types'
import {
  causeOf,
  dayName,
  sidesOf,
  historyDays,
  historyRows,
  historyDiffState,
} from './LocalHistoryView.utils'

const entry = (id: number, patch: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id,
  path: 'src/a.ts',
  at: new Date(2026, 10, 11, 14, id).getTime(),
  cause: 'outside',
  origin: null,
  version: `v${id}`,
  previous: `v${id - 1}`,
  ...patch,
})

const row = (patch: Partial<HistoryRow> = {}): HistoryRow => ({
  key: '1',
  path: 'src/a.ts',
  at: 0,
  cause: 'edit',
  origin: null,
  version: 'v1',
  previous: 'v0',
  ...patch,
})

describe('строки локальной истории', () => {
  it('у файла снизу - версия до первого события; у папки её нет', () => {
    const rows = historyRows([entry(2), entry(1)], 'src/a.ts', false)

    expect(rows.map((item) => [item.key, item.cause, item.version])).toEqual([
      ['2', 'outside', 'v2'],
      ['1', 'outside', 'v1'],
      ['earliest', 'earliest', 'v0'],
    ])
    expect(historyRows([entry(1), entry(2, { path: 'src/b.ts' })], 'src', true)).toHaveLength(2)
  })

  it('без известного «до» и после переноса строки «раньше» нет', () => {
    expect(historyRows([entry(1, { previous: null })], 'src/a.ts', false)).toHaveLength(1)
    expect(
      historyRows(
        [entry(1, { cause: 'moved', previous: 'v1', origin: 'a.ts' })],
        'src/a.ts',
        false,
      ),
    ).toHaveLength(1)
  })

  it('по местным дням, новые сверху; сегодня и вчера - словами', () => {
    const late = entry(1, { at: new Date(2026, 10, 11, 23, 0).getTime() })
    const early = entry(2, { at: new Date(2026, 10, 10, 9, 0).getTime() })
    const days = historyDays(historyRows([late, early], 'src', true))
    const now = new Date(2026, 10, 11, 23, 30).getTime()

    expect(days.map((day) => day.rows.length)).toEqual([1, 1])
    expect(days.map((day) => dayName(day.start, now))).toEqual(['today', 'yesterday'])
    expect(dayName(new Date(2026, 10, 1).getTime(), now)).toBeNull()
  })

  it('перенос в той же папке - переименование, агент без «до» - создал', () => {
    expect(causeOf(row({ cause: 'moved', origin: 'src/old.ts' }))).toMatchObject({
      name: 'renamed',
      from: 'old.ts',
    })
    expect(causeOf(row({ cause: 'moved', origin: 'lib/a.ts' }))).toMatchObject({
      name: 'moved',
      path: 'lib/a.ts',
    })
    expect(causeOf(row({ cause: 'agent', previous: null })).name).toBe('agentCreated')
  })
})

describe('стороны разницы истории', () => {
  it('с текущим - версия и файл; изменение - до и после, у удаления справа пусто', () => {
    expect(sidesOf(row(), 'current')).toEqual({ left: 'v1', right: { kind: 'file' } })
    expect(sidesOf(row(), 'change')).toEqual({
      left: 'v0',
      right: { kind: 'version', key: 'v1' },
    })
    expect(sidesOf(row({ cause: 'deleted', version: 'v0' }), 'change').right).toEqual({
      kind: 'version',
      key: null,
    })
  })

  it('готово, когда обе стороны прочитаны; пропавшее и не текст - словами', () => {
    const text = (value: string) => ({ kind: 'text', text: value }) as const
    const loaded = { kind: 'text', readOnly: false, notice: null, bom: false } as const
    const file = { kind: 'file' } as const

    expect(
      historyDiffState({ left: text('a'), right: file, rightContent: undefined, status: loaded }),
    ).toEqual({ kind: 'ready', original: 'a', modified: { kind: 'document' }, readOnly: false })
    expect(
      historyDiffState({
        left: text('a'),
        right: file,
        rightContent: undefined,
        status: { kind: 'missing' },
      }),
    ).toMatchObject({ kind: 'ready', modified: { kind: 'text', text: '' }, readOnly: true })
    expect(
      historyDiffState({ left: undefined, right: file, rightContent: undefined, status: loaded }),
    ).toEqual({ kind: 'loading' })
    expect(
      historyDiffState({
        left: { kind: 'lost' },
        right: file,
        rightContent: undefined,
        status: loaded,
      }),
    ).toEqual({ kind: 'lost' })
    expect(
      historyDiffState({
        left: text('a'),
        right: { kind: 'version', key: 'k' },
        rightContent: { kind: 'binary', size: 3 },
        status: loaded,
      }),
    ).toEqual({ kind: 'binary' })
  })
})
