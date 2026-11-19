import { useMemo } from 'react'

import styles from '../AgentLog.module.scss'
import type { JournalStepsProps } from '../AgentLog.types'
import { journalRows } from '../AgentLog.utils'
import { ThinkingRow } from '../../ThinkingRow/ThinkingRow'
import { ToolRow } from '../../ToolRow/ToolRow'

/**
 * Шаги агента строками: вызовы, мысли, короткие реплики. Правки тут тоже строкой - их
 * диффы загромождали бы журнал; раскрыть можно по нажатию.
 */
export const JournalSteps = ({ steps }: JournalStepsProps) => {
  const rows = useMemo(() => journalRows(steps), [steps])

  return (
    <div className={styles.journal}>
      {rows.map((row) => {
        if (row.kind === 'tool') return <ToolRow key={row.id} tool={row.item} />
        if (row.kind === 'thinking') return <ThinkingRow key={row.id} items={row.items} />

        return (
          <div key={row.id} className={styles.remark}>
            {row.item.text}
          </div>
        )
      })}
    </div>
  )
}
