import type { MouseEvent, CSSProperties } from 'react'
import clsx from 'clsx'
import { X } from 'lucide-react'

import { IconButton } from '../IconButton/IconButton'
import { Tooltip } from '../Tooltip/Tooltip'
import { MIDDLE_MOUSE_BUTTON } from './ClosableTab.constants'
import { useMiddleCut } from './ClosableTab.hooks'
import styles from './ClosableTab.module.scss'
import type { ClosableTabProps } from './ClosableTab.types'
import { CallLight } from './parts/CallLight'

/**
 * Вкладка, которую можно закрыть: открытый проект, разговор. Выбранная залита
 * графитом (tinted - тоном вкладок, плоско, и знаки на ней тем же тоном), крестик виден
 * на ней и при наведении, средняя кнопка мыши закрывает; закрывать нечего (closable) - нет и
 * крестика. В полосе разговоров (width grow)
 * растёт в свободное место и режет подпись посередине; несёт отступ форка и свет
 * позвавшей (CallLight), справа у крестика - свои знаки (trailing). Ставится в элемент с role="tablist". Вкладки-разделы - Tabs.
 */
export const ClosableTab = ({
  label,
  hint,
  active,
  closeLabel,
  closable = true,
  leading,
  trailing,
  width = 'fill',
  tinted = false,
  indent = 0,
  groupEnd = false,
  call,
  callSince,
  calm = false,
  lifted = false,
  offset,
  editor,
  ref,
  onMouseDown,
  onDoubleClick,
  onContextMenu,
  onActivate,
  onClose,
}: ClosableTabProps) => {
  const { boxRef, wholeRef, shown, isCut } = useMiddleCut(label)
  const isGrow = width === 'grow'
  const place = {
    '--tab-indent': indent,
    ...(offset && { transform: `translate(${offset.x}px, ${offset.y}px)` }),
  } as CSSProperties

  const handleAuxClick = (event: MouseEvent) => {
    if (closable && event.button === MIDDLE_MOUSE_BUTTON) onClose()
  }

  return (
    <div
      ref={ref}
      className={clsx(
        styles.closableTab,
        styles[width],
        active && styles.active,
        tinted && styles.tinted,
        groupEnd && styles.groupEnd,
        lifted && styles.lifted,
        !closable && styles.fixed,
        calm && styles.calm,
        call && [styles.calling, styles[call]],
      )}
      // eslint-disable-next-line no-restricted-syntax -- глубина форка и сдвиг под рукой меняются на лету
      style={place}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}>
      {call !== undefined && <CallLight call={call} since={callSince} />}
      {editor ? (
        <span className={styles.label}>
          {leading}
          {editor}
        </span>
      ) : (
        <Tooltip label={hint} stretch disabled={isGrow && !isCut}>
          <button
            type="button"
            role="tab"
            aria-selected={active}
            className={styles.label}
            onClick={onActivate}
            onAuxClick={handleAuxClick}>
            {leading}
            {isGrow ? (
              <span ref={boxRef} className={styles.cut}>
                <span ref={wholeRef} className={styles.cutWhole}>
                  {label}
                </span>
                <span className={styles.cutShown} aria-hidden>
                  {shown}
                </span>
              </span>
            ) : (
              <span className={styles.text}>{label}</span>
            )}
            {trailing && <span className={styles.trailing}>{trailing}</span>}
          </button>
        </Tooltip>
      )}
      {closable && (
        <span className={styles.close}>
          <IconButton icon={X} size="sm" label={closeLabel} onClick={onClose} />
        </span>
      )}
    </div>
  )
}
