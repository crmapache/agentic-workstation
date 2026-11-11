import { Workflow } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@agentic-workstation/ui/EmptyState'

/**
 * Сценарии проекта в середине окна. Пока заглушка: сценарии переезжают на уровень IDE
 * (ADR 0014), здесь встанут их полки и прогоны.
 */
export const ScenariosView = () => {
  const { t } = useTranslation()

  return (
    <EmptyState icon={Workflow} title={t('scenarios.title')} description={t('scenarios.stub')} />
  )
}
