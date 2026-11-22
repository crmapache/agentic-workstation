import { useRef, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import type { VoiceLanguage, VoiceSettings } from '@shared/voice'
import { VOICE_PLAY_RATE } from '@shared/voice'

import { playPcmSample } from '@agentic-workstation/voice-audio/pcm'

import { invoke } from '../../lib/ipc'
import { useActionNoticeStore } from '../../state/action-notice.store'
import type { VoicePreview } from './settings.types'

/**
 * Проба голосов в настройках, одна за раз: нажатие - образец готовится (крутилка на кнопке) и
 * звучит («стоп» на ней же); нажатие на ту же кнопку - стоп или отмена; на другой язык - прежняя
 * проба замолкает. Образец главный процесс держит на диске месяц - второй раз он звучит сразу.
 */
export const useVoicePreview = (voices: VoiceSettings['voices']) => {
  const { t } = useTranslation()
  const showNotice = useActionNoticeStore((state) => state.show)
  const [preview, setPreview] = useState<VoicePreview | null>(null)
  const stop = useRef<(() => void) | null>(null)
  // Номер нажатия: ответ и конец звука прежнего нажатия на новое не влияют.
  const turn = useRef(0)

  useEffect(
    () => () => {
      turn.current += 1
      stop.current?.()
    },
    [],
  )

  const toggle = async (language: VoiceLanguage) => {
    const isSame = preview?.language === language

    turn.current += 1
    stop.current?.()
    stop.current = null

    if (isSame) {
      setPreview(null)

      return
    }

    const mine = turn.current

    setPreview({ language, phase: 'loading' })

    const sample = await invoke('voice:preview', { language, voice: voices[language] })

    if (mine !== turn.current) return

    if (!sample) {
      setPreview(null)
      showNotice({ tone: 'danger', title: t('settings.voice.previewFailed') })

      return
    }

    stop.current = playPcmSample(sample.pcm, VOICE_PLAY_RATE, () => {
      if (mine !== turn.current) return

      stop.current = null
      setPreview(null)
    })
    setPreview({ language, phase: 'playing' })
  }

  return { preview, toggle }
}
