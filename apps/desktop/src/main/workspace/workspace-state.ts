import { basename } from 'node:path'

import type { Project, ProjectRef, WorkspaceState } from '@shared/workspace'

import { HOME_PROJECT_ID, HOME_PROJECT_NAME, RECENT_PROJECTS_LIMIT } from './workspace.constants'

/**
 * Чистые переходы набора проектов. Ни диска, ни окна: на вход старое состояние,
 * на выход новое, - поэтому всё это покрыто тестами без Electron.
 */

export const EMPTY_WORKSPACE: WorkspaceState = {
  projects: [],
  activeProjectId: null,
  recentProjects: [],
}

const withoutRecent = (recent: ProjectRef[], rootPath: string) =>
  recent.filter((project) => project.rootPath !== rootPath)

/**
 * Открыть папку. Уже открытая не дублируется, а становится активной. Если папка была
 * среди недавних, оттуда она уходит.
 */
export const addProject = (
  state: WorkspaceState,
  rootPath: string,
  createId: () => string,
): WorkspaceState => {
  const existing = state.projects.find((project) => project.rootPath === rootPath)

  if (existing) {
    return { ...state, activeProjectId: existing.id }
  }

  const project: Project = { id: createId(), name: basename(rootPath), rootPath }

  return {
    projects: [...state.projects, project],
    activeProjectId: project.id,
    recentProjects: withoutRecent(state.recentProjects, rootPath),
  }
}

/**
 * Закрыть проект. Если закрыли активный, активным становится сосед справа, а у
 * последней вкладки - сосед слева: так ведут себя вкладки в браузере. Закрытый
 * проект встаёт первым в недавние. Дом не закрывается.
 */
export const closeProject = (state: WorkspaceState, projectId: string): WorkspaceState => {
  const index = state.projects.findIndex((project) => project.id === projectId)
  const closed = state.projects[index]

  if (!closed || closed.home) return state

  const projects = state.projects.filter((project) => project.id !== projectId)
  const recentProjects = [
    { name: closed.name, rootPath: closed.rootPath },
    ...withoutRecent(state.recentProjects, closed.rootPath),
  ].slice(0, RECENT_PROJECTS_LIMIT)

  if (state.activeProjectId !== projectId) {
    return { ...state, projects, recentProjects }
  }

  const neighbour = projects[index] ?? projects[index - 1] ?? null

  return { projects, activeProjectId: neighbour?.id ?? null, recentProjects }
}

export const activateProject = (state: WorkspaceState, projectId: string): WorkspaceState => {
  if (!state.projects.some((project) => project.id === projectId)) return state

  return { ...state, activeProjectId: projectId }
}

/**
 * Переставить вкладку проекта перед beforeId, null - в конец. Неизвестный проект, место
 * перед самим собой или уже стоящая там вкладка - состояние то же самое (без записи на диск).
 * Дом стоит первым: его не двигают, и перед ним не встают. Активный проект не меняется:
 * перестановка - не переход в проект.
 */
export const moveProject = (
  state: WorkspaceState,
  projectId: string,
  beforeId: string | null,
): WorkspaceState => {
  const moved = state.projects.find((project) => project.id === projectId)
  const rest = state.projects.filter((project) => project.id !== projectId)
  const at = beforeId === null ? rest.length : rest.findIndex((project) => project.id === beforeId)

  if (!moved || moved.home || beforeId === projectId || at < 0 || rest[at]?.home) return state

  const projects = [...rest.slice(0, at), moved, ...rest.slice(at)]
  const isSame = projects.every((project, index) => project === state.projects[index])

  return isSame ? state : { ...state, projects }
}

/**
 * Дом первой вкладкой (ADR 0059). Вкладка той же папки, открытая руками до появления дома,
 * сливается с ним, недавние дом не помнят. Активный проект, которого больше нет, - дом.
 */
export const withHomeProject = (state: WorkspaceState, homePath: string): WorkspaceState => {
  const home: Project = {
    id: HOME_PROJECT_ID,
    name: HOME_PROJECT_NAME,
    rootPath: homePath,
    home: true,
  }
  const projects = [
    home,
    ...state.projects.filter(
      (project) => !project.home && project.id !== HOME_PROJECT_ID && project.rootPath !== homePath,
    ),
  ]
  const isActiveKnown = projects.some((project) => project.id === state.activeProjectId)

  return {
    projects,
    activeProjectId: isActiveKnown ? state.activeProjectId : home.id,
    recentProjects: withoutRecent(state.recentProjects, homePath),
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isProjectRef = (value: unknown): value is ProjectRef =>
  isRecord(value) && typeof value['name'] === 'string' && typeof value['rootPath'] === 'string'

const isProject = (value: unknown): value is Project =>
  isProjectRef(value) && typeof (value as Record<string, unknown>)['id'] === 'string'

/**
 * Состояние из файла. Файл правят и руками, поэтому всё, что не похоже на проект,
 * отбрасывается, активный проект без вкладки сбрасывается на первый, а недавние не
 * повторяют открытые.
 */
export const parseStoredWorkspace = (raw: unknown): WorkspaceState => {
  if (!isRecord(raw)) return EMPTY_WORKSPACE

  const projects = Array.isArray(raw['projects']) ? raw['projects'].filter(isProject) : []
  const openPaths = new Set(projects.map((project) => project.rootPath))
  const recentProjects = Array.isArray(raw['recentProjects'])
    ? raw['recentProjects']
        .filter(isProjectRef)
        .map(({ name, rootPath }) => ({ name, rootPath }))
        .filter((project) => !openPaths.has(project.rootPath))
        .slice(0, RECENT_PROJECTS_LIMIT)
    : []
  const activeProjectId = raw['activeProjectId']
  const isActiveKnown = projects.some((project) => project.id === activeProjectId)

  return {
    projects,
    activeProjectId: isActiveKnown ? (activeProjectId as string) : (projects[0]?.id ?? null),
    recentProjects,
  }
}
