import { useState } from 'react'
import { Square, OctagonX } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import { ConfirmDialog } from '../../../../shell/ConfirmDialog/ConfirmDialog'

/**
 * Stop идущего хода в ряду поля. Stop уже нажат, а ход всё идёт (CLI не ответил) - на его месте
 * «погасить процесс», с вопросом «точно?»: незаконченная работа хода пропадёт.
 */
export const StopButton = ({
  forceable,
  stopping,
  forceStopping,
  onStop,
  onForceStop,
}: {
  /** Stop нажимали, а ход не кончился: CLI не отвечает. */
  forceable: boolean
  stopping: boolean
  forceStopping: boolean
  onStop: () => void
  onForceStop: () => void
}) => {
  const { t } = useTranslation()
  const [isConfirming, setIsConfirming] = useState(false)

  if (!forceable) {
    return (
      <Button size="touch" variant="secondary" icon={Square} disabled={stopping} onClick={onStop}>
        {t('conversation.stop')}
      </Button>
    )
  }

  return (
    <>
      <Button
        size="touch"
        variant="danger"
        icon={OctagonX}
        disabled={forceStopping}
        onClick={() => setIsConfirming(true)}>
        {t('conversation.forceStop.button')}
      </Button>
      <ConfirmDialog
        open={isConfirming}
        title={t('conversation.forceStop.title')}
        text={t('conversation.forceStop.text')}
        confirmLabel={t('conversation.forceStop.button')}
        onConfirm={onForceStop}
        onClose={() => setIsConfirming(false)}
      />
    </>
  )
}
