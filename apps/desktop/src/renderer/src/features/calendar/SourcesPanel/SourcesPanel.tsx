import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import { CALENDAR_TICK_MS } from '../calendar.constants'
import { useCalendarStore } from '../calendar.store'
import { useNow } from '../../../lib/now.hooks'
import styles from './SourcesPanel.module.scss'
import type { SourcesPanelProps } from './SourcesPanel.types'
import { SourceRow } from './parts/SourceRow'

/**
 * Вкладка источников боковой панели: цвет, «показывать», состояние синка и меню действий у
 * каждого, под ними - добавить источник. Настройки календаря - в Settings → Calendar.
 */
export const SourcesPanel = ({ state }: SourcesPanelProps) => {
  const { t } = useTranslation()
  const edit = useCalendarStore((store) => store.edit)
  const now = useNow(true, CALENDAR_TICK_MS)

  return (
    <>
      <ul className={styles.list} aria-label={t('calendar.sources.label')}>
        {state.sources.map((source) => (
          <SourceRow key={source.id} source={source} now={now} />
        ))}
      </ul>
      <Button icon={Plus} variant="dashed" size="sm" onClick={() => edit(null)}>
        {t('calendar.actions.add')}
      </Button>
    </>
  )
}
