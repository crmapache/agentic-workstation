import { GripVertical } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import { ROW_ICON_SIZE } from '../LibraryTab.constants'
import styles from '../LibraryTab.module.scss'
import type { ShelfGripProps } from '../LibraryTab.types'

/**
 * Ручка строки: за неё строку переносят мышью (по своей полке и на соседнюю), с ней в фокусе -
 * Option+стрелкой на место выше или ниже. Только ручка: всё остальное на строке - нажатие со
 * своим смыслом. Строке, которой некуда двигаться, ручки нет - остаётся её место.
 */
export const ShelfGrip = ({ rowKey, shelf, id, kit }: ShelfGripProps) => {
  const { t } = useTranslation()

  if (!kit.movable(rowKey)) return <span className={styles.gripSpace} aria-hidden />

  const label = t('scenarios.library.move')

  return (
    <Tooltip label={label}>
      <span
        role="button"
        tabIndex={0}
        draggable
        aria-label={label}
        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
        data-grip={`${shelf}:${id}`}
        className={styles.grip}
        onDragStart={(event) => kit.grip.onDragStart(event, rowKey)}
        onDragEnd={kit.grip.onDragEnd}
        onKeyDown={(event) => kit.grip.onKeyDown(event, rowKey)}>
        <GripVertical size={ROW_ICON_SIZE} aria-hidden />
      </span>
    </Tooltip>
  )
}
