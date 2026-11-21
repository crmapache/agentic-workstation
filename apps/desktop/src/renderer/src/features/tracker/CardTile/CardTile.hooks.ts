import { useTranslation } from 'react-i18next'

import type { TrackerDue } from '@shared/tracker'

import { dueLabel } from '../tracker.utils'

/** Срок карточки словами окна; без срока - пусто. */
export const useDueLabel = (due: TrackerDue | null, today: number): string => {
  const { t } = useTranslation()

  return due
    ? dueLabel(due, today, {
        today: t('tracker.due.today'),
        tomorrow: t('tracker.due.tomorrow'),
        yesterday: t('tracker.due.yesterday'),
      })
    : ''
}
