import { Square, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@agentic-workstation/ui/Badge'
import { Button } from '@agentic-workstation/ui/Button'
import { IconButton } from '@agentic-workstation/ui/IconButton'

import type { AiJobPartProps } from '../AiJobModal.types'
import { AI_JOB_TONES } from '../../ai-job.constants'
import { useConnectorsStore } from '../../connectors.store'
import { ConnectorsHelp } from '../../ConnectorsView/parts/ConnectorsHelp'
import { useConnectorActions } from '../../../../state/connectors.queries'

/**
 * Шапка окна работы: состояние, Stop идущего хода (разговор остаётся - ему можно написать) и
 * «убрать работу» - она уходит из очереди вместе с разговором.
 */
export const AiJobActions = ({ job }: AiJobPartProps) => {
  const { t } = useTranslation()
  const actions = useConnectorActions()
  const close = useConnectorsStore((store) => store.close)

  const handleStop = () => actions.stopAiJob(job.id)

  const handleRemove = () => {
    actions.removeAiJob(job.id)
    close()
  }

  return (
    <>
      <Badge tone={AI_JOB_TONES[job.status]}>{t(`connectors.ai.status.${job.status}`)}</Badge>
      {job.status === 'working' && (
        <Button size="sm" icon={Square} onClick={handleStop}>
          {t('connectors.ai.stop')}
        </Button>
      )}
      <IconButton
        icon={Trash2}
        label={t('connectors.ai.remove')}
        size="sm"
        variant="ghost"
        onClick={handleRemove}
      />
      <ConnectorsHelp topic="aiJobs" />
    </>
  )
}
