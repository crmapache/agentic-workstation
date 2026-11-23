import { X, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Spinner } from '@agentic-workstation/ui/Spinner'

import styles from '../CalendarView.module.scss'
import type { SyncButtonProps } from '../CalendarView.types'
import { useCalendarActions } from '../../calendar.actions'

/**
 * Sync - все источники разом, и прямые, и те, что читает ИИ (по одному: Chrome и мышь общие).
 * Пока что-то читается - бегущие шаги (ADR 0097), сколько осталось и «остановить».
 */
export const SyncButton = ({ sources }: SyncButtonProps) => {
  const { t } = useTranslation()
  const { sync, cancel } = useCalendarActions()
  const busy = sources.filter((source) => source.sync.phase !== 'idle').length

  if (busy > 0) {
    return (
      <div className={styles.sync}>
        <Spinner variant="steps" label={t('calendar.sync.running')} />
        <span>{t('calendar.sync.left', { count: busy })}</span>
        <IconButton
          icon={X}
          size="sm"
          label={t('calendar.sync.stop')}
          onClick={() => void cancel(null)}
        />
      </div>
    )
  }

  return (
    <Button icon={RefreshCw} onClick={() => void sync(null)}>
      {t('calendar.sync.all')}
    </Button>
  )
}
