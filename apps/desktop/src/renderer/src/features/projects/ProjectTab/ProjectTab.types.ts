import type { Project } from '@shared/workspace'

import type { ClosableTabCall } from '@agentic-workstation/ui/ClosableTab.types'

/**
 * Разговор проекта, который позвал человека и ещё не открыт: цвет повода (тот же, что у
 * света его вкладки), когда позвал (мс, фаза маячка) и что сказать словами - чат и повод.
 * Кто зовёт, проекты не знают: список собирает workbench.
 */
export type ProjectCall = { id: string; tone: ClosableTabCall; at: number; text: string }

export type ProjectTabProps = {
  project: Project
  isActive: boolean
  /** Позвавшие разговоры проекта, от старого к новому; пусто - точек нет. */
  calls: readonly ProjectCall[]
  onActivate: (projectId: string) => void
  onClose: (projectId: string) => void
}

export type CallDotsProps = { calls: readonly ProjectCall[] }
