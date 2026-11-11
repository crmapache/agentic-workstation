import { createHash } from 'node:crypto'

import type { WorkspaceState } from '@shared/workspace'

import {
  OPEN_PROJECT_PREFIX,
  RECENT_PROJECT_PREFIX,
} from '@agentic-workstation/remote-protocol/project-key'

/**
 * Имя проекта на проводе - хеш пути, а не путь: где проект лежит на диске, наружу не уходит
 * даже внутри запечатанного тела. Открытый и недавний - разными приставками: ключ закрытого
 * после открытия перестаёт что-либо значить, телефон получит новый список.
 */
const keyOf = (prefix: string, rootPath: string): string =>
  `${prefix}${createHash('sha256').update(rootPath, 'utf8').digest('base64url').slice(0, 22)}`

export const openProjectKey = (rootPath: string): string => keyOf(OPEN_PROJECT_PREFIX, rootPath)

export const recentProjectKey = (rootPath: string): string => keyOf(RECENT_PROJECT_PREFIX, rootPath)

/** Проекты, которые IDE сама назвала телефону: ключ туда и обратно, путь - только здесь. */
export class ProjectKeys {
  private readonly paths = new Map<string, string>()
  private readonly open = new Set<string>()

  constructor(workspace: WorkspaceState, extraPaths: readonly string[] = []) {
    for (const project of workspace.projects) {
      this.open.add(project.rootPath)
      this.paths.set(openProjectKey(project.rootPath), project.rootPath)
    }

    const closed = [...workspace.recentProjects.map((recent) => recent.rootPath), ...extraPaths]

    for (const path of closed) {
      if (!this.open.has(path)) this.paths.set(recentProjectKey(path), path)
    }
  }

  /** Ключ проекта по пути: открытый - `p-`, всё прочее (недавний, очередь закрытого) - `r-`. */
  keyOf(rootPath: string): string {
    return this.open.has(rootPath) ? openProjectKey(rootPath) : recentProjectKey(rootPath)
  }

  /** Путь по ключу - только из тех, что IDE предложила сама. */
  pathOf(key: string): string | null {
    return this.paths.get(key) ?? null
  }

  /**
   * Путь по ключу с любой приставкой: подписка на очереди переживает открытие и закрытие
   * проекта - телефон с ключом из прошлого списка подписывается заново на те же очереди.
   */
  pathOfEither(key: string): string | null {
    const other = key.startsWith(OPEN_PROJECT_PREFIX)
      ? `${RECENT_PROJECT_PREFIX}${key.slice(OPEN_PROJECT_PREFIX.length)}`
      : `${OPEN_PROJECT_PREFIX}${key.slice(RECENT_PROJECT_PREFIX.length)}`

    return this.pathOf(key) ?? this.pathOf(other)
  }

  /** Путь открытого проекта: разговоры и запуск сценариев - только в открытых. */
  openPathOf(key: string): string | null {
    const path = this.pathOf(key)

    return path && this.open.has(path) ? path : null
  }

  isOpen(rootPath: string): boolean {
    return this.open.has(rootPath)
  }
}
