import { useTranslation } from 'react-i18next'

import { useCalendarOverlaps } from '../../../state/calendar.queries'
import styles from './OverlapsPanel.module.scss'
import type { OverlapsPanelProps } from './OverlapsPanel.types'
import { byDay } from './OverlapsPanel.utils'
import { OverlapRow } from './parts/OverlapRow'

/**
 * Вкладка накладок впереди (ADR 0116): по дням, у каждой - «видел» и «Ask AI». Отмеченные
 * «видел» не горят на сетке и стоят отдельным списком ниже - отметку можно снять.
 */
export const OverlapsPanel = ({ state }: OverlapsPanelProps) => {
  const { t } = useTranslation()
  const { data: overlaps = [] } = useCalendarOverlaps()
  const ahead = byDay(overlaps.filter((overlap) => !overlap.seen))
  const seen = overlaps.filter((overlap) => overlap.seen)

  if (overlaps.length === 0) return <p className={styles.empty}>{t('calendar.overlaps.none')}</p>

  return (
    <>
      {ahead.length === 0 && <p className={styles.empty}>{t('calendar.overlaps.allSeen')}</p>}
      {ahead.map((group) => (
        <section key={group.day} className={styles.group}>
          <h3 className={styles.day}>{group.label}</h3>
          <ul className={styles.list}>
            {group.overlaps.map((overlap) => (
              <OverlapRow key={overlap.key} overlap={overlap} sources={state.sources} />
            ))}
          </ul>
        </section>
      ))}
      {seen.length > 0 && (
        <section className={styles.group}>
          <h3 className={styles.day}>{t('calendar.overlaps.seen', { count: seen.length })}</h3>
          <ul className={styles.list}>
            {seen.map((overlap) => (
              <OverlapRow key={overlap.key} overlap={overlap} sources={state.sources} withDay />
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
