import type { SearchHit, PaintedTerm, AiSearchStep, AiSearchFailure } from '@shared/claude-search'

/** Вкладки окна поиска: две области набранного запроса и вопрос модели. */
export type SearchTab = 'chat' | 'project' | 'ai'

/**
 * Что лента делает с выбранной находкой: loading - ещё идёт к ней (открывается разговор,
 * грузятся страницы выше), missing - не дотянуться, none - стоит на ней.
 */
export type CapsuleNote = 'none' | 'loading' | 'missing'

/**
 * Капсула в углу ленты после выбора находки: разговор (id вкладки), находки этого
 * разговора по порядку в нём, на какой стоим, слова, которые красить.
 */
export type SearchCapsuleState = {
  conversationId: string
  hits: SearchHit[]
  at: number
  note: CapsuleNote
  terms: PaintedTerm[]
}

/** Куда ленте прыгнуть: разговор (id вкладки) и находка; nonce - каждый прыжок новый. */
export type SearchFocus = { conversationId: string; hit: SearchHit; nonce: number }

/** Поиск модели: описание, идущий прогон, шаги, ответ или провал. */
export type AiRunState = {
  query: string
  runId: string | null
  startedAt: number
  steps: Omit<AiSearchStep, 'runId'>[]
  hits: SearchHit[]
  /** Модель ответила на описание на экране - «ничего» теперь значит «ничего не нашла». */
  answered: boolean
  failure: { reason: AiSearchFailure; detail: string } | null
}

/** Находки одного разговора под его заголовком (вкладка «All chats»). */
export type SearchGroup = {
  conversationId: string
  title: string
  /** Когда в разговоре говорили последний раз - по самим находкам. */
  at: number
  messages: number
  hits: SearchHit[]
}

/** Кусок строки находки: закрашенный или нет. */
export type SnippetPiece = { text: string; hit: boolean }
