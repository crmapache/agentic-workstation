import type { MouseEvent } from 'react'

import type { TrackerProject } from '@shared/tracker'

export type TrackerTabsProps = {
  projects: readonly TrackerProject[]
  activeId: string | null
  onActivate: (id: string) => void
}

export type TrackerTabProps = {
  project: TrackerProject
  active: boolean
  lifted: boolean
  offset: number | null
  register: (id: string, node: HTMLDivElement | null) => void
  onPress: (event: MouseEvent<HTMLDivElement>, id: string) => void
  onActivate: (id: string) => void
  onMenu: (anchor: HTMLElement, id: string) => void
}

export type TabMenuProps = {
  projectId: string
  anchor: HTMLElement
  /** Порядок вкладок: сдвиг на шаг считается по нему. */
  order: readonly string[]
  onClose: () => void
}
