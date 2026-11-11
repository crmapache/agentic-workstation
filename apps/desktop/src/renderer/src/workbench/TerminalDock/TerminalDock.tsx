import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { ResizeHandle } from '@agentic-workstation/ui/ResizeHandle'

import { useLayoutStore } from '../../state/layout.store'
import { terminalHeight } from '../../state/layout.utils'
import { TerminalPanel } from '../../features/terminal/TerminalPanel/TerminalPanel'
import { useColumnRoom } from './TerminalDock.hooks'
import styles from './TerminalDock.module.scss'
import type { TerminalDockProps } from './TerminalDock.types'

/**
 * Место терминала внизу правой колонки, под GUI провайдера (ADR 0037): своя доля высоты,
 * ручка на верхнем краю, не ниже TERMINAL_MIN_HEIGHT. Без панели над ним - во всю колонку.
 * Спрятанный остаётся смонтированным: оболочки рисуются дальше.
 */
export const TerminalDock = ({ isOpen, fills }: TerminalDockProps) => {
  const { t } = useTranslation()
  const share = useLayoutStore((state) => state.terminal.share)
  const resizeTerminal = useLayoutStore((state) => state.resizeTerminal)
  const setTerminalOpen = useLayoutStore((state) => state.setTerminalOpen)
  const { dockRef, room } = useColumnRoom()

  return (
    <div
      ref={dockRef}
      className={clsx(styles.terminalDock, !isOpen && styles.closed, fills && styles.fills)}
      // eslint-disable-next-line no-restricted-syntax -- высоту задают ручка и место в колонке
      style={fills ? undefined : { height: terminalHeight(share, room) }}>
      {!fills && (
        <ResizeHandle
          edge="top"
          inGap
          label={t('terminal.resize')}
          onResize={(delta) => resizeTerminal(delta, room)}
        />
      )}
      <TerminalPanel isOpen={isOpen} onHide={() => setTerminalOpen(false)} />
    </div>
  )
}
