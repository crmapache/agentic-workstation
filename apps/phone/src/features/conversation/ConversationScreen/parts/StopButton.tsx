import { useState } from 'react'
import { Square, OctagonX } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import { ConfirmDialog } from '../../../../shell/ConfirmDialog/ConfirmDialog'

/**
 * Stop идущего хода значком в ряду под полем, рядом с «отправить» и того же размера. Stop уже
 * нажат, а ход всё идёт (CLI не ответил) - на его месте «погасить процесс» красным, с вопросом
 * «точно?»: незаконченная работа хода пропадёт.
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
      <IconButton
        icon={Square}
        size="touch"
        label={t('conversation.stop')}
        disabled={stopping}
        onClick={onStop}
      />
    )
  }

  return (
    <>
      <IconButton
        icon={OctagonX}
        size="touch"
        variant="danger"
        label={t('conversation.forceStop.button')}
        disabled={forceStopping}
        onClick={() => setIsConfirming(true)}
      />
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
