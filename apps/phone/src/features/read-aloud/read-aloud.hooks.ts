import { useTranslation } from 'react-i18next'

import { PROTOCOL_VERSION } from '@agentic-workstation/remote-protocol/phone-messages'

import { useClient } from '../../lib/client'
import { newId } from '../../lib/ids'
import { useToastStore } from '../../state/toast.store'
import { stopReadingPlayer, startReadingPlayer } from './read-aloud-player'
import type { ReadAloudPhase } from './read-aloud.store'
import { useReadAloudStore } from './read-aloud.store'
import { nextReadingNumber } from './read-aloud.utils'

/** Номер последнего чтения страницы: у каждого нажатия свой, кадры прежнего мимо. */
let lastNumber = 0

/**
 * Кнопка «Прочитать вслух» у ответа (ADR 0106): фаза чтения этого ответа и нажатие. Нажатие на
 * тот же ответ - стоп, на другой - прежнее замолкает и начинается новое. Динамик готовится прямо
 * в нажатии, иначе Safari не даст ему звучать.
 */
export const useReadAloud = (agentId: string, conversationId: string, itemId: string) => {
  const { t } = useTranslation()
  const client = useClient()
  const showToast = useToastStore((state) => state.show)
  const phase = useReadAloudStore((state): ReadAloudPhase | null =>
    state.current?.agentId === agentId && state.current.itemId === itemId
      ? state.current.phase
      : null,
  )

  const toggle = () => {
    const { current, begin, clear } = useReadAloudStore.getState()

    if (current) {
      stopReadingPlayer(current.ref)
      clear(current.ref)
      void client.send(current.agentId, {
        p: PROTOCOL_VERSION,
        k: 'voice',
        act: 'stopReading',
        ref: current.ref,
      })
    }

    if (current?.agentId === agentId && current.itemId === itemId) return

    const ref = newId()

    lastNumber = nextReadingNumber(lastNumber)
    startReadingPlayer(ref, () => clear(ref))
    begin({ agentId, itemId, ref, n: lastNumber, phase: 'loading' })

    const read = {
      p: PROTOCOL_VERSION,
      k: 'voice',
      act: 'read',
      ref,
      n: lastNumber,
      conversationId,
      itemId,
    }

    void client.send(agentId, read).then((sent) => {
      if (sent) return

      stopReadingPlayer(ref)
      clear(ref)
      showToast(t('voice.offline'))
    })
  }

  return { phase, toggle }
}
