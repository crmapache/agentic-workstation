import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { useWhenLabels } from '../LocalHistoryView.hooks'
import styles from '../LocalHistoryView.module.scss'
import type { RevisionListProps } from '../LocalHistoryView.types'
import { RevisionRow } from './RevisionRow'

/**
 * Версии по дням, новые сверху, как список Local History в WebStorm. Стрелки вверх и вниз
 * ходят по строкам и сразу показывают версию. Список обрезан - строка о том, что он не весь.
 */
export const RevisionList = ({
  days,
  isFolder,
  selected,
  truncated,
  onSelect,
}: RevisionListProps) => {
  const { t } = useTranslation()
  const { day } = useWhenLabels()
  const keys = days.flatMap((group) => group.rows.map((row) => row.key))

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    const next = keys[keys.indexOf(selected ?? '') + step]

    if (step === 0 || next === undefined) return

    event.preventDefault()
    onSelect(next)
    event.currentTarget
      .querySelector<HTMLElement>(`[data-history-row="${CSS.escape(next)}"]`)
      ?.focus()
  }

  return (
    <nav aria-label={t('localHistory.list')} className={styles.list} onKeyDown={handleKeyDown}>
      {days.map((group) => (
        <section key={group.start} aria-label={day(group.start)}>
          <h3 className={styles.day}>{day(group.start)}</h3>
          <ul className={styles.rows}>
            {group.rows.map((row) => (
              <RevisionRow
                key={row.key}
                row={row}
                isFolder={isFolder}
                isSelected={row.key === selected}
                onSelect={onSelect}
              />
            ))}
          </ul>
        </section>
      ))}
      {truncated && (
        <p className={styles.note}>{t('localHistory.truncated', { count: keys.length })}</p>
      )}
    </nav>
  )
}
