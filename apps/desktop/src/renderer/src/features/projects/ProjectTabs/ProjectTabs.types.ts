import type { Project } from '@shared/workspace'

import type { ProjectCall } from '../ProjectTab/ProjectTab.types'

export type ProjectTabsProps = {
  /** Позвавшие разговоры проекта по его пути - от workbench, который знает провайдеров. */
  callsOf?: ((rootPath: string) => readonly ProjectCall[]) | undefined
}

export type HomeTabProps = {
  project: Project
  isActive: boolean
  /** Позвавшие разговоры дома, от старого к новому; свет вкладки - по последнему. */
  calls: readonly ProjectCall[]
  onActivate: (projectId: string) => void
}

/** Где вкладка стояла в начале жеста: левый край в координатах ряда и ширина. */
export type TabSlot = { id: string; left: number; width: number }

/**
 * Картина жеста для отрисовки: какую вкладку несут, её сдвиг под рукой и сдвиги соседей,
 * которые уступили ей место. Действует только для порядка, в котором жест начался
 * (signature): пришёл новый порядок - картина уже не про него.
 */
export type TabDragView = {
  signature: string
  draggedId: string | null
  offset: number
  shifts: Readonly<Record<string, number>>
}

/** Перестановка: проект встаёт перед beforeId; ответ - id проектов после неё, null - не вышло. */
export type MoveProject = (
  projectId: string,
  beforeId: string | null,
) => Promise<readonly string[] | null>
