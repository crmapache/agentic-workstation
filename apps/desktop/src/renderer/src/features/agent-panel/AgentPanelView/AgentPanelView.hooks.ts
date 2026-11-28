import type { FocusEvent, KeyboardEvent, SyntheticEvent } from 'react'
import { useRef, useState, useEffect } from 'react'

import type { Conversation, AgentPanelState } from '@shared/conversation'
import type { Project } from '@shared/workspace'

import { useConversationActions } from '../conversation-actions.hooks'
import type { PanelKey } from '../panel-keys.constants'
import { panelKeyOf, reachesPastMenu } from '../panel-keys.utils'
import { usePanelShown } from '../panel-shown.hooks'
import { usePanelCapabilities } from '../panel.queries'
import { usePanelStore, usePanelStoreApi } from '../panel.store'
import { useSearchStore } from '../search.store'
import { searchTabBeside } from '../search.utils'
import { useTabCallsStore } from '../tab-calls.store'
import { useCloseTab } from '../tab-close.hooks'
import { isClosableTab } from '../tab-close.utils'
import { tabBeside } from '../ConversationTabs/ConversationTabs.utils'
import { isWorking } from '../StatusDot/StatusDot.utils'
import { invoke } from '../../../lib/ipc'
import { useIpcEvent } from '../../../lib/ipc.hooks'
import { withMacKeys } from '../../../lib/keys'
import { LONE_MODIFIERS } from './AgentPanelView.constants'

/**
 * У проекта, на который смотрит человек, всегда есть разговор: пустая вкладка ничего не
 * поднимает (процесс CLI стартует на первом сообщении), зато под полем сразу видны модель и
 * режим. Кроме одного случая: человек сам закрыл последнюю - тогда экран «Let's start»
 * (NoChats). Появилась вкладка (⌘T, история, вернули закрытую) - отметка снимается. Пустую
 * заводит главный процесс и только если вкладок правда нет: разговор агента мог встать раньше,
 * чем окно о нём узнало. Она запасная и уйдёт, когда рядом встанет разговор (useDropSpareTabs).
 */
export const useEnsureConversation = (
  project: Project | null,
  state: AgentPanelState | undefined,
  count: number,
) => {
  const { ensureConversation } = useConversationActions()
  const emptied = usePanelStore((store) => Boolean(project && store.emptied[project.rootPath]))
  const setEmptied = usePanelStore((store) => store.setEmptied)
  const requested = useRef<string | null>(null)
  const needsOne = Boolean(project && state && state.cli !== 'missing' && count === 0 && !emptied)

  useEffect(() => {
    if (project && emptied && count > 0) setEmptied(project.rootPath, false)
  }, [project, emptied, count, setEmptied])

  useEffect(() => {
    if (!project || !needsOne) {
      requested.current = null

      return
    }

    // Один запрос на проект: двойной вызов эффекта завёл бы две вкладки.
    if (requested.current === project.id) return

    requested.current = project.id
    void ensureConversation(project.id)
  }, [project, needsOne, ensureConversation])
}

/**
 * Сообщает главному процессу, стоит ли фокус в панели: меню приложения отдаёт ⌘W панели
 * только тогда. Переход фокуса внутри панели - не уход; панель скрыли (выбрали соседнюю) -
 * уход, даже если blur не пришёл.
 */
export const usePanelFocus = () => {
  const reported = useRef(false)
  const isShown = usePanelShown()

  const report = (focused: boolean) => {
    if (reported.current === focused) return

    reported.current = focused
    invoke('claude:setPanelFocus', { focused }).catch((error: unknown) => {
      console.warn('[agent-panel] фокус панели не сообщён:', error)
    })
  }

  // Панель ушла с экрана вместе с фокусом.
  useEffect(
    () => () => {
      if (reported.current) void invoke('claude:setPanelFocus', { focused: false })
    },
    [],
  )

  useEffect(() => {
    if (isShown || !reported.current) return

    reported.current = false
    void invoke('claude:setPanelFocus', { focused: false })
  }, [isShown])

  const handleFocus = () => report(true)

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) report(false)
  }

  return { handleFocus, handleBlur }
}

/**
 * Клавиши панели, пока фокус в ней: ⌘T, ⇧⌘T, ⇧⌘], ⇧⌘[ и ⌘F (поиск по разговорам,
 * при открытом окне поиска ⇧⌘] и ⇧⌘[ листают его вкладки) слушает сама панель, ⌘W
 * приходит от меню приложения. Клавиша делает то, до чего дотянулась бы мышь: под
 * вопросом (модальный диалог) молчит, поверх бокового меню - тоже, кроме возврата
 * закрытой на экране истории. ⌘W на работающей вкладке спрашивает.
 */
export const usePanelKeys = (
  project: Project | null,
  conversations: readonly Conversation[],
  active: Conversation | null,
  closedCount: number,
) => {
  const { newConversation, reopenClosed, activateConversation } = useConversationActions()
  const closeTab = useCloseTab()
  const panelStore = usePanelStoreApi()
  const canSearch = usePanelCapabilities().search
  const isShown = usePanelShown()
  const [confirming, setConfirming] = useState<Conversation | null>(null)

  const run = (key: PanelKey): boolean => {
    const { menu, closeMenu, requestFocus } = panelStore.getState()

    if (!project || document.querySelector('dialog:modal')) return false
    if (menu.open && !reachesPastMenu(key, menu.screen, closedCount)) return false
    if (menu.open) closeMenu()

    const search = useSearchStore.getState()

    // Пока окно поиска открыто, клавиши соседней вкладки листают его вкладки по кругу.
    if (canSearch && search.isOpen && (key === 'nextTab' || key === 'previousTab')) {
      search.setTab(searchTabBeside(search.tab, key === 'nextTab' ? 1 : -1))

      return true
    }

    if (key === 'search' && canSearch) search.openSearch(active?.id ?? null)
    if (key === 'newTab') void newConversation(project.id).then(requestFocus)
    if (key === 'reopenTab') void reopenClosed(project.id).then(requestFocus)

    if (key === 'nextTab' || key === 'previousTab') {
      const ids = conversations.map((conversation) => conversation.id)
      const next = tabBeside(ids, active?.id ?? '', key === 'nextTab' ? 1 : -1)

      if (next) void activateConversation(next).then(requestFocus)
    }

    // Последнюю пустую вкладку ⌘W не закрывает, как и крестика у неё нет.
    if (key === 'closeTab' && active && isClosableTab(active, conversations.length)) {
      if (isWorking(active)) setConfirming(active)
      else void closeTab(active)
    }

    return true
  }

  // ⌘W от меню приходит всем смонтированным панелям - закрывает вкладку только видная.
  useIpcEvent('claude:panelKey', (command) => {
    if (command === 'closeTab' && isShown) run('closeTab')
  })

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const key = panelKeyOf(withMacKeys(event))

    if (key && run(key)) event.preventDefault()
  }

  const handleConfirm = () => {
    if (confirming) void closeTab(confirming)

    setConfirming(null)
  }

  const handleCancel = () => setConfirming(null)

  return { confirming, handleKeyDown, handleConfirm, handleCancel }
}

/**
 * Свет открытой вкладки, позвавшей в отсутствие человека, гаснет от первого действия в
 * панели: клик, клавиша, колесо. Не от одинокого модификатора (⌘Tab начинается с ⌘) и
 * не от шапки: клик по другой вкладке оставляет эту светиться уже фоновой.
 */
export const useAnswerOnAction = (active: Conversation | null) => {
  const handleAction = (event: SyntheticEvent) => {
    const { calls, answerCalls } = useTabCallsStore.getState()

    if (!active || !(active.id in calls)) return
    if ('key' in event && LONE_MODIFIERS.has(String(event.key))) return
    if ((event.target as HTMLElement).closest('[data-tab-strip]')) return

    answerCalls([active.id])
  }

  return handleAction
}
