import { useRef, useState, useEffect } from 'react'

import type { Conversation } from '@shared/conversation'
import type { Project } from '@shared/workspace'

import { handoffsFor, useChatHandoffStore } from '../../state/chat-handoff.store'
import { usePanelProvider } from '../../state/panel-provider.context'
import { handoffStep } from './chat-handoff.utils'
import { useComposerStore } from './composer.store'
import { useConversationActions } from './conversation-actions.hooks'
import { hasContent, EMPTY_DRAFT } from './draft.utils'
import { usePanelShown } from './panel-shown.hooks'
import { usePanelStore } from './panel.store'

/**
 * Куски, переданные в чат из другой части окна («Send to Chat» в редакторе, «Implement» у
 * карточки трекера), - чипами туда, где стояла каретка поля активной вкладки, по порядку, каждый
 * своим шагом отмены, с фокусом в поле. Карточка из «Implement» начинает свой разговор: пустая
 * вкладка с пустым полем берёт её сама, иначе панель заводит новую (handoffStep). Чужой проект
 * ждёт своего: кусок взяли в одном проекте, а на экране уже другой - в чужой разговор он не
 * попадёт. Кусок для другого провайдера ждёт его панель. Берёт только видная панель провайдера
 * (её показывает отдающий): смонтированы все, и скрытая не должна забрать кусок.
 */
export const useChatHandoff = (project: Project | null, active: Conversation | null) => {
  const pending = useChatHandoffStore((store) => store.pending)
  const insertChip = usePanelStore((store) => store.insertChip)
  const emptied = usePanelStore((store) => Boolean(project && store.emptied[project.rootPath]))
  const { newConversation } = useConversationActions()
  const isShown = usePanelShown()
  const provider = usePanelProvider()
  // Разговор под кусок уже заводится: эффект, вызванный ещё раз до ответа, второй не заведёт.
  const creating = useRef(false)
  // Ответ пришёл - пересмотреть ждущие куски ещё раз, даже если вкладка не сменилась.
  const [created, setCreated] = useState(0)

  useEffect(() => {
    if (!isShown || !project || creating.current) return

    const mine = handoffsFor(pending, project.id, provider)
    const field = active ? useComposerStore.getState().drafts[active.id] : undefined
    const step = handoffStep(mine, {
      active,
      isFieldEmpty: !hasContent(field ?? EMPTY_DRAFT),
      emptied,
    })

    if (step.kind === 'create') {
      creating.current = true
      void newConversation(project.id).then((state) => {
        creating.current = false

        // Разговор не завёлся - карточка в открытую вкладку, а не новый заход по кругу.
        if (!state) {
          const fresh = mine.filter((handoff) => handoff.fresh)

          for (const handoff of useChatHandoffStore.getState().take(fresh)) {
            if (active) insertChip(active.id, handoff.chip)
          }
        }

        setCreated((count) => count + 1)
      })
    } else if (step.kind === 'insert' && active) {
      for (const handoff of useChatHandoffStore.getState().take(step.handoffs)) {
        insertChip(active.id, handoff.chip)
      }
    }
  }, [isShown, pending, project, active, emptied, provider, insertChip, newConversation, created])
}
