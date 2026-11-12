import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'

import type { ShelfLoadProps } from '../LibraryTab.types'

/**
 * Идёт ли сценарий в очередях проекта прямо сейчас и ждёт ли там своей очереди - метками рядом
 * с именем: работающий сценарий не то же, что просто записанный, а Run второй раз ставит ещё
 * один прогон. Работает - жёлтым, как у прогона; ждёт - серым.
 */
export const ShelfLoad = ({ load }: ShelfLoadProps) => {
  const { t } = useTranslation()

  return (
    <>
      {load.running > 0 && (
        <Badge tone="warning">{t('scenarios.library.running', { count: load.running })}</Badge>
      )}
      {load.queued > 0 && (
        <Badge tone="neutral">{t('scenarios.library.queued', { count: load.queued })}</Badge>
      )}
    </>
  )
}
