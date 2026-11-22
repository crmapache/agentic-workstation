import { Mic } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import { useActionNoticeStore } from '../../../state/action-notice.store'
import { useVoice, useStartVoiceCall } from '../../../state/voice.queries'

/**
 * Голосовой звонок из панели (ADR 0104): новый разговор в Home, окно - к нему. Недоступен
 * (режим выключен, нет ключа, звонок уже идёт) - кнопка серая, почему - в подсказке; отказ
 * при нажатии (нет микрофона) - в углу окна.
 */
export const VoiceCallAction = () => {
  const { t } = useTranslation()
  const voice = useVoice()
  const { start, isStarting } = useStartVoiceCall()
  const showNotice = useActionNoticeStore((state) => state.show)

  if (!voice) return null

  const { capability, call } = voice
  const label = !capability.available
    ? t(`voice.unavailable.${capability.reason}`)
    : call
      ? t('voice.refused.busy')
      : t('voice.startTitle')

  const handleStart = async () => {
    const outcome = await start()

    if (!outcome.ok) showNotice({ tone: 'danger', title: t(`voice.refused.${outcome.reason}`) })
  }

  return (
    <IconButton
      icon={Mic}
      label={label}
      disabled={!capability.available || call !== null || isStarting}
      onClick={() => void handleStart()}
    />
  )
}
