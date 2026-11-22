import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { readingPlayerOf, stopReadingPlayer } from '../read-aloud-player'
import { useReadAloudStore } from '../read-aloud.store'
import { useClient } from '../../../lib/client'
import { useToastStore } from '../../../state/toast.store'

/**
 * Звук и конец чтения вслух от IDE (ADR 0106): кадры вида reading с номером своего чтения - в
 * динамик, конец - дозвучать; срыв, остановка IDE или отказ - тишина и строка внизу. Кадры и
 * слова чужого (прежнего) чтения - мимо.
 */
export const useReadAloudHost = () => {
  const { t } = useTranslation()
  const client = useClient()
  const showToast = useToastStore((state) => state.show)

  useEffect(() => {
    const offs = [
      client.events.on('audio', (agentId, frame) => {
        const { current, playing } = useReadAloudStore.getState()

        if (frame.kind !== 'reading' || current?.agentId !== agentId) return
        if (frame.epoch !== current.n) return

        readingPlayerOf(current.ref)?.push(frame.pcm)
        playing(current.ref)
      }),
      client.events.on('message', (agentId, message) => {
        if (message.k !== 'voice' || message.event.kind !== 'reading') return

        const { ref, outcome, reason } = message.event
        const { current, clear } = useReadAloudStore.getState()

        if (current?.ref !== ref || current.agentId !== agentId) return

        // Дочитано: то, что пришло, дозвучит, и динамик сам скажет о конце.
        if (outcome === 'done') {
          const player = readingPlayerOf(ref)

          if (player) return player.finish()
        }

        stopReadingPlayer(ref)
        clear(ref)

        if (outcome === 'failed') showToast(t('read.failed'))
        else if (outcome === 'refused') {
          showToast(
            t(`read.refused.${reason ?? 'other'}`, { defaultValue: t('read.refused.other') }),
          )
        }
      }),
    ]

    return () => {
      for (const off of offs) off()
    }
  }, [client, showToast, t])
}
