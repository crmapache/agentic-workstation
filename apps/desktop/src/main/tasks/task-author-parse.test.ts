import { it, expect, describe } from 'vitest'

import { authoredTask } from './task-author-parse'

/** Вторник, 17 ноября 2026, 16:30 местного времени. */
const NOW = new Date(2026, 10, 17, 16, 30)

const answer = (patch: Record<string, unknown> = {}) => ({
  kind: 'schedule',
  name: 'Inbox digest',
  prompt: 'Read the inbox and list what needs an answer.',
  repeat: 'weekly',
  time: '09:15',
  days: [1, 3, 5],
  monthDay: 1,
  date: '',
  catchUp: true,
  report: true,
  lifeDays: 7,
  budgetUsd: 5,
  outbound: 'confirm',
  ...patch,
})

describe('authoredTask', () => {
  it('переводит ответ в задание формы: время - в минуты, дни как есть', () => {
    expect(authoredTask(answer(), NOW)).toEqual({
      kind: 'schedule',
      name: 'Inbox digest',
      prompt: 'Read the inbox and list what needs an answer.',
      schedule: { repeat: 'weekly', at: 9 * 60 + 15, days: [1, 3, 5], monthDay: 1, date: '' },
      catchUp: true,
      report: true,
      goal: { outbound: 'confirm', budgetUsd: 5, lifeDays: 7 },
    })
  })

  it('без имени или текста задания нет', () => {
    expect(authoredTask(answer({ name: '  ' }), NOW)).toBeNull()
    expect(authoredTask(answer({ prompt: '' }), NOW)).toBeNull()
    expect(authoredTask('not an object', NOW)).toBeNull()
  })

  it('битое время - девять утра, неделя без дней - будни, чужой ритм - вручную', () => {
    const task = authoredTask(answer({ time: '25:99', days: [], repeat: 'yearly' }), NOW)

    expect(task?.schedule).toMatchObject({ repeat: 'manual', at: 9 * 60, days: [1, 2, 3, 4, 5] })
  })

  it('разовый без дня - сегодня, если час впереди, иначе завтра', () => {
    expect(authoredTask(answer({ repeat: 'once', time: '18:00' }), NOW)?.schedule.date).toBe(
      '2026-11-17',
    )
    expect(authoredTask(answer({ repeat: 'once', time: '08:00' }), NOW)?.schedule.date).toBe(
      '2026-11-18',
    )
    expect(
      authoredTask(answer({ repeat: 'once', time: '10:00', date: '2026-12-01' }), NOW)?.schedule
        .date,
    ).toBe('2026-12-01')
  })

  it('поручение идёт без расписания', () => {
    expect(authoredTask(answer({ kind: 'goal', repeat: 'daily' }), NOW)?.schedule.repeat).toBe(
      'manual',
    )
  })

  it('отправку людям без кнопки человека модель выбрать не может', () => {
    expect(authoredTask(answer({ outbound: 'free' }), NOW)?.goal.outbound).toBe('confirm')
    expect(authoredTask(answer({ outbound: 'drafts' }), NOW)?.goal.outbound).toBe('drafts')
  })
})
