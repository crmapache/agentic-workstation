import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Switch } from '@agentic-workstation/ui/Switch'

import { useCalendarActions } from '../calendar.actions'
import { CALENDAR_TICK_MS } from '../calendar.constants'
import { useCalendarStore } from '../calendar.store'
import { useNow } from '../../../lib/now.hooks'
import styles from './SourcesPanel.module.scss'
import type { SourcesPanelProps } from './SourcesPanel.types'
import { SourceRow } from './parts/SourceRow'

/**
 * Источники календаря слева от сетки: цвет, «показывать», состояние синка, меню действий; под
 * ними - добавить источник и два переключателя календаря (уведомлять о накладках, давать
 * календарь ИИ в разговорах).
 */
export const SourcesPanel = ({ state }: SourcesPanelProps) => {
  const { t } = useTranslation()
  const edit = useCalendarStore((store) => store.edit)
  const { setSettings } = useCalendarActions()
  const now = useNow(true, CALENDAR_TICK_MS)

  return (
    <aside className={styles.panel} aria-label={t('calendar.sources.label')}>
      <div className={styles.title}>{t('calendar.sources.title')}</div>
      <ul className={styles.list}>
        {(state?.sources ?? []).map((source) => (
          <SourceRow key={source.id} source={source} now={now} />
        ))}
      </ul>
      <Button icon={Plus} variant="dashed" size="sm" onClick={() => edit(null)}>
        {t('calendar.actions.add')}
      </Button>
      {state && (
        <div className={styles.settings}>
          <Switch
            label={t('calendar.settings.notify')}
            description={t('calendar.settings.notifyNote')}
            checked={state.settings.notifyOverlaps}
            onChange={(notifyOverlaps) => void setSettings({ notifyOverlaps })}
          />
          <Switch
            label={t('calendar.settings.share')}
            description={t('calendar.settings.shareNote')}
            checked={state.settings.shareWithAi}
            onChange={(shareWithAi) => void setSettings({ shareWithAi })}
          />
        </div>
      )}
    </aside>
  )
}
