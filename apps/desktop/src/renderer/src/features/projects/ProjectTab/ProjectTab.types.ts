import type { MouseEvent } from 'react'

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
  /** Вкладку несут рукой: поднята над соседями и едет за курсором без задержки. */
  lifted: boolean
  /** Сдвиг от своего места на время перетаскивания, в пикселях; null - на месте. */
  offset: number | null
  /** Узел вкладки для жеста: где она стоит и откуда доедет после перестановки. */
  register: (projectId: string, node: HTMLDivElement | null) => void
  onPress: (event: MouseEvent<HTMLDivElement>, projectId: string) => void
  onActivate: (projectId: string) => void
  onClose: (projectId: string) => void
}

export type CallDotsProps = { calls: readonly ProjectCall[] }
