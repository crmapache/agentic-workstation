import { WandSparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Spinner } from '@agentic-workstation/ui/Spinner'
import { TextArea } from '@agentic-workstation/ui/TextArea'
import { TextField } from '@agentic-workstation/ui/TextField'

import { useAiConnector } from '../ConnectorsView.hooks'
import styles from '../ConnectorsView.module.scss'
import type { AiConnectorFlowProps } from '../ConnectorsView.types'
import { AiSpecReview } from './AiSpecReview'

/**
 * Коннектор с ИИ (ADR 0029): человек называет сервис и что с ним делать, ИИ читает
 * документацию API и описывает инструменты, человек проверяет описание и вводит ключ.
 * Работа ИИ идёт в главном процессе: лист можно закрыть и уйти на другой вид, итог
 * дождётся в каталоге.
 * Enter в однострочных полях запускает работу ИИ; в поле «что делать» - новая строка.
 */
export const AiConnectorFlow = ({ generation, onAdded, onCancel }: AiConnectorFlowProps) => {
  const { t } = useTranslation()
  const flow = useAiConnector(generation)

  if (generation.status === 'running') {
    return (
      <div className={styles.form}>
        <div className={styles.buttons}>
          <Spinner size="sm" tone="accent" />
          <span className={styles.hint}>
            {t('connectors.ai.generating', { service: generation.request.service })}
          </span>
        </div>
        <div className={styles.formActions}>
          <Button size="sm" onClick={flow.cancel}>
            {t('connectors.ai.cancel')}
          </Button>
        </div>
      </div>
    )
  }

  if (generation.status === 'ready') {
    return <AiSpecReview generation={generation} onAdded={onAdded} onAgain={flow.again} />
  }

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
      {generation.status === 'failed' && (
        <p className={styles.failure}>
          {t(`connectors.ai.errors.${generation.error}`)}
          {generation.detail ? ` ${generation.detail}` : ''}
        </p>
      )}
      <div className={styles.formActions}>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t('connectors.add.cancel')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          icon={WandSparkles}
          disabled={!flow.request.service.trim()}
          onClick={flow.generate}>
          {t('connectors.ai.generate')}
        </Button>
      </div>
    </div>
  )
}
