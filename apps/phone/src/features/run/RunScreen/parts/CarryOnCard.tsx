import { Hourglass } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { RunWire } from '@agentic-workstation/remote-protocol/wire-types'
import { Button } from '@agentic-workstation/ui/Button'
import { Card } from '@agentic-workstation/ui/Card'

import { clockText } from '../../../../lib/time.utils'

/**
 * Прогон пережидает лимит или остановился: продолжить с того же места той же головой. Лимит -
 * до какого времени; остановка и провал - почему.
 */
export const CarryOnCard = ({
  run,
  busy,
  onCarryOn,
}: {
  run: RunWire
  busy: boolean
  onCarryOn: () => void
}) => {
  const { t } = useTranslation()
  const stopped = run.state === 'failed' || run.state === 'stopped'

  if (!run.limit && !stopped) return null

  const description = run.limit
    ? t('run.limitUntil', { at: clockText(run.limit.until) })
    : run.failure
      ? t(`run.failure.${run.failure}`, { defaultValue: run.failure })
      : run.error || undefined

  return (
    <Card
      tone="accent"
      icon={Hourglass}
      title={t(run.limit ? 'run.limitTitle' : 'run.stoppedTitle')}
      description={description}>
      <Button size="touch" variant="primary" disabled={busy} onClick={onCarryOn}>
        {t('run.carryOn')}
      </Button>
    </Card>
  )
}
