import { it, expect, describe } from 'vitest'

import { viewsOf, keptProjects, restoreProjects, switchedProject } from './layout-projects.utils'
import { DEFAULT_PROJECT_VIEWS } from './layout.constants'
import type { ProjectViews, ProjectLayouts } from './layout.types'

/** Проект A: сценарии и Claude Code, дерево свёрнуто. */
const layoutA: ProjectLayouts = {
  side: { activeViewId: 'files', isOpen: false, width: 300 },
  main: { activeViewId: 'scenarios', isOpen: true },
  provider: { activeViewId: 'claude-code', isOpen: true, width: 600 },
  terminal: { isOpen: true, share: 0.4 },
  projectId: 'a',
  viewsByProject: {},
}

/** Проект B: файл и изменения, Claude Code закрыт. */
const viewsB: ProjectViews = {
  side: { activeViewId: 'changes', isOpen: true },
  main: { activeViewId: 'file', isOpen: true },
  provider: { activeViewId: 'codex', isOpen: false },
  terminal: { isOpen: false },
}

describe('switchedProject', () => {
  it('ставит виды нового проекта и откладывает виды прежнего', () => {
    const next = switchedProject({ ...layoutA, viewsByProject: { b: viewsB } }, 'b')

    expect(viewsOf(next)).toEqual(viewsB)
    expect(next.projectId).toBe('b')
    expect(next.viewsByProject).toEqual({ a: viewsOf(layoutA) })
  })

  it('ширины панелей и доля терминала - одни на окно, переход их не трогает', () => {
    const next = switchedProject({ ...layoutA, viewsByProject: { b: viewsB } }, 'b')

    expect(next.side.width).toBe(300)
    expect(next.provider.width).toBe(600)
    expect(next.terminal.share).toBe(0.4)
  })

  it('туда и обратно - вернулся ровно к тому, что было', () => {
    const there = switchedProject({ ...layoutA, viewsByProject: { b: viewsB } }, 'b')
    const back = switchedProject(there, 'a')

    expect(back).toEqual({ ...layoutA, viewsByProject: { b: viewsB } })
  })

  it('проект, где человек ещё не был, - с видами по умолчанию', () => {
    expect(viewsOf(switchedProject(layoutA, 'new'))).toEqual(DEFAULT_PROJECT_VIEWS)
  })

  it('ничью раскладку (от версии без проектов) отдаёт проекту как есть', () => {
    const next = switchedProject({ ...layoutA, projectId: null }, 'a')

    expect(viewsOf(next)).toEqual(viewsOf(layoutA))
    expect(next.projectId).toBe('a')
    expect(next.viewsByProject).toEqual({})
  })

  it('тот же проект - то же состояние', () => {
    expect(switchedProject(layoutA, 'a')).toBe(layoutA)
  })
})

describe('keptProjects', () => {
  it('забывает виды закрытых проектов', () => {
    expect(keptProjects({ a: viewsB, b: viewsB }, ['b', 'c'])).toEqual({ b: viewsB })
  })

  it('никого не закрыли - тот же объект', () => {
    const views = { a: viewsB }

    expect(keptProjects(views, ['a', 'b'])).toBe(views)
  })
})

describe('restoreProjects', () => {
  it('берёт сохранённые виды проектов и чья раскладка', () => {
    expect(restoreProjects({ projectId: 'a', viewsByProject: { b: viewsB } })).toEqual({
      projectId: 'a',
      viewsByProject: { b: viewsB },
    })
  })

  it('раскладка от версии без проектов - ничья и без видов', () => {
    expect(restoreProjects({ side: {}, main: {} })).toEqual({ projectId: null, viewsByProject: {} })
    expect(restoreProjects(undefined)).toEqual({ projectId: null, viewsByProject: {} })
  })

  it('удалённый вид и испорченное поле у проекта - по умолчанию, остальное как было', () => {
    const restored = restoreProjects({
      projectId: 7,
      viewsByProject: {
        b: { ...viewsB, main: { activeViewId: 'search', isOpen: false }, terminal: 'oops' },
        c: 'oops',
      },
    })

    expect(restored.projectId).toBeNull()
    expect(restored.viewsByProject.b).toEqual({
      ...viewsB,
      main: { activeViewId: 'file', isOpen: false },
      terminal: { isOpen: false },
    })
    expect(restored.viewsByProject.c).toEqual(DEFAULT_PROJECT_VIEWS)
  })
})
