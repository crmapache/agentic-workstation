import '@xterm/xterm/css/xterm.css'
import '../xterm.css'

import { useXterm } from './TerminalView.hooks'
import styles from './TerminalView.module.scss'
import type { TerminalViewProps } from './TerminalView.types'

/**
 * Окно одной оболочки: xterm.js на листе терминала. Невыбранные вкладки смонтированы и
 * спрятаны - их вывод продолжает рисоваться, прокрутка на месте.
 */
export const TerminalView = ({ sessionId, isActive }: TerminalViewProps) => {
  const hostRef = useXterm(sessionId, isActive)

  return (
    <div className={styles.terminalView} hidden={!isActive}>
      <div ref={hostRef} className={styles.host} />
    </div>
  )
}
