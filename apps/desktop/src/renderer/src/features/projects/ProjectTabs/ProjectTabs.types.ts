import type { Project } from '@shared/workspace'

import type { ProjectCall, ProjectWork } from '../ProjectTab/ProjectTab.types'

export type ProjectTabsProps = {
  /** Позвавшие разговоры проекта по его пути - от workbench, который знает провайдеров. */
  callsOf?: ((rootPath: string) => readonly ProjectCall[]) | undefined
  /** Что работает в проекте само, по его пути - тоже от workbench. */
  workOf?: ((rootPath: string) => readonly ProjectWork[]) | undefined
}

export type HomeTabProps = {
  project: Project
  isActive: boolean
  /** Позвавшие разговоры дома, от старого к новому; свет вкладки - по последнему. */
  calls: readonly ProjectCall[]
  /** Что работает в доме само; пусто - на вкладке знак дома, иначе спиннер на его месте. */
  work: readonly ProjectWork[]
  onActivate: (projectId: string) => void
}
