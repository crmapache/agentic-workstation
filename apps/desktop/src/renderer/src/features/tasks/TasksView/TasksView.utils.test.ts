import { it, expect, describe } from 'vitest'

import type { TaskRunSummary } from '@shared/tasks'

import { runsByDay } from './TasksView.utils'

const run = (id: string, day: number, hours: number) =>
  ({ id, startedAt: new Date(2026, 10, day, hours).getTime() }) as TaskRunSummary

describe('прогоны по дням', () => {
  it('день - по местной дате запуска, порядок дней и прогонов внутри дня сохраняется', () => {
    const days = runsByDay([run('a', 20, 23), run('b', 20, 9), run('c', 18, 9), run('d', 17, 0)])

    expect(days.map((day) => day.key)).toEqual(['2026-11-20', '2026-11-18', '2026-11-17'])
    expect(days[0]?.runs.map((one) => one.id)).toEqual(['a', 'b'])
    expect(days[0]?.at).toBe(run('a', 20, 23).startedAt)
  })

  it('прогон не по порядку уходит в свой день, а не открывает второй такой же', () => {
    const days = runsByDay([run('a', 20, 9), run('b', 19, 9), run('c', 20, 8)])

    expect(days.map((day) => day.runs.map((one) => one.id))).toEqual([['a', 'c'], ['b']])
  })

  it('нет прогонов - нет дней', () => {
    expect(runsByDay([])).toEqual([])
  })
})
