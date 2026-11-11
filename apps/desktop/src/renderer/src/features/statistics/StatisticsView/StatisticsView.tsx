import { ChartColumn } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@agentic-workstation/ui/EmptyState'

/**
 * Статистика в середине окна. Пока заглушка: статистика будет своей у IDE, по всем
 * провайдерам LLM, а не частью GUI одного из них (ADR 0010).
 */
export const StatisticsView = () => {
  const { t } = useTranslation()

  return (
    <EmptyState
      icon={ChartColumn}
      title={t('statistics.title')}
      description={t('statistics.stub')}
    />
  )
}
