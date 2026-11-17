import { memo, useMemo, useState } from 'react'

import { editRows, trimHunks, hunksOfRows } from '../diff.utils'
import { editMeta, toolMeta, toolDetail } from '../tool-summary.utils'
import { DiffView } from '../DiffView/DiffView'
import { DIFF_COLLAPSE_SLACK, DIFF_COLLAPSED_ROWS } from '../DiffView/DiffView.constants'
import { ToolHead } from '../ToolHead/ToolHead'
import { ToolDetails } from '../ToolRow/parts/ToolDetails'
import styles from './EditCard.module.scss'
import type { EditCardProps } from './EditCard.types'

/**
 * Правка файла, как в ACC: шапка вызова, а под ней дифф открыт сразу - неверную правку
 * надо заметить, не собираясь её искать. Видно начало, «… N more lines» и стрелка в
 * шапке раскрывают остальное. У провалившейся правки диффа нет (ничего не записано) -
 * видна причина.
 */
export const EditCard = memo(({ tool }: EditCardProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const rows = useMemo(() => editRows(tool), [tool])
  const isRefused = tool.status === 'error' || tool.status === 'denied'
  const showDiff = !isRefused && rows.length > 0
  const { hidden } = trimHunks(hunksOfRows(rows), DIFF_COLLAPSED_ROWS, DIFF_COLLAPSE_SLACK)
  const detail = toolDetail(tool)
  const canOpen = showDiff ? hidden > 0 : detail.lines.length > 0
  const meta = isRefused || !showDiff ? toolMeta(tool) : editMeta(tool.result, rows)

  const handleToggle = () => setIsOpen((value) => !value)

  return (
    <div className={styles.editCard}>
      <ToolHead
        tool={tool}
        meta={meta}
        canOpen={canOpen}
        expanded={isOpen && canOpen}
        onToggle={handleToggle}
      />
      {showDiff ? (
        <div className={styles.diff}>
          <DiffView rows={rows} expanded={isOpen} onToggle={handleToggle} />
        </div>
      ) : (
        isOpen && canOpen && <ToolDetails tool={tool} lines={detail.lines} hidden={detail.hidden} />
      )}
    </div>
  )
})

EditCard.displayName = 'EditCard'
