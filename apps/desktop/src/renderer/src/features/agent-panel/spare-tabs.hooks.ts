import { useRef, useEffect } from 'react'

import type { AgentPanelState } from '@shared/conversation'

import { useComposerStore } from './composer.store'
import { useConversationActions } from './conversation-actions.hooks'
import { sparesToDrop } from './spare-tabs.utils'

/**
 * Пустая вкладка, которую IDE открыла сама (запасная), уходит, как только в её проекте встаёт
 * настоящий разговор: агент открыл свой (`workstation`), человек вернул прошлый из истории или
 * завёл новый. Иначе «New chat» оставалась бы рядом, да ещё первой (просьба владельца). Во всех
 * проектах панели, а не только в видном: агент открывает разговоры и в фоновых. Черновик в поле
 * держит вкладку. Решение - здесь: черновики живут в окне, главный процесс о них не знает.
 */
export const useDropSpareTabs = (state: AgentPanelState | undefined) => {
  const { closeConversation } = useConversationActions()
  const drafts = useComposerStore((store) => store.drafts)
  // Закрытие уже попросили: ответ ещё не пришёл, второй раз не просим.
  const asked = useRef(new Set<string>())

  useEffect(() => {
    if (!state) return

    for (const id of sparesToDrop(state.conversations, (key) => Boolean(drafts[key]))) {
      if (asked.current.has(id)) continue

      asked.current.add(id)
      void closeConversation(id, false)
    }
  }, [state, drafts, closeConversation])
}
