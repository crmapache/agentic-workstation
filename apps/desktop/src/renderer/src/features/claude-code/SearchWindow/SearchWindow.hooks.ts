import { useState, useEffect, useCallback } from 'react'

import type { Conversation } from '@shared/claude'
import type { SearchHit, SearchCounts } from '@shared/claude-search'
import type { Project } from '@shared/workspace'

import { useClaudeActions } from '../claude-actions.hooks'
import { useClaudeCodeStore } from '../claude-code.store'
import { useClaudeState, useConversationFeed } from '../claude.queries'
import { useAskClaude, useSearchAnswer } from '../search.queries'
import { useSearchStore } from '../search.store'
import { chatHits, searchTabOfKey } from '../search.utils'
import { withMacKeys, isAltCommand } from '../../../lib/keys'
import type { WindowKeys, WindowKeyHandler } from './SearchWindow.types'

const NO_HITS: readonly SearchHit[] = []
const NO_COUNTS: SearchCounts = { chat: 0, project: 0, conversations: 0 }

/**
 * Данные и действия окна: ответ набранного запроса (счётчики обеих областей - всегда, и
 * на вкладке модели), прогон модели и выбор находки. Список рисуется только под той
 * вкладкой, для которой найден: после переключения до нового ответа он пуст, а не чужой.
 */
export const useSearchWindow = (project: Project, conversation: Conversation | null) => {
  const search = useSearchStore()
  const { openHistory } = useClaudeActions()
  const requestFocus = useClaudeCodeStore((store) => store.requestFocus)
  const ask = useAskClaude(project.id)
  const { data: feed } = useConversationFeed(conversation?.id)
  const query = search.query.trim()
  const answerQuery = useSearchAnswer(
    {
      projectId: project.id,
      sessionId: conversation?.sessionId ?? null,
      scope: search.tab === 'project' ? 'project' : 'chat',
      query,
      matchCase: search.matchCase,
      wholeWords: search.wholeWords,
    },
    search.isOpen && query !== '',
  )
  const answer = query ? answerQuery.data : undefined
  const isAi = search.tab === 'ai'
  const hits = isAi ? search.ai.hits : answer?.scope === search.tab ? answer.hits : NO_HITS

  const pick = async (hit: SearchHit) => {
    const known = conversation?.sessionId === hit.conversationId ? conversation.id : null
    const state = known ? null : await openHistory(project.id, hit.conversationId)
    const tabId =
      known ??
      state?.conversations.find(
        (item) => item.projectPath === project.rootPath && item.sessionId === hit.conversationId,
      )?.id

    if (!tabId) return

    search.showHit(
      tabId,
      hit,
      chatHits(hits, hit.conversationId),
      isAi ? [] : (answer?.terms ?? []),
    )
    requestFocus()
  }

  const dismiss = () => {
    search.closeSearch()
    requestFocus()
  }

  const close = () => {
    ask.cancel()
    search.resetSearch()
    requestFocus()
  }

  return {
    search,
    ask,
    hits,
    answer,
    counts: answer?.counts ?? NO_COUNTS,
    hasChat: (feed?.items.length ?? 0) > 0,
    isLoading: query !== '' && answerQuery.isFetching,
    retry: () => void answerQuery.refetch(),
    pick: (hit: SearchHit) => void pick(hit),
    dismiss,
    close,
  }
}

/**
 * Поиск кончается вместе с вкладкой, на которой стоит капсула (или над которой открыли
 * окно, пока капсулы нет), откуда бы её ни закрыли: тот же крестик.
 */
export const useEndWithTab = (onEnd: () => void) => {
  const { data: state } = useClaudeState()

  useEffect(() => {
    if (!state) return

    const { capsule, originId } = useSearchStore.getState()
    const watched = capsule?.conversationId ?? originId

    if (watched && !state.conversations.some((item) => item.id === watched)) onEnd()
  }, [state, onEnd])
}

/** Выбранная строка (для клавиш) и раскрытые сообщения - список, а не одно: два сравнивают. */
export const useHitSelection = (hits: readonly SearchHit[]) => {
  const [selected, setSelected] = useState(-1)
  const [seen, setSeen] = useState(hits)
  const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(new Set())

  // Список сменился под выбором - выбор с начала.
  if (seen !== hits) {
    setSeen(hits)
    setSelected(-1)
  }

  const unfold = useCallback(
    (uuid: string, open?: boolean) =>
      setUnfolded((current) => {
        const next = new Set(current)

        if (open ?? !next.has(uuid)) next.add(uuid)
        else next.delete(uuid)

        return next
      }),
    [],
  )

  return { selected, setSelected, unfolded, unfold }
}

const isField = (target: EventTarget) =>
  target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement

/**
 * Клавиши окна. Escape прячет окно и ничего больше. ⌥⌘1-3 - вкладки, ⌥⌘C и ⌥⌘W -
 * переключатели поля (по коду клавиши: с ⌥ мак печатает на C «ç»). Стрелки ходят по
 * списку (в многострочном описании - по его строкам), → раскрывает сообщение, ←
 * сворачивает, Enter открывает выбранное, а в описании для модели - отправляет
 * (⇧Enter и ⌘Enter - перенос строки).
 */
export const useWindowKeys = (keys: WindowKeys): WindowKeyHandler => {
  const search = useSearchStore()

  return (event) => {
    if (event.nativeEvent.isComposing) return

    // ⌥⌘ на маке, Alt на Windows: Ctrl+Alt там - AltGr (isAltCommand).
    const chord = isAltCommand(event) && !event.shiftKey
    const byNumber = chord ? searchTabOfKey(event.code) : undefined
    const typed = keys.tab !== 'ai'
    const pick = keys.selected >= 0 ? keys.hits[keys.selected] : undefined
    const act = byNumber
      ? () => search.setTab(byNumber)
      : chord && typed && event.code === 'KeyC'
        ? () => search.setMatchCase(!search.matchCase)
        : chord && typed && event.code === 'KeyW'
          ? () => search.setWholeWords(!search.wholeWords)
          : event.key === 'Escape'
            ? keys.onDismiss
            : null

    if (act) {
      event.preventDefault()
      event.stopPropagation()
      act()

      return
    }

    const inArea = event.target === keys.areaRef.current
    const busyField = isField(event.target) && (event.target as HTMLInputElement).value !== ''

    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && keys.hits.length > 0) {
      if (inArea && busyField) return

      event.preventDefault()
      keys.onSelect(
        Math.max(
          0,
          Math.min(keys.hits.length - 1, keys.selected + (event.key === 'ArrowDown' ? 1 : -1)),
        ),
      )
    } else if ((event.key === 'ArrowRight' || event.key === 'ArrowLeft') && pick && !busyField) {
      event.preventDefault()
      keys.onUnfold(pick.uuid, event.key === 'ArrowRight')
    } else if (event.key === 'Enter' && inArea) {
      if (event.shiftKey) return

      event.preventDefault()

      if (withMacKeys(event).metaKey) document.execCommand('insertText', false, '\n')
      else if (!keys.isRunning) keys.onRunAi()
    } else if (event.key === 'Enter' && pick) {
      event.preventDefault()
      keys.onPick(pick)
    }
  }
}
