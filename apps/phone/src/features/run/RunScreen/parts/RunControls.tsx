import { useState } from 'react'
import { Play, Pause, Square } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { RunWire } from '@agentic-workstation/remote-protocol/wire-types'
import { Button } from '@agentic-workstation/ui/Button'

import styles from '../RunScreen.module.scss'
import { ConfirmDialog } from '../../../../shell/ConfirmDialog/ConfirmDialog'

/**
 * Пауза или продолжить и стоп (с вопросом «точно?») - рядом кнопок под пальцем в низу прогона,
 * над полем «написать голове».
 */
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
    <div className={styles.controls}>
      <Button
        size="touch"
        icon={paused ? Play : Pause}
        disabled={busy}
        onClick={() => onControl(paused ? 'resume' : 'pause')}>
        {t(paused ? 'run.resume' : 'run.pause')}
      </Button>
      <Button size="touch" variant="danger" icon={Square} onClick={() => setIsStopping(true)}>
        {t('run.stop')}
      </Button>
      <ConfirmDialog
        open={isStopping}
        title={t('run.stopConfirm', { name: run.scenarioName })}
        confirmLabel={t('run.stop')}
        onConfirm={() => onControl('stop')}
        onClose={() => setIsStopping(false)}
      />
    </div>
  )
}
