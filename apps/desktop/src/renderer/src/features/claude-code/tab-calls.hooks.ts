import { useRef, useState, useEffect } from 'react'

import type { ClaudeState } from '@shared/claude'
import type { WorkspaceState } from '@shared/workspace'
import { useQueryClient } from '@tanstack/react-query'

import { useIpcEvent } from '../../lib/ipc.hooks'
import { useLayoutStore } from '../../state/layout.store'
import { QUERY_KEYS } from '../../state/query-keys'
import { useClaudeCodeStore } from './claude-code.store'
import { isWatched } from './sounds.utils'
import { callTone } from './ConversationTabs/ConversationTabs.utils'

/**
 * Свет вкладки, которая позвала (событие claude:call): фоновая светится цветом повода,
 * пока её не откроют; открытая - только если позвала, пока на неё не смотрели (окно не
 * впереди, панель закрыта), и гаснет от первого действия в панели. Звук решает так же
 * (sounds.hooks.ts). Закрытые вкладки свет уносят с собой. Подписка одна на окно.
 */
export const useTabCallsSync = () => {
  const queryClient = useQueryClient()

  useIpcEvent('claude:call', (call) => {
    const state = queryClient.getQueryData<ClaudeState>(QUERY_KEYS.claudeState)
    const workspace = queryClient.getQueryData<WorkspaceState>(QUERY_KEYS.workspace)
    const project = workspace?.projects.find((item) => item.id === workspace.activeProjectId)
    const { provider } = useLayoutStore.getState()
    const view = {
      activeConversationId: (project && state?.activeByProject[project.rootPath]) ?? null,
      panelShown: provider.isOpen && provider.activeViewId === 'claude-code',
      windowFocused: document.hasFocus() && document.visibilityState === 'visible',
    }

    if (isWatched(call, view)) return

    useClaudeCodeStore.getState().addCall(call.conversationId, {
      reason: call.reason,
      tone: callTone(call.reason),
      at: Date.now(),
    })
  })

  useIpcEvent('claude:state', (state) => {
    const { calls, answerCalls } = useClaudeCodeStore.getState()
    const open = new Set(state.conversations.map((conversation) => conversation.id))

    answerCalls(Object.keys(calls).filter((id) => !open.has(id)))
  })
}

/**
 * Открыли вкладку - её свет гаснет. Открытие - это смена выбранной вкладки, а не «на
 * экране»: выбранная, позвавшая, пока окно было не впереди, светится дальше, пока в
 * панели что-то не сделают (ClaudeCodeView).
 */
export const useAnswerOnOpen = (activeId: string | null) => {
  const answerCalls = useClaudeCodeStore((store) => store.answerCalls)
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
