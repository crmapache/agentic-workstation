/**
 * Поиск по разговорам панели Claude Code (как в ACC): набранный запрос по индексу слов
 * человека и модели в главном процессе и описанный - отдельному `claude -p`, который
 * читает разговоры как текст. Окно только рисует: что найдено и какие слова красить.
 */

import type { TitleSource } from './conversation'

/** Область набранного запроса: разговор вкладки или все разговоры проекта. */
export type SearchScope = 'chat' | 'project'

/** Кто сказал: человек или модель. */
export type SearchSpeaker = 'you' | 'claude'

/**
 * Найденное слово, как его красит лента (matchSpans). paint - сколько букв слова покрывает
 * запрос: набранное начало, основа или всё слово у опечатки. text - какими буквами они должны
 * стоять при Match case; whole - только слово само по себе, не часть camelCase (Whole words).
 */
export type PaintedTerm = {
  term: string
  paint: number
  text?: string | undefined
  whole?: boolean | undefined
}

/** Одно найденное сообщение и всё, чтобы показать его в списке и открыть в разговоре. */
export type SearchHit = {
  /** Разговор - id сессии CLI (имя транскрипта). */
  conversationId: string
  /** Имя строки транскрипта. */
  uuid: string
  /**
   * id элемента ленты, где стоит сообщение: у человека - uuid строки, у ответа -
   * `id сообщения:номер блока`, как их называет лента вживую и из транскрипта.
   */
  anchor: string
  speaker: SearchSpeaker
  /** Когда сказано (мс); 0 - строка не несла времени. */
  at: number
  /** Имя разговора; пусто - назвать нечем (окно пишет «без названия»). */
  title: string
  titleSource: TitleSource
  /** Сколько сообщений в разговоре - подпись под именем группы. */
  messages: number
  /** Кусок текста вокруг первого совпадения; многоточие там, где обрезано. */
  snippet: string
  /** Где в куске стоят найденные слова: пары [начало, конец). */
  spans: [number, number][]
  /** Текст сообщения (до потолка) - раскрытая строка и копирование. */
  text: string
  truncated: boolean
  /** Длина всего сообщения: раскрытая строка говорит, сколько из него на экране. */
  length: number
  /** Почему модель указала сюда - только у ответа «Ask Claude». */
  reason?: string | undefined
}

/** Сколько нашлось в разговоре вкладки и во всём проекте, и в скольких разговорах. */
export type SearchCounts = { chat: number; project: number; conversations: number }

/** Набранный запрос из окна. sessionId - разговор вкладки; null - вкладка ещё пуста. */
export type SearchFindRequest = {
  projectId: string
  sessionId: string | null
  scope: SearchScope
  query: string
  matchCase: boolean
  wholeWords: boolean
}

/**
 * Ответ на набранный запрос. Счётчики обеих областей - одним проходом, до обрезки списка:
 * их несут вкладки окна. total - сколько нашлось в запрошенной области; failed - поиск
 * упал (подробности в журнале главного процесса).
 */
export type SearchAnswer = {
  scope: SearchScope
  hits: SearchHit[]
  terms: PaintedTerm[]
  counts: SearchCounts
  total: number
  failed: boolean
}

/** Что модель делает по ходу поиска: искала слова, открыла разговор, читала список. */
export type AiSearchStepKind = 'grep' | 'read' | 'list' | 'other'

/** Шаг модели: вид и предмет (слова поиска, имя разговора), а не готовая фраза. */
export type AiSearchStep = { runId: string; kind: AiSearchStepKind; subject: string }

/**
 * Почему поиск модели не удался: CLI нет, CLI старый (нет --tools), разговоры не
 * подготовились, вышло время, CLI упал, ответ не разобрался.
 */
export type AiSearchFailure =
  'cli-not-found' | 'outdated' | 'corpus' | 'timeout' | 'failed' | 'answer'

/** Итог поиска модели. detail - слова самого CLI (вход, лимит), если он их сказал. */
export type AiSearchOutcome =
  | { status: 'found'; hits: SearchHit[] }
  | { status: 'cancelled' }
  | { status: 'failed'; reason: AiSearchFailure; detail: string }
