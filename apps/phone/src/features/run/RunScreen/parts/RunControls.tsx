import { useState } from 'react'
import { Play, Pause, Square } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { RunWire } from '@agentic-workstation/remote-protocol/wire-types'
import { IconButton } from '@agentic-workstation/ui/IconButton'

import { ConfirmDialog } from '../../../../shell/ConfirmDialog/ConfirmDialog'

/** Пауза или продолжить и стоп (с вопросом «точно?») - в шапке прогона. */
export const RunControls = ({
  run,
  busy,
  onControl,
}: {
  run: RunWire
  busy: boolean
  onControl: (action: 'pause' | 'resume' | 'stop') => void
}) => {
  const { t } = useTranslation()
  const [isStopping, setIsStopping] = useState(false)
  const paused = run.state === 'paused'

  return (
    <>
      <IconButton
        icon={paused ? Play : Pause}
        size="touch"
        label={t(paused ? 'run.resume' : 'run.pause')}
        disabled={busy}
        onClick={() => onControl(paused ? 'resume' : 'pause')}
      />
      <IconButton
        icon={Square}
        size="touch"
        label={t('run.stop')}
        onClick={() => setIsStopping(true)}
      />
      <ConfirmDialog
        open={isStopping}
        title={t('run.stopConfirm', { name: run.scenarioName })}
        confirmLabel={t('run.stop')}
        onConfirm={() => onControl('stop')}
        onClose={() => setIsStopping(false)}
      />
    </>
  )
}
