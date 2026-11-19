import { ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import { useConversationActions } from '../conversation-actions.hooks'
import { toolsFailureText } from '../panel.utils'
import styles from './ScreenFailure.module.scss'
import type { ScreenFailureProps } from './ScreenFailure.types'

/**
 * Почему экран плагинов или /config пуст: причина словами и текст CLI. Папке не доверились
 * - кнопка доверия прямо здесь (тот же вопрос, что в чате), потом экран спросит снова.
 */
export const ScreenFailure = ({ failure, detail, projectId, onTrusted }: ScreenFailureProps) => {
  const { t } = useTranslation()
  const { trustProject } = useConversationActions()

  const handleTrust = async () => {
    if (await trustProject(projectId)) onTrusted()
  }

  return (
    <div className={styles.screenFailure}>
      <div className={styles.text}>{toolsFailureText(t, failure, detail)}</div>
      {failure === 'untrusted' && (
        <div>
          <Button size="sm" icon={ShieldCheck} onClick={() => void handleTrust()}>
            {t('agentPanel.blocked.trustOnly')}
          </Button>
        </div>
      )}
    </div>
  )
}
