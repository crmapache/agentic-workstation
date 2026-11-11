import clsx from 'clsx'

import { Section } from '@agentic-workstation/ui/Section'
import { ShareBar } from '@agentic-workstation/ui/ShareBar'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

import styles from '../StatisticsView.module.scss'
import type { RankedListProps } from '../StatisticsView.types'
import { rankedTotal } from '../StatisticsView.utils'

/**
 * Список «кто больше»: имя и число в строку, под ними - полоса от самой большой строки (её
 * куски - чьё это: ты и агенты у языков). Инструменты, коннекторы, модели, проекты,
 * сценарии. Нет строк - короткое состояние вместо списка.
 */
export const RankedList = ({ title, rows, emptyLabel }: RankedListProps) => {
  const total = rankedTotal(rows)

  return (
    <Section size="sm" title={title}>
      {rows.length === 0 ? (
        <p className={styles.note}>{emptyLabel}</p>
      ) : (
        <ul className={styles.ranked}>
          {rows.map((row) => (
            <li key={row.key} className={styles.rankedRow}>
              <div className={styles.rankedHead}>
                <Tooltip label={row.hint ?? row.label} disabled={row.hint === undefined}>
                  <span className={clsx(styles.rankedName, row.current && styles.current)}>
                    {row.label}
                  </span>
                </Tooltip>
                <span className={styles.rankedValue}>{row.value}</span>
              </div>
              <ShareBar
                label={`${row.label}: ${row.value}`}
                total={total}
                segments={row.parts.map((part) => ({ ...part, label: row.label }))}
              />
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
