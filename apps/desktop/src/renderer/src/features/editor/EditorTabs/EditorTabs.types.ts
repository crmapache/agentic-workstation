import type { TabTarget } from '../../../state/editor-tabs.types'

export type EditorTabsProps = {
  projectId: string
  /** Подпись вкладки истории всего проекта: пути у неё нет. */
  projectName: string
  /** Ключи вкладок в порядке на полосе: путь файла или ключ разницы. */
  keys: readonly string[]
  /** Ключ активной вкладки. */
  active: string
}

export type EditorTabProps = {
  projectId: string
  tabKey: string
  target: TabTarget
  label: string
  isActive: boolean
  onMenu: (key: string, anchor: HTMLElement) => void
}

export type TabMenuProps = {
  projectId: string
  keys: readonly string[]
  /** Вкладка, на которой открыли меню, и куда его поставить; null - меню закрыто. */
  target: { key: string; anchor: HTMLElement } | null
  onClose: () => void
}
