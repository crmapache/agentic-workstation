import { useState } from 'react'

import type { RunPlace } from '@shared/ipc/scenarios.contract'

import { useScenariosStore } from '../scenarios.store'
import { invoke } from '../../../lib/ipc'

/**
 * Слова главному потоку: набранное, можно ли отправить и сама отправка. Ушли - поле чистое, а
 * слова встают в таймлайн с прогоном (событие scenarios:run); отказ (прогон уже кончился) -
 * уведомлением с кодом, набранное остаётся.
 */
export const useTell = (place: RunPlace, runId: string, isOver: boolean) => {
  const fail = useScenariosStore((state) => state.fail)
  const [text, setText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const canSend = !isOver && !isSending && text.trim().length > 0

  const send = async () => {
    if (!canSend) return

    setIsSending(true)

    try {
      const outcome = await invoke('scenarios:tell', {
        place,
        runId,
        text: text.trim(),
        images: [],
      })

      if (outcome.ok) setText('')
      else fail(outcome.code)
    } finally {
      setIsSending(false)
    }
  }

  return { text, setText, canSend, send }
}
