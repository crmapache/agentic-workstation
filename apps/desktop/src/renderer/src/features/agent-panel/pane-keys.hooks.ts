import { use, useRef, useState, useEffect, useLayoutEffect } from 'react'
import type { KeyboardEvent } from 'react'

import type { Conversation } from '@shared/conversation'
import type { Project } from '@shared/workspace'
import { useQueryClient } from '@tanstack/react-query'

import { asideOpen, useAsideActions } from './aside.queries'
import { useComposerStore } from './composer.store'
import { useConversationActions } from './conversation-actions.hooks'
import { hasContent, EMPTY_DRAFT } from './draft.utils'
import { useModeAvailability } from './modes.hooks'
import type { PaneKeys, PaneKeyListener } from './pane-keys.context'
import { PaneKeysContext } from './pane-keys.context'
import { nextMode, fromOverlay } from './pane-keys.utils'
import { usePanelCapabilities } from './panel.queries'

/**
 * Клавиши панели разговора по порядку ACC: сначала карточки над полем (цифры, Enter),
 * потом Esc - Stop, только если идёт ход (подсказку поля Esc закрывает раньше, сам), и
 * Shift+Tab - следующий режим с пропуском недоступных. Пока метод ввода собирает
 * символ, клавиши его.
 */
export const usePaneKeys = (
  project: Project,
  conversation: Conversation | null,
  draftKey: string,
) => {
  const [listeners] = useState(() => new Set<PaneKeyListener>())
  const [keys] = useState<PaneKeys>(() => ({
    register: (listener) => {
      listeners.add(listener)

      return () => listeners.delete(listener)
    },
  }))
  const { interrupt, setOptions } = useConversationActions()
  const queryClient = useQueryClient()
  const asides = useAsideActions()
  const available = useModeAvailability(project.id, conversation)
  const capabilities = usePanelCapabilities()
  const isRunning = conversation !== null && conversation.status !== 'idle'

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const native = event.nativeEvent

    if (native.isComposing) return

    const composerEmpty = !hasContent(useComposerStore.getState().drafts[draftKey] ?? EMPTY_DRAFT)

    for (const listener of [...listeners]) {
      if (listener(native, composerEmpty)) return
    }

    if (event.key === 'Escape' && !event.defaultPrevented && !fromOverlay(event.target)) {
      // Карточку вопроса сбоку Esc закрывает раньше, чем останавливает ход: вопрос задали,
      // чтобы работу не останавливать (как в ACC).
      if (conversation && asideOpen(queryClient, conversation.id)) {
        event.preventDefault()

        return void asides.show(conversation.id, false)
      }

      if (!isRunning || !conversation) return

      event.preventDefault()
      void interrupt(conversation.id)
    } else if (event.key === 'Tab' && event.shiftKey && conversation) {
      event.preventDefault()
      void setOptions(conversation.id, {
        permissionMode: nextMode(conversation.permissionMode, available, capabilities.modes),
      })
    }
  }

  return { keys, handleKeyDown }
}

/**
 * Слушать клавиши панели, пока компонент на экране (карточка разрешения или вопроса).
 * Последний слушатель в рендере - всегда актуальный, подписка одна.
 */
export const usePaneKey = (listener: PaneKeyListener, enabled = true) => {
  const keys = use(PaneKeysContext)
  const latest = useRef(listener)

  useLayoutEffect(() => {
    latest.current = listener
  })

  useEffect(() => {
    if (!keys || !enabled) return

    return keys.register((event, composerEmpty) => latest.current(event, composerEmpty))
  }, [keys, enabled])
}
