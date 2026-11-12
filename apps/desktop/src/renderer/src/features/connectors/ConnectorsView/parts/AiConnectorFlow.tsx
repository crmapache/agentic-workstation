import { WandSparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { TextArea } from '@agentic-workstation/ui/TextArea'
import { TextField } from '@agentic-workstation/ui/TextField'

import { useAiConnector } from '../ConnectorsView.hooks'
import styles from '../ConnectorsView.module.scss'
import type { AiConnectorFlowProps } from '../ConnectorsView.types'

/**
 * Просьба к ИИ (ADR 0029, 0050): человек называет сервис, что с ним делать и, если знает,
 * документацию. Просьба уходит в очередь на виде Connectors, окно закрывается: ИИ работает
 * сам, его ход и разговор с ним - в окне работы из очереди.
 * Enter в однострочных полях отправляет просьбу; в поле «что делать» - новая строка.
 */
export const AiConnectorFlow = ({ onStarted, onCancel }: AiConnectorFlowProps) => {
  const { t } = useTranslation()
  const flow = useAiConnector(onStarted)

  return (
    <div className={styles.form}>
      <TextField
        label={t('connectors.ai.service')}
        placeholder={t('connectors.ai.servicePlaceholder')}
        value={flow.request.service}
        autoFocus
        data-autofocus
        onChange={flow.setField('service')}
        onKeyDown={flow.handleKeyDown}
      />
      <TextArea
        label={t('connectors.ai.goal')}
        placeholder={t('connectors.ai.goalPlaceholder')}
        value={flow.request.goal}
        onChange={flow.setField('goal')}
      />
      <TextField
        label={t('connectors.ai.docs')}
        placeholder={t('connectors.ai.docsPlaceholder')}
        value={flow.request.docsUrl}
        onChange={flow.setField('docsUrl')}
        onKeyDown={flow.handleKeyDown}
      />
      <div className={styles.formActions}>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t('connectors.add.cancel')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          icon={WandSparkles}
          disabled={!flow.request.service.trim()}
          onClick={flow.start}>
          {t('connectors.ai.generate')}
        </Button>
      </div>
    </div>
  )
}
