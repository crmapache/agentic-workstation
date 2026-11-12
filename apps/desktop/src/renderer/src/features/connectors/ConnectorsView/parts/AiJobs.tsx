import { WandSparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'
import { Section } from '@agentic-workstation/ui/Section'
import { Tile } from '@agentic-workstation/ui/Tile'

import styles from '../ConnectorsView.module.scss'
import type { AiJobsProps } from '../ConnectorsView.types'
import { AI_JOB_TONES } from '../../ai-job.constants'
import { jobLine } from '../../ai-job.utils'
import { useConnectorsStore } from '../../connectors.store'
import { ConnectorsHelp } from './ConnectorsHelp'

/**
 * Очередь работ ИИ над новыми коннекторами (ADR 0050) - над подключёнными, пока в ней что-то
 * есть: работа идёт в главном процессе, окно её не держит. На плитке - сервис, что ИИ делает
 * или предлагает и состояние; нажатие открывает разговор большим окном.
 */
export const AiJobs = ({ jobs }: AiJobsProps) => {
  const { t } = useTranslation()
  const panel = useConnectorsStore((store) => store.panel)
  const openAiJob = useConnectorsStore((store) => store.openAiJob)

  if (jobs.length === 0) return null

  return (
    <Section
      title={t('connectors.ai.jobs.title')}
      count={jobs.length}
      help={<ConnectorsHelp topic="aiJobs" />}>
      <div className={styles.grid}>
        {jobs.map((job) => (
          <Tile
            key={job.id}
            icon={WandSparkles}
            iconTone="success"
            title={job.request.service}
            description={jobLine(t, job)}
            status={
              <Badge tone={AI_JOB_TONES[job.status]}>
                {t(`connectors.ai.status.${job.status}`)}
              </Badge>
            }
            selected={panel?.kind === 'aiJob' && panel.id === job.id}
            onClick={() => openAiJob(job.id)}
          />
        ))}
      </div>
    </Section>
  )
}
