import { useTranslation } from 'react-i18next'

import { Toast } from '@agentic-workstation/ui/Toast'

import { useScenariosStore } from '../scenarios.store'
import { useToastMore } from '../../../lib/toast-more.hooks'

/**
 * Отказ действия сценариев в углу окна: почему очередь не встала, worktree не создался,
 * прогон не подхватился. Остаётся, пока его не закроют: это то, что человек должен прочесть.
 */
export const ScenarioNotice = () => {
  const { t } = useTranslation()
  const notice = useScenariosStore((state) => state.notice)
  const dismiss = useScenariosStore((state) => state.dismiss)
  const more = useToastMore()

  if (!notice) return null

  return (
    <Toast
      tone="danger"
      title={t(`scenarios.codes.${notice.code}`, { defaultValue: t('scenarios.codes.unknown') })}
      description={notice.detail || undefined}
      more={more}
      close={{ label: t('common.close'), onClose: dismiss }}
    />
  )
}
