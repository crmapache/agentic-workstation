import { useRef, useState } from 'react'
import type { PointerEvent } from 'react'

import type { Conversation } from '@shared/conversation'

import { useComposerStore } from '../composer.store'
import { useConversationActions } from '../conversation-actions.hooks'
import { quotesOf } from '../draft.utils'
import { usePanelStore } from '../panel.store'
import { rowAt } from './QueueList.utils'

/**
 * Перестановка очереди за ручку - событиями указателя, а не HTML5 DnD (как в ACC):
 * отпустил над строкой - сообщение встаёт на её место. Переставляет главный процесс.
 */
export const useQueueDrag = (conversation: Conversation) => {
  const { moveQueued } = useConversationActions()
  const rows = useRef<(HTMLDivElement | null)[]>([])
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null)

  const grab = (from: number) => (event: PointerEvent<HTMLElement>) => {
    event.preventDefault()

    let over = from

    setDrag({ from, over })

    const handleMove = (move: globalThis.PointerEvent) => {
      const index = rowAt(rows.current, move.clientY)

      if (index < 0 || index === over) return

      over = index
      setDrag({ from, over })
    }

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      setDrag(null)

      const item = conversation.queue[from]

      if (item && over !== from) void moveQueued(conversation.id, item.id, over)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }

  const rowRef = (index: number) => (row: HTMLDivElement | null) => {
    rows.current[index] = row
  }

  return { drag, grab, rowRef }
}

/**
 * Вынуть сообщение в поле поправить: оно уходит из очереди (иначе выстрелило бы
 * недописанным) и въезжает в поле кусками - одним шагом отмены. Место помнится соседом:
 * Enter или Queue вернут его туда же, Send мышью отправит сразу.
 */
export const useTakeOut = (conversation: Conversation) => {
  const { takeQueued } = useConversationActions()
  const fillDraft = usePanelStore((store) => store.fillDraft)
  const setQueueEdit = useComposerStore((store) => store.setQueueEdit)

  return async (queuedId: string) => {
    const taken = await takeQueued(conversation.id, queuedId)

    if (!taken) return

    fillDraft(conversation.id, {
      tokens: taken.draft?.tokens ?? [{ kind: 'text', value: taken.text }],
      quotes: quotesOf(taken.draft?.quotes ?? []),
    })
    setQueueEdit(conversation.id, { before: taken.before })
  }
}
