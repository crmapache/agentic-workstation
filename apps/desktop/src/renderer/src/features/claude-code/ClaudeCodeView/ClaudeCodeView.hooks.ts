import type { FocusEvent, KeyboardEvent, SyntheticEvent } from 'react'
import { useRef, useState, useEffect } from 'react'

import type { ClaudeState, Conversation } from '@shared/claude'
import type { Project } from '@shared/workspace'

import { useClaudeActions } from '../claude-actions.hooks'
import { useClaudeCodeStore } from '../claude-code.store'
import type { PanelKey } from '../panel-keys.constants'
import { panelKeyOf, reachesPastMenu } from '../panel-keys.utils'
import { useSearchStore } from '../search.store'
import { searchTabBeside } from '../search.utils'
import { useCloseTab } from '../tab-close.hooks'
import { isClosableTab } from '../tab-close.utils'
import { tabBeside } from '../ConversationTabs/ConversationTabs.utils'
import { isWorking } from '../StatusDot/StatusDot.utils'
import { invoke } from '../../../lib/ipc'
import { useIpcEvent } from '../../../lib/ipc.hooks'
import { LONE_MODIFIERS } from './ClaudeCodeView.constants'

/**
 * У проекта всегда есть разговор: пустая вкладка ничего не поднимает (процесс CLI
 * стартует на первом сообщении), зато под полем сразу видны модель и режим. Кроме
 * одного случая: человек сам закрыл последнюю - тогда экран «Let's start» (NoChats).
 * Появилась вкладка (⌘T, история, вернули закрытую) - отметка снимается.
 */
export const useEnsureConversation = (
  project: Project | null,
  state: ClaudeState | undefined,
  count: number,
) => {
  const { newConversation } = useClaudeActions()
  const emptied = useClaudeCodeStore((store) => Boolean(project && store.emptied[project.rootPath]))
  const setEmptied = useClaudeCodeStore((store) => store.setEmptied)
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
    void newConversation(project.id)
  }, [project, needsOne, newConversation])
}

/**
 * Сообщает главному процессу, стоит ли фокус в панели: меню приложения отдаёт ⌘W панели
 * только тогда. Переход фокуса внутри панели - не уход.
 */
export const usePanelFocus = () => {
  const reported = useRef(false)

  const report = (focused: boolean) => {
    if (reported.current === focused) return

    reported.current = focused
    invoke('claude:setPanelFocus', { focused }).catch((error: unknown) => {
      console.warn('[claude-code] фокус панели не сообщён:', error)
    })
  }

  // Панель ушла с экрана вместе с фокусом.
  useEffect(
    () => () => {
      if (reported.current) void invoke('claude:setPanelFocus', { focused: false })
    },
    [],
  )

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
  const { newConversation, reopenClosed, activateConversation } = useClaudeActions()
  const closeTab = useCloseTab()
  const [confirming, setConfirming] = useState<Conversation | null>(null)

  const run = (key: PanelKey): boolean => {
    const { menu, closeMenu, requestFocus } = useClaudeCodeStore.getState()

    if (!project || document.querySelector('dialog:modal')) return false
    if (menu.open && !reachesPastMenu(key, menu.screen, closedCount)) return false
    if (menu.open) closeMenu()

    const search = useSearchStore.getState()

    // Пока окно поиска открыто, клавиши соседней вкладки листают его вкладки по кругу.
    if (search.isOpen && (key === 'nextTab' || key === 'previousTab')) {
      search.setTab(searchTabBeside(search.tab, key === 'nextTab' ? 1 : -1))

      return true
    }

    if (key === 'search') search.openSearch(active?.id ?? null)
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

  useIpcEvent('claude:panelKey', (command) => {
    if (command === 'closeTab') run('closeTab')
  })

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const key = panelKeyOf(event)

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
    const { calls, answerCalls } = useClaudeCodeStore.getState()

    if (!active || !(active.id in calls)) return
    if ('key' in event && LONE_MODIFIERS.has(String(event.key))) return
    if ((event.target as HTMLElement).closest('[data-tab-strip]')) return

    answerCalls([active.id])
  }

  return handleAction
}
