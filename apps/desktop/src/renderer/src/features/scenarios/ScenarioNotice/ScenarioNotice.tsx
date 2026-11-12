import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Toast } from '@agentic-workstation/ui/Toast'

import { useScenariosStore } from '../scenarios.store'

/**
 * Отказ действия сценариев в углу окна: почему очередь не встала, worktree не создался,
 * прогон не подхватился. Остаётся, пока его не закроют: это то, что человек должен прочесть.
 */
export const ScenarioNotice = () => {
  const { t } = useTranslation()
  const notice = useScenariosStore((state) => state.notice)
  const dismiss = useScenariosStore((state) => state.dismiss)

  if (!notice) return null

  return (
    <Toast
      tone="danger"
      title={t(`scenarios.codes.${notice.code}`, { defaultValue: t('scenarios.codes.unknown') })}
      description={notice.detail || undefined}
      actions={
        <Button variant="ghost" size="sm" onClick={dismiss}>
          {t('common.close')}
        </Button>
      }
    />
  )
}
