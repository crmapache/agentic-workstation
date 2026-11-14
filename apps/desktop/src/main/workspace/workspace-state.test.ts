import { it, expect, describe } from 'vitest'

import type { WorkspaceState } from '@shared/workspace'

import {
  addProject,
  moveProject,
  closeProject,
  activateProject,
  EMPTY_WORKSPACE,
  withHomeProject,
  parseStoredWorkspace,
} from './workspace-state'

const ids = (...values: string[]) => {
  const queue = [...values]

  return () => queue.shift() ?? 'unexpected'
}

const threeProjects: WorkspaceState = {
  projects: [
    { id: 'a', name: 'a', rootPath: '/p/a' },
    { id: 'b', name: 'b', rootPath: '/p/b' },
    { id: 'c', name: 'c', rootPath: '/p/c' },
  ],
  activeProjectId: 'b',
  recentProjects: [],
}

describe('addProject', () => {
  it('добавляет проект в конец, делает активным и берёт имя из пути', () => {
    const state = addProject(EMPTY_WORKSPACE, '/Users/max/Projects/agentic-workstation', ids('x'))

    expect(state).toEqual({
      projects: [
        {
          id: 'x',
          name: 'agentic-workstation',
          rootPath: '/Users/max/Projects/agentic-workstation',
        },
      ],
      activeProjectId: 'x',
      recentProjects: [],
    })
  })

  it('уже открытую папку не дублирует, а активирует', () => {
    const state = addProject(threeProjects, '/p/c', ids('new'))

    expect(state.projects).toHaveLength(3)
    expect(state.activeProjectId).toBe('c')
  })
})

describe('closeProject', () => {
  it('закрыли активный - активным становится сосед справа', () => {
    expect(closeProject(threeProjects, 'b').activeProjectId).toBe('c')
  })

  it('закрыли активный последний - активным становится сосед слева', () => {
    const state = closeProject({ ...threeProjects, activeProjectId: 'c' }, 'c')

    expect(state.activeProjectId).toBe('b')
  })

  it('закрыли единственный - активного нет, он в недавних', () => {
    const single = addProject(EMPTY_WORKSPACE, '/p/a', ids('a'))

    expect(closeProject(single, 'a')).toEqual({
      projects: [],
      activeProjectId: null,
      recentProjects: [{ name: 'a', rootPath: '/p/a' }],
    })
  })

  it('закрыли неактивный - активный не меняется', () => {
    const state = closeProject(threeProjects, 'a')

    expect(state.activeProjectId).toBe('b')
    expect(state.projects.map((project) => project.id)).toEqual(['b', 'c'])
  })

  it('неизвестный id - состояние то же самое', () => {
    expect(closeProject(threeProjects, 'zzz')).toBe(threeProjects)
  })
})

describe('недавние проекты', () => {
  it('закрытый встаёт первым, без повторов', () => {
    const afterA = closeProject(threeProjects, 'a')
    const afterC = closeProject(afterA, 'c')

    expect(afterC.recentProjects.map((project) => project.rootPath)).toEqual(['/p/c', '/p/a'])
  })

  it('открытый недавний уходит из недавних во вкладки', () => {
    const withRecent = closeProject(threeProjects, 'a')
    const reopened = addProject(withRecent, '/p/a', ids('a2'))

    expect(reopened.recentProjects).toEqual([])
    expect(reopened.projects.map((project) => project.rootPath)).toContain('/p/a')
  })

  it('список недавних ограничен', () => {
    let state: WorkspaceState = EMPTY_WORKSPACE

    for (let index = 0; index < 30; index++) {
      state = addProject(state, `/p/${index}`, ids(`id${index}`))
      state = closeProject(state, `id${index}`)
    }

    expect(state.recentProjects).toHaveLength(20)
    expect(state.recentProjects[0]?.rootPath).toBe('/p/29')
  })
})

describe('activateProject', () => {
  it('неизвестный id не делает активным несуществующий проект', () => {
    expect(activateProject(threeProjects, 'zzz')).toBe(threeProjects)
  })
})

describe('parseStoredWorkspace', () => {
  it('мусор вместо файла - пустое состояние', () => {
    expect(parseStoredWorkspace(null)).toEqual(EMPTY_WORKSPACE)
    expect(parseStoredWorkspace('text')).toEqual(EMPTY_WORKSPACE)
  })

  it('отбрасывает записи, не похожие на проект, и чинит активный', () => {
    const state = parseStoredWorkspace({
      projects: [{ id: 'a', name: 'a', rootPath: '/p/a' }, { id: 1 }, 'x'],
      activeProjectId: 'gone',
    })

    expect(state).toEqual({
      projects: [{ id: 'a', name: 'a', rootPath: '/p/a' }],
      activeProjectId: 'a',
      recentProjects: [],
    })
  })

  it('недавние: без мусора и без открытых', () => {
    const state = parseStoredWorkspace({
      projects: [{ id: 'a', name: 'a', rootPath: '/p/a' }],
      recentProjects: [
        { name: 'a', rootPath: '/p/a' },
        { name: 'b', rootPath: '/p/b', extra: true },
        { name: 1 },
      ],
    })

    expect(state.recentProjects).toEqual([{ name: 'b', rootPath: '/p/b' }])
  })
})

describe('moveProject', () => {
  const order = (state: WorkspaceState) => state.projects.map((project) => project.id).join('')

  it('ставит вкладку перед другой - влево и вправо', () => {
    expect(order(moveProject(threeProjects, 'c', 'a'))).toBe('cab')
    expect(order(moveProject(threeProjects, 'a', 'c'))).toBe('bac')
  })

  it('null - в конец ряда', () => {
    expect(order(moveProject(threeProjects, 'a', null))).toBe('bca')
  })

  it('активный проект перестановка не меняет', () => {
    expect(moveProject(threeProjects, 'a', null).activeProjectId).toBe('b')
  })

  it('место не меняется или проект неизвестен - то же состояние, без записи', () => {
    expect(moveProject(threeProjects, 'a', 'b')).toBe(threeProjects)
    expect(moveProject(threeProjects, 'c', null)).toBe(threeProjects)
    expect(moveProject(threeProjects, 'b', 'b')).toBe(threeProjects)
    expect(moveProject(threeProjects, 'x', 'a')).toBe(threeProjects)
    expect(moveProject(threeProjects, 'a', 'x')).toBe(threeProjects)
  })
})

describe('домашний проект', () => {
  const home = { id: 'home', name: 'Home', rootPath: '/h', home: true as const }
  const withHome: WorkspaceState = {
    ...threeProjects,
    projects: [home, ...threeProjects.projects],
  }
  const order = (state: WorkspaceState) => state.projects.map((project) => project.id).join(' ')

  it('встаёт первым и активен, если активного нет', () => {
    const state = withHomeProject(EMPTY_WORKSPACE, '/h')

    expect(state.projects).toEqual([home])
    expect(state.activeProjectId).toBe('home')
  })

  it('старый дом из файла заменяется новым, активный проект остаётся', () => {
    const stored = {
      ...withHome,
      projects: [...threeProjects.projects, { ...home, rootPath: '/old' }],
    }
    const state = withHomeProject(stored, '/h')

    expect(order(state)).toBe('home a b c')
    expect(state.projects[0]?.rootPath).toBe('/h')
    expect(state.activeProjectId).toBe('b')
  })

  it('вкладка той же папки сливается с домом, недавние дом не помнят', () => {
    const state = withHomeProject(
      {
        projects: [{ id: 'x', name: 'h', rootPath: '/h' }, ...threeProjects.projects],
        activeProjectId: 'x',
        recentProjects: [{ name: 'h', rootPath: '/h' }],
      },
      '/h',
    )

    expect(order(state)).toBe('home a b c')
    expect(state.activeProjectId).toBe('home')
    expect(state.recentProjects).toEqual([])
  })

  it('не закрывается', () => {
    expect(closeProject({ ...withHome, activeProjectId: 'home' }, 'home')).toEqual({
      ...withHome,
      activeProjectId: 'home',
    })
  })

  it('закрыли последнюю вкладку проекта - активным становится дом', () => {
    const state = closeProject(
      { ...withHome, projects: [home, threeProjects.projects[0]!], activeProjectId: 'a' },
      'a',
    )

    expect(state.activeProjectId).toBe('home')
    expect(order(state)).toBe('home')
  })

  it('не двигается, и перед ним не встают', () => {
    expect(moveProject(withHome, 'home', null)).toBe(withHome)
    expect(moveProject(withHome, 'c', 'home')).toBe(withHome)
    expect(order(moveProject(withHome, 'c', 'a'))).toBe('home c a b')
  })

  it('открыть папку дома - перейти в дом, без второй вкладки', () => {
    const state = addProject(withHome, '/h', ids('dup'))

    expect(order(state)).toBe('home a b c')
    expect(state.activeProjectId).toBe('home')
  })
})
