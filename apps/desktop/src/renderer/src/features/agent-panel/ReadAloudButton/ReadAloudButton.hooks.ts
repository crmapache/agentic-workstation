import { useTranslation } from 'react-i18next'

import { useActionNoticeStore } from '../../../state/action-notice.store'
import type { ReadAloudPhase } from '../../../state/read-aloud.store'
import { useReadAloudStore } from '../../../state/read-aloud.store'
import { useVoice } from '../../../state/voice.queries'

/** Есть ли «Прочитать вслух» у ответов: голос включён и ключ Deepgram есть (ADR 0106). */
export const useReadAloudAvailable = (): boolean => useVoice()?.capability.available === true

/**
 * Кнопка «Прочитать вслух» у ответа (ADR 0106): в какой фазе чтение этого ответа и нажатие -
 * начать или остановить; отказ - строкой в углу окна.
 */
export const useReadAloud = (itemId: string, text: string) => {
  const { t } = useTranslation()
  const showNotice = useActionNoticeStore((state) => state.show)
  const phase = useReadAloudStore((state): ReadAloudPhase | null =>
    state.current?.itemId === itemId ? state.current.phase : null,
  )
  const toggle = useReadAloudStore((state) => state.toggle)

  const handleToggle = () =>
    void toggle(itemId, text).then((refusal) => {
      if (refusal) showNotice({ tone: 'danger', title: t(`voice.read.refused.${refusal}`) })
    })

  return { phase, handleToggle }
}
