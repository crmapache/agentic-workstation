import { it, vi, expect, describe, beforeEach } from 'vitest'

import type { WorkspaceState } from '@shared/workspace'
import { QueryClient } from '@tanstack/react-query'

import { useLayoutStore } from './layout.store'
import { QUERY_KEYS } from './query-keys'
import { followActiveProject } from './workspace.queries'

vi.mock('../lib/ipc', () => ({ invoke: vi.fn() }))

const workspace = (activeProjectId: string): WorkspaceState => ({
  projects: [
    { id: 'a', name: 'a', rootPath: '/a' },
    { id: 'b', name: 'b', rootPath: '/b' },
  ],
  activeProjectId,
  recentProjects: [],
})

beforeEach(() =>
  useLayoutStore.setState({
    main: { activeViewId: 'tracker', isOpen: true },
    projectId: 'a',
    viewsByProject: {},
  }),
)

describe('followActiveProject', () => {
  it('меняет раскладку сразу, как в кэш лёг другой активный проект', () => {
    const client = new QueryClient()
    const stop = followActiveProject(client)

    client.setQueryData(QUERY_KEYS.workspace, workspace('b'))
    // Без ожидания: код после перехода показывает вид уже в раскладке нового проекта.
    expect(useLayoutStore.getState().projectId).toBe('b')
    expect(useLayoutStore.getState().main.activeViewId).toBe('file')

    useLayoutStore.getState().showMainView('inbox')
    client.setQueryData(QUERY_KEYS.workspace, workspace('a'))
    expect(useLayoutStore.getState().main.activeViewId).toBe('tracker')

    stop()
    client.setQueryData(QUERY_KEYS.workspace, workspace('b'))
    expect(useLayoutStore.getState().projectId).toBe('a')
  })

  it('проект уже в кэше к подписке - раскладка его сразу', () => {
    const client = new QueryClient()

    client.setQueryData(QUERY_KEYS.workspace, workspace('b'))
    followActiveProject(client)()

    expect(useLayoutStore.getState().projectId).toBe('b')
  })

  it('закрытый проект уносит свои виды', () => {
    const client = new QueryClient()
    const stop = followActiveProject(client)

    client.setQueryData(QUERY_KEYS.workspace, workspace('b'))
    expect(Object.keys(useLayoutStore.getState().viewsByProject)).toEqual(['a'])

    client.setQueryData(QUERY_KEYS.workspace, {
      ...workspace('b'),
      projects: workspace('b').projects.filter((project) => project.id !== 'a'),
    })
    stop()

    expect(useLayoutStore.getState().viewsByProject).toEqual({})
  })

  it('чужие ключи кэша раскладку не трогают', () => {
    const client = new QueryClient()
    const stop = followActiveProject(client)

    client.setQueryData(['other'], workspace('b'))
    stop()

    expect(useLayoutStore.getState().projectId).toBe('a')
  })
})
