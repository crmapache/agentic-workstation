import { it, expect, describe } from 'vitest'

import {
  withMode,
  EVERYWHERE,
  moveProject,
  withProject,
  forgetProject,
  isAvailableIn,
} from './connector-availability'
import type { SelectedProjects } from './connector-availability'

describe('доступность коннектора по проектам', () => {
  it('«во всех» - в любом проекте, и в новом тоже', () => {
    expect(isAvailableIn(EVERYWHERE, '/p/a')).toBe(true)
    expect(isAvailableIn(EVERYWHERE, '/p/new')).toBe(true)
  })

  it('«только» - перечисленные, без повторов', () => {
    const only: SelectedProjects = { mode: 'only', projects: ['/p/a'] }

    expect(isAvailableIn(only, '/p/b')).toBe(false)
    expect(withProject(only, '/p/a', true)).toEqual({ mode: 'only', projects: ['/p/a'] })
    expect(withProject(only, '/p/b', true)).toEqual({ mode: 'only', projects: ['/p/a', '/p/b'] })
    expect(withProject(only, '/p/a', false)).toEqual({ mode: 'only', projects: [] })
  })

  it('забытый проект уходит из списка, «во всех» не меняется', () => {
    expect(forgetProject({ mode: 'only', projects: ['/p/a', '/p/b'] }, '/p/a')).toEqual({
      mode: 'only',
      projects: ['/p/b'],
    })
    expect(forgetProject(EVERYWHERE, '/p/a')).toEqual(EVERYWHERE)
  })

  it('перенос на новый путь: запись идёт за папкой, без повторов', () => {
    expect(moveProject({ mode: 'only', projects: ['/p/old', '/p/b'] }, '/p/old', '/p/new')).toEqual(
      { mode: 'only', projects: ['/p/new', '/p/b'] },
    )
    expect(
      moveProject({ mode: 'only', projects: ['/p/old', '/p/new'] }, '/p/old', '/p/new'),
    ).toEqual({ mode: 'only', projects: ['/p/new'] })
    expect(moveProject(EVERYWHERE, '/p/old', '/p/new')).toEqual(EVERYWHERE)
  })

  it('«только» в первый раз - ни одного, потом - отмеченные в прошлый раз', () => {
    const picked = { mode: 'only' as const, projects: ['/p/a', '/p/c'] }
    const everywhere = withMode(picked, 'all')

    expect(withMode(EVERYWHERE, 'only')).toEqual({ mode: 'only', projects: [] })
    expect(everywhere).toEqual({ mode: 'all', remembered: ['/p/a', '/p/c'] })
    expect(isAvailableIn(everywhere, '/p/b')).toBe(true)
    expect(withMode(everywhere, 'only')).toEqual(picked)
    expect(withMode({ mode: 'only', projects: [] }, 'all')).toEqual(EVERYWHERE)
  })
})
