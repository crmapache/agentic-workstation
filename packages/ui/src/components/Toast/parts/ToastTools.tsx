import { ChevronUp, Maximize2, ChevronDown } from 'lucide-react'

import styles from '../Toast.module.scss'
import type { ToastToolsProps } from '../Toast.types'
import { IconButton } from '../../IconButton/IconButton'
import { ToastCloseButton } from './ToastCloseButton'

/**
 * Значки по первой строке карточки: раскрыть длинное пояснение здесь же, открыть всё там, где
 * ему хватает места, и крестик. Стрелка - первой: она о тексте под ней, а крестик остаётся у
 * края, где его ищут. Значков нет - и места под них нет.
 */
export const ToastTools = ({ fold, expand, close, arcRef }: ToastToolsProps) => {
  if (!fold && !expand && !close) return null

  return (
    <span className={styles.tools}>
      {fold && (
        <IconButton
          icon={fold.isExpanded ? ChevronUp : ChevronDown}
          size="sm"
          label={fold.isExpanded ? fold.more.hideLabel : fold.more.showLabel}
          aria-expanded={fold.isExpanded}
          aria-controls={fold.textId}
          onClick={fold.onToggle}
        />
      )}
      {expand && (
        <IconButton icon={Maximize2} size="sm" label={expand.label} onClick={expand.onExpand} />
      )}
      {close && <ToastCloseButton close={close} arcRef={arcRef} />}
    </span>
  )
}
