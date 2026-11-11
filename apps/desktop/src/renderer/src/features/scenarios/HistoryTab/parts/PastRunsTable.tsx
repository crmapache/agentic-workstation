import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import { RUNS_PAGE } from '../HistoryTab.constants'
import styles from '../HistoryTab.module.scss'
import type { PastRunsTableProps } from '../HistoryTab.types'
import { PastRunRow } from './PastRunRow'

/**
 * Прошлые прогоны таблицей, экран за экраном: сценарий на часах оставляет прогон каждое утро.
 * «Ещё N» и «Свернуть» - внутри таблицы, в её нижней строке: рука уже там, а ради сворачивания
 * листать тридцать строк наверх - то, от чего таблица и режется.
 */
export const PastRunsTable = ({
  runs,
  shown,
  now,
  onOpen,
  onStar,
  onDelete,
  onMore,
  onFewer,
}: PastRunsTableProps) => {
  const { t } = useTranslation()
  const words = {
    todayAt: (clock: string) => t('scenarios.history.todayAt', { clock }),
    yesterdayAt: (clock: string) => t('scenarios.history.yesterdayAt', { clock }),
  }

  return (
    <div className={styles.frame}>
      <div className={styles.table}>
        <div className={clsx(styles.tableRow, styles.tableHead)}>
          <span className={styles.colRun}>{t('scenarios.history.table.run')}</span>
          <span className={styles.colStarted}>{t('scenarios.history.table.started')}</span>
          <span className={styles.colFinished}>{t('scenarios.history.table.finished')}</span>
          <span className={styles.colTook}>{t('scenarios.history.table.took')}</span>
          <span className={styles.colCost}>{t('scenarios.history.table.cost')}</span>
          <span className={styles.colState}>{t('scenarios.history.table.state')}</span>
          <span className={styles.colStar} />
          <span className={styles.colDrop} />
        </div>
        {runs.slice(0, shown).map((run) => (
          <PastRunRow
            key={run.id}
            run={run}
            now={now}
            words={words}
            onOpen={onOpen}
            onStar={onStar}
            onDelete={onDelete}
          />
        ))}
        {runs.length > RUNS_PAGE && (
          <div className={styles.tableFoot}>
            {runs.length > shown && (
              <Button variant="ghost" size="sm" onClick={onMore}>
                {t('scenarios.history.more', { count: Math.min(RUNS_PAGE, runs.length - shown) })}
              </Button>
            )}
            {shown > RUNS_PAGE && (
              <Button variant="ghost" size="sm" onClick={onFewer}>
                {t('scenarios.history.fewer')}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
