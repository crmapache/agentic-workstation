import { WandSparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Modal } from '@agentic-workstation/ui/Modal'

import { jobLine } from '../ai-job.utils'
import { useConnectorsStore } from '../connectors.store'
import { useJobAdded } from './AiJobModal.hooks'
import styles from './AiJobModal.module.scss'
import type { AiJobModalProps } from './AiJobModal.types'
import { AiJobActions } from './parts/AiJobActions'
import { AiJobLog } from './parts/AiJobLog'
import { AiJobSide } from './parts/AiJobSide'
import { AiJobTell } from './parts/AiJobTell'

/**
 * Работа ИИ над новым коннектором большим окном (ADR 0050): слева - живой разговор (что ИИ ищет
 * и читает, что ответил), справа - что он предлагает добавить, внизу - поле, чтобы писать ему
 * посреди работы и после. Закрыть окно можно когда угодно: работа идёт в главном процессе и
 * ждёт в очереди на виде.
 */
export const AiJobModal = ({ job }: AiJobModalProps) => {
  const { t } = useTranslation()
  const close = useConnectorsStore((store) => store.close)
  const handleAdded = useJobAdded(job.id)

  return (
    <Modal
      open
      size="lg"
      tall
      icon={WandSparkles}
      iconTone="success"
      title={job.request.service}
      description={jobLine(t, job)}
      headerActions={<AiJobActions job={job} />}
      footer={<AiJobTell job={job} />}
      closeLabel={t('connectors.modal.close')}
      onClose={close}>
      <div className={styles.frame}>
        <div className={styles.layout}>
          <div className={styles.logColumn}>
            <AiJobLog job={job} />
          </div>
          <div className={styles.sideColumn}>
            <AiJobSide job={job} onAdded={handleAdded} />
          </div>
        </div>
      </div>
    </Modal>
  )
}
