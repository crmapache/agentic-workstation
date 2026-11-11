import type { TerminalSession } from '@shared/terminal'

export type TerminalPanelProps = {
  /** Открыт ли терминал: закрытый остаётся смонтированным, оболочки рисуются дальше. */
  isOpen: boolean
  onHide: () => void
}

export type TerminalTabsProps = {
  sessions: readonly TerminalSession[]
  activeId: string | null
  onPick: (sessionId: string) => void
  onClose: (sessionId: string) => void
  onAdd: () => void
}
