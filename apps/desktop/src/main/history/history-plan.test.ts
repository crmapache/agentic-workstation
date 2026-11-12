import { it, expect, describe } from 'vitest'

import type { Observation } from './history-observe'
import { planSync } from './history-plan'
import type { FileRow } from './history-store'

const row = (path: string, key: string): FileRow => ({ path, key, size: 1, mtimeMs: 1 })

const file = (key: string): Observation => ({ kind: 'file', key, size: 2, mtimeMs: 2 })

const plan = (
  known: FileRow[],
  observed: [string, Observation][],
  { baseline = false, causes = {} }: { baseline?: boolean; causes?: Record<string, 'agent'> } = {},
) =>
  planSync({
    known: new Map(known.map((entry) => [entry.path, entry])),
    observed: new Map(observed),
    baseline,
    causeOf: (path) => causes[path] ?? null,
  })

describe('план сверки истории', () => {
  it('изменился текст - событие «извне» с прежней и новой версией', () => {
    const result = plan([row('a.ts', 'k1')], [['a.ts', file('k2')]])

    expect(result.revisions).toEqual([
      { path: 'a.ts', cause: 'outside', origin: null, previous: 'k1', version: 'k2' },
    ])
    expect(result.previous).toEqual(new Set(['k1']))
    expect(result.rows).toEqual([{ path: 'a.ts', key: 'k2', size: 2, mtimeMs: 2 }])
  })

  it('тронут, а текст прежний - только новые сведения с диска, без события', () => {
    const result = plan([row('a.ts', 'k1')], [['a.ts', file('k1')]])

    expect(result.revisions).toEqual([])
    expect(result.rows).toHaveLength(1)
  })

  it('объявленный пишущий даёт причину', () => {
    const result = plan([row('a.ts', 'k1')], [['a.ts', file('k2')]], {
      causes: { 'a.ts': 'agent' },
    })

    expect(result.revisions[0]?.cause).toBe('agent')
  })

  it('пропал и появился с тем же текстом - перенос, а не удаление и новый файл', () => {
    const result = plan(
      [row('src/old.ts', 'k1'), row('src/other.ts', 'k9')],
      [
        ['src/old.ts', { kind: 'missing' }],
        ['lib/new.ts', file('k1')],
        ['src/other.ts', { kind: 'missing' }],
      ],
    )

    expect(result.moves).toEqual([{ from: 'src/old.ts', to: 'lib/new.ts' }])
    expect(result.revisions).toEqual([
      { path: 'lib/new.ts', cause: 'moved', origin: 'src/old.ts', previous: 'k1', version: 'k1' },
      { path: 'src/other.ts', cause: 'deleted', origin: null, previous: 'k9', version: 'k9' },
    ])
    expect(result.drops).toEqual(['src/other.ts'])
  })

  it('из двух одинаковых пропавших пара - тот, что в той же папке', () => {
    const result = plan(
      [row('a/x.ts', 'k'), row('b/x.ts', 'k')],
      [
        ['a/x.ts', { kind: 'missing' }],
        ['b/x.ts', { kind: 'missing' }],
        ['b/y.ts', file('k')],
      ],
    )

    expect(result.moves).toEqual([{ from: 'b/x.ts', to: 'b/y.ts' }])
    expect(result.drops).toEqual(['a/x.ts'])
  })

  it('новый файл - событие; при первой сверке - только запомнить, если не объявлен', () => {
    expect(plan([], [['n.ts', file('k')]]).revisions[0]).toMatchObject({
      cause: 'created',
      previous: null,
      version: 'k',
    })
    expect(plan([], [['n.ts', file('k')]], { baseline: true }).revisions).toEqual([])
    expect(
      plan([], [['n.ts', file('k')]], { baseline: true, causes: { 'n.ts': 'agent' } }).revisions,
    ).toHaveLength(1)
  })

  it('файл стал папкой - удалён; стал слишком большим - просто не храним', () => {
    const result = plan(
      [row('a', 'k1'), row('big.bin', 'k2')],
      [
        ['a', { kind: 'folder' }],
        ['big.bin', { kind: 'untracked' }],
      ],
    )

    expect(result.revisions.map((revision) => revision.cause)).toEqual(['deleted'])
    expect(result.drops).toEqual(['big.bin', 'a'])
  })

  it('не читается - ничего не решаем', () => {
    const result = plan([row('a.ts', 'k1')], [['a.ts', { kind: 'unreadable' }]])

    expect(result).toMatchObject({ revisions: [], drops: [], rows: [] })
  })

  it('перенос папки на 20 тысяч файлов склеивается быстро', () => {
    const count = 20_000
    const known = Array.from({ length: count }, (_, index) => row(`src/f${index}.ts`, `k${index}`))
    const observed: [string, Observation][] = [
      ...known.map(({ path }): [string, Observation] => [path, { kind: 'missing' }]),
      ...known.map(({ key }, index): [string, Observation] => [`lib/f${index}.ts`, file(key)]),
    ]
    const started = performance.now()
    const result = plan(known, observed)

    expect(result.moves).toHaveLength(count)
    expect(performance.now() - started).toBeLessThan(1_000)
  })
})
