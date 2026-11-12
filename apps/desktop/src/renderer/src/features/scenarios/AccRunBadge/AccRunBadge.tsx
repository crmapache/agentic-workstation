import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'
import { Tooltip } from '@agentic-workstation/ui/Tooltip'

/**
 * Метка прогона плагина ACC (строка истории, шапка окна прогона): его ведёт ACC, здесь - только
 * смотреть. Под курсором - откуда прогон и почему без кнопок.
 */
export const AccRunBadge = () => {
  const { t } = useTranslation()

  return (
    <Tooltip label={t('scenarios.history.accHint')}>
      <Badge variant="soft">{t('scenarios.history.acc')}</Badge>
    </Tooltip>
  )
}
