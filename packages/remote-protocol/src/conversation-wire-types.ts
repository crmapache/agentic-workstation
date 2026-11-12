/**
 * Ответы команд разговора, которые читают больше одного поля: вопрос сбоку, поиск по
 * разговорам, предпросмотр и итог отката. Путей здесь нет: путь в тексте IDE заменяет метками
 * папок (placeholders.ts), как везде на проводе.
 */

/**
 * Чем кончился вопрос сбоку (conversation.aside): answered - ответ модели в text; empty - CLI
 * ответил заглушкой (text - его слова); cancelled - отменили; failed - не вышло (failure:
 * ended - разговор остановился, timeout - десять минут тишины, refused - CLI отказал, message -
 * его слова). notice - слова CLI о модели, ответившей вместо отказавшейся.
 */
export type AsideAnswerWire = {
  askId: string
  state: 'answered' | 'empty' | 'cancelled' | 'failed'
  text: string
  notice: string
  failure: 'ended' | 'timeout' | 'refused' | null
  message: string
  /** Ответ урезан под кадр - целиком он в карточке вопросов сбоку в IDE. */
  truncated: boolean
}

/**
 * Найденное сообщение. sessionId - разговор у провайдера (открыть - conversation.openHistory),
 * anchor - элемент ленты, где оно стоит. snippet - кусок вокруг совпадения, spans - где в нём
 * найденные слова, пары [начало, конец).
 */
export type SearchHitWire = {
  /** Чей это разговор: открыть его - conversation.openHistory у этого провайдера. */
  provider?: string | undefined
  sessionId: string
  anchor: string
  speaker: 'you' | 'claude'
  /** Когда сказано (мс); 0 - не известно. */
  at: number
  /** Имя разговора; пусто - без названия. */
  title: string
  /** Сколько сообщений в разговоре. */
  messages: number
  snippet: string
  spans: [number, number][]
  /** Почему модель указала сюда - только у находок поиска модели. */
  reason?: string | undefined
}

/**
 * Ответ набранного поиска: находки, сколько влезло в кадр; total - сколько нашлось всего,
 * conversations - в скольких разговорах; failed - поиск упал в IDE.
 */
export type SearchWire = {
  hits: SearchHitWire[]
  total: number
  conversations: number
  failed: boolean
}

/** Почему поиск модели не удался - кодом IDE (AiSearchFailure); detail - слова CLI. */
export type AiSearchWire =
  | { status: 'found'; hits: SearchHitWire[] }
  | { status: 'cancelled' }
  | { status: 'failed'; reason: string; detail: string }

/**
 * Что вернёт откат кода к сообщению: ready - файлы, которые с тех пор правили инструменты
 * агента (путями с метками папок), count - сколько всего; none - ничего не правилось; off - копии
 * файлов выключены в настройках Claude Code; notTracked и noCheckpoint - копии для этого
 * сообщения нет; unavailable - CLI не ответил (detail - его слова).
 */
export type RewindPreviewWire =
  | { state: 'ready'; files: string[]; count: number; insertions: number; deletions: number }
  | { state: 'none' | 'off' | 'notTracked' | 'noCheckpoint' }
  | { state: 'unavailable'; detail: string }

/**
 * Итог отката. prefill - текст отрезанного сообщения (телефон кладёт его в поле, как IDE);
 * filesFailed - разговор откатился, а файлы нет (слова CLI). Отказ - причиной IDE (busy, gone,
 * moved, midCall, notSaved, code, unsupported, noProcess, ended, other).
 */
export type RewindOutcomeWire =
  | { rewound: true; prefill: string; filesFailed: string | null }
  | { rewound: false; reason: string; detail: string }
