import { useRef, useState, useEffect } from 'react'

import { useQueryClient } from '@tanstack/react-query'

import { useIpcEvent } from '../../lib/ipc.hooks'
import { currentCallView } from './call-view'
import { isWatched } from './sounds.utils'
import { useTabCallsStore } from './tab-calls.store'
import { callTone } from './ConversationTabs/ConversationTabs.utils'

/**
 * Свет вкладки, которая позвала (событие agent:call): фоновая светится цветом повода,
 * пока её не откроют; открытая - только если позвала, пока на неё не смотрели (окно не
 * впереди, панель закрыта), и гаснет от первого действия в панели. Звук решает так же
 * (sounds.hooks.ts). Закрытые вкладки свет уносят с собой. Подписка одна на окно.
 */
export const useTabCallsSync = () => {
  const queryClient = useQueryClient()

  useIpcEvent('agent:call', ({ provider: owner, call }) => {
    if (isWatched(call, currentCallView(queryClient, owner))) return

    useTabCallsStore.getState().addCall(call.conversationId, {
      reason: call.reason,
      tone: callTone(call.reason),
      at: Date.now(),
      provider: owner,
    })
  })

  // Закрытые вкладки уносят свет - вкладки той панели, чьё это состояние: у другой панели
  // свои разговоры, и её свет так не гасится.
  useIpcEvent('agent:state', ({ provider, state }) => {
    const { calls, answerCalls } = useTabCallsStore.getState()
    const open = new Set(state.conversations.map((conversation) => conversation.id))
    const gone = Object.entries(calls).filter(
      ([id, call]) => call.provider === provider && !open.has(id),
    )

    answerCalls(gone.map(([id]) => id))
  })
}

/**
 * Открыли вкладку - её свет гаснет. Открытие - это смена выбранной вкладки, а не «на
 * экране»: выбранная, позвавшая, пока окно было не впереди, светится дальше, пока в
 * панели что-то не сделают (AgentPanelView).
 */
export const useAnswerOnOpen = (activeId: string | null) => {
  const answerCalls = useTabCallsStore((store) => store.answerCalls)
  const shown = useRef(activeId)

  useEffect(() => {
    if (shown.current === activeId) return

    shown.current = activeId

    if (activeId) answerCalls([activeId])
  }, [activeId, answerCalls])
}

/**
 * Пора ли свету замереть: 30 секунд в окне ни мыши, ни клавиш. Будит движение, клавиша
 * и новый зов (stir) - на полосу смотрят по звуку, с мышью в редакторе. Цвет остаётся
 * всегда: «какая это была» отвечает он, движение только зовёт взгляд.
 */
export const useResting = (restAfterMs: number, stir: number, enabled: boolean): boolean => {
  const [resting, setResting] = useState(false)
  const stirredAt = useRef(0)

  useEffect(() => {
    if (!enabled) return

    let timer = 0
    const check = () => {
      const left = stirredAt.current + restAfterMs - Date.now()

      if (left > 0) timer = window.setTimeout(check, left)
      else setResting(true)
    }
    const wake = () => {
      stirredAt.current = Date.now()
      setResting(false)
      window.clearTimeout(timer)
      timer = window.setTimeout(check, restAfterMs)
    }

    wake()
    window.addEventListener('pointermove', wake, { passive: true })
    window.addEventListener('keydown', wake)

    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointermove', wake)
      window.removeEventListener('keydown', wake)
    }
  }, [enabled, restAfterMs, stir])

  return enabled && resting
}
