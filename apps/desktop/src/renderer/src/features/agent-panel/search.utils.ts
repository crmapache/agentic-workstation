import type { TFunction } from 'i18next'

import type { SearchHit } from '@shared/claude-search'
import type { FeedItem } from '@shared/conversation-feed'

import { SEARCH_TABS } from './search.constants'
import type { SearchTab, SearchGroup, SnippetPiece } from './search.types'

/**
 * Правила поиска, которые ломаются молча, - отдельно от экранов, чтобы их держал тест
 * (окно - SearchWindow, капсула - SearchCapsule, прыжок и подсветка - search-feed.hooks).
 */

/** Вкладка на step от данной, по кругу: клавиши соседней вкладки панели, пока окно открыто. */
export const searchTabBeside = (tab: SearchTab, step: 1 | -1): SearchTab =>
  SEARCH_TABS[(SEARCH_TABS.indexOf(tab) + step + SEARCH_TABS.length) % SEARCH_TABS.length] ?? tab

/**
 * Вкладка по цифре с ⌥⌘ - по месту клавиши, а не по знаку: с ⌥ мак печатает на ней
 * другое, и цифровой блок значит то же.
 */
export const searchTabOfKey = (code: string): SearchTab | undefined => {
  const digit = /^(?:Digit|Numpad)([1-9])$/.exec(code)?.[1]

  return digit ? SEARCH_TABS[Number(digit) - 1] : undefined
}

/** Кусок находки - на закрашенное и нет, по местам, которые измерил главный процесс. */
export const snippetPieces = (
  snippet: string,
  spans: readonly [number, number][],
): SnippetPiece[] => {
  const pieces: SnippetPiece[] = []
  let at = 0

  for (const [start, end] of spans) {
    if (start < at || end <= start || end > snippet.length) continue
    if (start > at) pieces.push({ text: snippet.slice(at, start), hit: false })

    pieces.push({ text: snippet.slice(start, end), hit: true })
    at = end
  }

  if (at < snippet.length) pieces.push({ text: snippet.slice(at), hit: false })

  return pieces
}

/**
 * Находки по разговорам, лучшая группа первой. Без групп три строки про возвраты из
 * трёх разговоров читались бы одной кучей. Порядок - как пришли (по качеству), внутри
 * группы тоже; заголовок говорит, когда в разговоре говорили последний раз.
 */
export const groupByChat = (hits: readonly SearchHit[]): SearchGroup[] => {
  const groups: SearchGroup[] = []

  for (const hit of hits) {
    const known = groups.find((group) => group.conversationId === hit.conversationId)

    if (known) {
      known.hits.push(hit)
      known.at = Math.max(known.at, hit.at)
      continue
    }

    groups.push({
      conversationId: hit.conversationId,
      title: hit.title,
      at: hit.at,
      messages: hit.messages,
      hits: [hit],
    })
  }

  return groups
}

/**
 * Находки одного разговора в том порядке, в каком сообщения стоят в нём, - по ним ходят
 * стрелки капсулы. По времени, а не по качеству: «следующая» в разговоре - ниже. Только
 * этого разговора, как бы широко ни искали: стрелка, прыгающая в чужой, была бы списком
 * окна, только хуже. Без времени - в порядке, в каком нашлись.
 */
export const chatHits = (hits: readonly SearchHit[], conversationId: string): SearchHit[] =>
  hits.filter((hit) => hit.conversationId === conversationId).sort((a, b) => a.at - b.at)

const JUMPABLE = new Set<FeedItem['kind']>(['user', 'assistant', 'shell'])

/**
 * Строка ленты находки, если она загружена: по месту в ленте, которое назвал главный
 * процесс (у ответа - `id сообщения:номер блока`), иначе по имени строки транскрипта.
 */
export const rowForHit = (items: readonly FeedItem[], hit: SearchHit): string | undefined =>
  items.find((item) => JUMPABLE.has(item.kind) && (item.id === hit.anchor || item.id === hit.uuid))
    ?.id

const pad = (value: number) => String(value).padStart(2, '0')

/** Когда сказано: сегодня - «today 21:40», раньше - «Oct 14, 21:40». */
export const describeWhen = (t: TFunction, at: number, now: number): string => {
  const date = new Date(at)
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`

  if (date.toDateString() === new Date(now).toDateString())
    return t('agentPanel.search.today', { time })

  return `${date.toLocaleDateString('en', { month: 'short', day: 'numeric' })}, ${time}`
}

/**
 * Что говорит пустой список - причин пять. Ничего о запросе в пути: список показывает
 * прошлый ответ, пока идёт следующий, и строка идёт со списком, а о запросе говорит кольцо.
 */
export const emptyLine = (
  t: TFunction,
  tab: SearchTab,
  state: { query: string; hasChat: boolean; answered: boolean; aiAnswered: boolean },
): string => {
  if (tab === 'ai')
    return t(state.aiAnswered ? 'agentPanel.search.aiNothing' : 'agentPanel.search.aiEmpty')
  if (tab === 'chat' && !state.hasChat) return t('agentPanel.search.noChat')
  if (!state.query.trim() || !state.answered) return t('agentPanel.search.typeToSearch')

  return t(tab === 'chat' ? 'agentPanel.search.nothingHere' : 'agentPanel.search.nothing')
}

/** Подвал - только счёт: сколько нашлось, а по всем чатам - ещё и в скольких разговорах. */
export const footStatus = (
  t: TFunction,
  tab: SearchTab,
  state: { shown: number; total: number; conversations: number },
): string => {
  if (state.shown === 0) return ''
  if (tab === 'ai') return t('agentPanel.search.places', { count: state.shown })
  if (state.total > state.shown)
    return t('agentPanel.search.showing', { shown: state.shown, total: state.total })
  if (tab === 'project') {
    return t('agentPanel.search.inChats', {
      total: state.total,
      chats: t('agentPanel.search.chats', { count: state.conversations }),
    })
  }

  return t('agentPanel.search.results', { count: state.total })
}
