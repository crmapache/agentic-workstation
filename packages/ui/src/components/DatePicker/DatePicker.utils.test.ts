import { it, expect, describe } from 'vitest'

import { clampDay, addMonths, movedDayOf, monthGridOf, monthStartOf } from './DatePicker.utils'

const day = (text: string) => new Date(`${text}T00:00:00`).getTime()

describe('monthGridOf', () => {
  it('шесть недель с понедельника недели первого числа', () => {
    const grid = monthGridOf(day('2026-11-01'))

    expect(grid).toHaveLength(6)
    expect(grid.every((week) => week.length === 7)).toBe(true)
    // 1 ноября 2026 - воскресенье: сетка начинается с понедельника 26 октября.
    expect(grid[0]?.[0]).toBe(day('2026-10-26'))
    expect(grid[0]?.[6]).toBe(day('2026-11-01'))
    expect(grid[5]?.[6]).toBe(day('2026-12-06'))
  })

  it('дни - местные полуночи и через перевод часов', () => {
    const grid = monthGridOf(day('2026-10-01'))

    expect(grid.flat().every((ms) => new Date(ms).getHours() === 0)).toBe(true)
  })
})

describe('addMonths и monthStartOf', () => {
  it('короткий месяц не перескакивает в следующий', () => {
    expect(addMonths(day('2026-03-31'), -1)).toBe(day('2026-02-28'))
    expect(addMonths(day('2026-12-15'), 1)).toBe(day('2027-01-15'))
  })

  it('первое число месяца дня', () => {
    expect(monthStartOf(day('2026-11-14'))).toBe(day('2026-11-01'))
  })
})

describe('movedDayOf и clampDay', () => {
  it('стрелки - день и неделя, Home и End - края недели, PageUp - месяц', () => {
    const thursday = day('2026-11-12')

    expect(movedDayOf(thursday, 'ArrowLeft')).toBe(day('2026-11-11'))
    expect(movedDayOf(thursday, 'ArrowDown')).toBe(day('2026-11-19'))
    expect(movedDayOf(thursday, 'Home')).toBe(day('2026-11-09'))
    expect(movedDayOf(thursday, 'End')).toBe(day('2026-11-15'))
    expect(movedDayOf(thursday, 'PageUp')).toBe(day('2026-10-12'))
    expect(movedDayOf(thursday, 'Enter')).toBeNull()
  })

  it('курсор не уходит за края', () => {
    expect(clampDay(day('2026-11-20'), undefined, day('2026-11-14'))).toBe(day('2026-11-14'))
    expect(clampDay(day('2026-10-01'), day('2026-10-05'))).toBe(day('2026-10-05'))
    expect(clampDay(day('2026-10-10'))).toBe(day('2026-10-10'))
  })
})
