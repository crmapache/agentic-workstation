import { it, expect, describe } from 'vitest'

import type { TrackerCard, TrackerProject } from '@shared/tracker'

import { dueTone, dueDayOf, dueLabel, findNode } from './tracker.utils'

const card = (id: string): TrackerCard => ({
  id,
  title: `T ${id}`,
  subtitle: '',
  description: '',
  due: null,
  priority: 4,
  done: false,
  doneAt: null,
  scenario: null,
  run: null,
})

const PROJECT: TrackerProject = {
  id: 'p',
  title: 'P',
  description: '',
  flows: [
    {
      id: 'f',
      title: 'F',
      subtitle: '',
      groups: [
        {
          id: 'g',
          title: 'G',
          subtitle: '',
          tasks: [{ ...card('a'), followUps: [card('a1')] }],
        },
      ],
    },
  ],
}

const WORDS = { today: 'Today', tomorrow: 'Tomorrow', yesterday: 'Yesterday' }

/** Пятница, 20 ноября 2026, местная полночь - «сегодня» доски. */
const TODAY = new Date(2026, 10, 20).getTime()

describe('узел доски по id', () => {
  it('находит каждый уровень с его родителями', () => {
    expect(findNode([PROJECT], 'p')?.kind).toBe('project')
    expect(findNode([PROJECT], 'f')).toMatchObject({ kind: 'flow', project: { id: 'p' } })
    expect(findNode([PROJECT], 'g')).toMatchObject({ kind: 'group', flow: { id: 'f' } })
    expect(findNode([PROJECT], 'a')).toMatchObject({ kind: 'task', card: { id: 'a' } })
    expect(findNode([PROJECT], 'a1')).toMatchObject({
      kind: 'followUp',
      card: { id: 'a1' },
      task: { id: 'a' },
      group: { id: 'g' },
    })
  })

  it('чужой id - null', () => {
    expect(findNode([PROJECT], 'nope')).toBeNull()
  })
})

describe('срок карточки', () => {
  it('ближние дни словами, неделя - днём, дальше - датой, время - через пробел', () => {
    expect(dueLabel({ date: '2026-11-20', time: '09:30' }, TODAY, WORDS)).toBe('Today 09:30')
    expect(dueLabel({ date: '2026-11-21', time: null }, TODAY, WORDS)).toBe('Tomorrow')
    expect(dueLabel({ date: '2026-11-19', time: null }, TODAY, WORDS)).toBe('Yesterday')
    expect(dueLabel({ date: '2026-11-24', time: null }, TODAY, WORDS)).toBe('Tue')
    expect(dueLabel({ date: '2026-12-01', time: '18:00' }, TODAY, WORDS)).toBe('Tue, Dec 1 18:00')
  })

  it('срок не датой - как записан, без 1970-го и без тона', () => {
    const due = { date: '2026-02-30', time: null }

    expect(dueDayOf(due)).toBeNull()
    expect(dueLabel(due, TODAY, WORDS)).toBe('2026-02-30')
    expect(dueTone(due, TODAY, false)).toBe('neutral')
  })

  it('тон: прошёл - красный, сегодня - оранжевый, сделанное - спокойно', () => {
    expect(dueTone({ date: '2026-11-19', time: null }, TODAY, false)).toBe('danger')
    expect(dueTone({ date: '2026-11-20', time: null }, TODAY, false)).toBe('accent')
    expect(dueTone({ date: '2026-11-21', time: null }, TODAY, false)).toBe('neutral')
    expect(dueTone({ date: '2026-11-19', time: null }, TODAY, true)).toBe('neutral')
  })
})
