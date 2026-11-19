import { memo, useState } from 'react'

import { toolMeta, toolDetail } from '../tool-summary.utils'
import { ToolHead } from '../ToolHead/ToolHead'
import styles from './ToolRow.module.scss'
import type { ToolRowProps } from './ToolRow.types'
import { ToolDetails } from './parts/ToolDetails'

/**
 * Вызов инструмента, как карточка вызова ACC: шапка одной строкой, по нажатию - что он
 * напечатал (первые строки, успех зелёным, ошибка красным) или почему закрыт без
 * результата. Правки - не здесь, у них дифф открыт сразу (EditCard).
 */
export const ToolRow = memo(({ tool }: ToolRowProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const { lines, hidden } = toolDetail(tool)
  const isClosed = tool.status === 'interrupted' && !tool.result
  const canOpen = lines.length > 0 || isClosed

  const handleToggle = () => setIsOpen((value) => !value)

  return (
    <div className={styles.toolRow}>
      <ToolHead
        tool={tool}
        meta={toolMeta(tool)}
        canOpen={canOpen}
        expanded={isOpen && canOpen}
        onToggle={handleToggle}
      />
      {isOpen && canOpen && <ToolDetails tool={tool} lines={lines} hidden={hidden} />}
    </div>
  )
})

ToolRow.displayName = 'ToolRow'
