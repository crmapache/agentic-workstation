import { Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { TextArea } from '@agentic-workstation/ui/TextArea'

import { useTell } from '../AiJobModal.hooks'
import styles from '../AiJobModal.module.scss'
import type { AiJobPartProps } from '../AiJobModal.types'

/**
 * Поле ИИ в подвале окна работы: уточнить сервис, дать ссылку, попросить другие инструменты.
 * Посреди хода ИИ подхватывает слова между шагами, после хода - начинает новый.
 */
export const AiJobTell = ({ job }: AiJobPartProps) => {
  const { t } = useTranslation()
  const tell = useTell(job)

  return (
    <div className={styles.tell}>
      <div className={styles.tellField}>
        <TextArea
          hideLabel
          label={t('connectors.ai.tell.label')}
          placeholder={
            job.status === 'working'
              ? t('connectors.ai.tell.placeholderWorking')
              : t('connectors.ai.tell.placeholder')
          }
          value={tell.text}
          onChange={tell.setText}
          onKeyDown={tell.handleKeyDown}
          data-autofocus
        />
      </div>
      <Button variant="primary" icon={Send} disabled={!tell.canSend} onClick={tell.send}>
        {t('connectors.ai.tell.send')}
      </Button>
    </div>
  )
}
