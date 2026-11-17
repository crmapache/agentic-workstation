import { it, expect, describe } from 'vitest'

import { fitExpansion, groupChanges } from './ChangesView.utils'

describe('groupChanges', () => {
  it('известные git - первой группой, новые файлы - второй, пустых групп нет', () => {
    const files = [
      { path: 'a.ts', kind: 'modified', origin: null },
      { path: 'new.ts', kind: 'untracked', origin: null },
      { path: 'b.ts', kind: 'renamed', origin: 'old.ts' },
    ] as const

    expect(groupChanges(files)).toEqual([
      { id: 'tracked', files: [files[0], files[2]] },
      { id: 'untracked', files: [files[1]] },
    ])
    expect(groupChanges([files[1]]).map((group) => group.id)).toEqual(['untracked'])
  })
})

describe('fitExpansion', () => {
  const groups = [
    { id: 'tracked', rowsHeight: 300 },
    { id: 'untracked', rowsHeight: 200 },
  ] as const

  it('обе помещаются - обе раскрыты', () => {
    expect(fitExpansion(500, groups, {})).toEqual({ tracked: true, untracked: true })
  })

  it('обе не помещаются, но первая - да: она раскрыта, вторая свёрнута', () => {
    expect(fitExpansion(400, groups, {})).toEqual({ tracked: true, untracked: false })
  })

  it('большая не влезла - меньшая после неё ещё встаёт', () => {
    expect(fitExpansion(250, groups, {})).toEqual({ tracked: false, untracked: true })
  })

  it('ни одна не помещается - обе свёрнуты', () => {
    expect(fitExpansion(100, groups, {})).toEqual({ tracked: false, untracked: false })
    expect(fitExpansion(-20, groups, {})).toEqual({ tracked: false, untracked: false })
  })

  it('решённую не трогает, новой оставляет место за вычетом раскрытой', () => {
    expect(fitExpansion(450, groups, { tracked: true })).toEqual({
      tracked: true,
      untracked: false,
    })
    expect(
      fitExpansion(250, [groups[0], { id: 'untracked', rowsHeight: 0 }], {
        tracked: false,
        untracked: false,
      }),
    ).toEqual({ tracked: false, untracked: false })
    expect(
      fitExpansion(250, [{ id: 'tracked', rowsHeight: 0 }, groups[1]], { tracked: false }),
    ).toEqual({
      tracked: false,
      untracked: true,
    })
  })

  it('группы, которой больше нет в списке, нет и в ответе', () => {
    expect(fitExpansion(500, [groups[1]], { tracked: false })).toEqual({ untracked: true })
  })
})
