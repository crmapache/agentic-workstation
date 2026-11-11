import { createHash } from 'node:crypto'
import { basename } from 'node:path'

import type { WorkspaceState } from '@shared/workspace'

import { PROJECT_KEY_PREFIX } from '@agentic-workstation/remote-protocol/project-key'

/**
 * Имя проекта на проводе - хеш пути, а не путь: где проект лежит на диске, наружу не уходит
 * даже внутри запечатанного тела. Ключ один, открыт проект или нет: открыт ли он, телефон
 * узнаёт из поля `open` инвентаря, и адрес экрана на телефоне переживает открытие и закрытие.
 */
export const projectKey = (rootPath: string): string =>
  `${PROJECT_KEY_PREFIX}${createHash('sha256').update(rootPath, 'utf8').digest('base64url').slice(0, 22)}`

/** Проекты, которые IDE сама назвала телефону: ключ туда и обратно, путь - только здесь. */
export class ProjectKeys {
  private readonly paths = new Map<string, string>()
  private readonly open = new Set<string>()
  private readonly names = new Map<string, string>()

  constructor(workspace: WorkspaceState, extraPaths: readonly string[] = []) {
    for (const project of workspace.projects) this.open.add(project.rootPath)
    for (const recent of workspace.recentProjects) this.names.set(recent.rootPath, recent.name)
    for (const project of workspace.projects) this.names.set(project.rootPath, project.name)

    const known = [
      ...workspace.projects.map((project) => project.rootPath),
      ...workspace.recentProjects.map((recent) => recent.rootPath),
      ...extraPaths,
    ]

    for (const path of known) this.paths.set(projectKey(path), path)
  }

  keyOf(rootPath: string): string {
    return projectKey(rootPath)
  }

  /** Путь по ключу - только из тех, что IDE предложила сама (открытые, недавние, с очередями). */
  pathOf(key: string): string | null {
    return this.paths.get(key) ?? null
  }

  /** Путь открытого проекта: разговоры и запуск сценариев - только в открытых. */
  openPathOf(key: string): string | null {
    const path = this.pathOf(key)

    return path && this.open.has(path) ? path : null
  }

  isOpen(rootPath: string): boolean {
    return this.open.has(rootPath)
  }

  /**
   * Имя проекта - как его зовёт IDE (вкладка, недавние); проект, которого нет ни там, ни там
   * (его очередь пережила и закрытие, и уход из недавних), - имя его папки, как на доске окна.
   */
  nameOf(rootPath: string): string {
    return this.names.get(rootPath) ?? basename(rootPath)
  }
}
