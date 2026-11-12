import type { FeedPatch, ConversationFeed } from '@shared/claude-feed'
import type { AiJobActivity } from '@shared/connector-spec'

/**
 * Чем кончился ход разговора: ответ по схеме, остановка (нами - человеком или по времени) или
 * сбой - CLI нет, процесс упал, CLI сказал ошибку.
 */
export type AiChatTurnEnd =
  | { kind: 'answer'; output: unknown }
  | { kind: 'stopped' }
  | { kind: 'failed'; error: 'cli-missing' | 'failed'; detail: string }

export type AiChatEvents = {
  /** Лента поменялась - пачка для окна. */
  onFeed: (patch: FeedPatch) => void
  /** Ход начался сам: слова человека, которые не успели в прошлый ход. */
  onTurnStarted: () => void
  /** Разговор записан на диск: после перезапуска IDE его можно продолжить. */
  onSaved: () => void
  onActivity: (activity: AiJobActivity) => void
  onTurnEnded: (end: AiChatTurnEnd) => void
}

export type AiChatOptions = {
  /** id разговора CLI: под ним он поднимается и продолжается после перерыва. */
  sessionId: string
  /** Разговор уже был: продолжить его транскрипт, а не начинать новый. */
  resume: boolean
  /** Правила для ИИ - в системный промпт, человек их в ленте не видит. */
  instructions: string
  /** JSON Schema ответа каждого хода. */
  schema: object
}

/**
 * Разговор с ИИ о новом коннекторе (ADR 0050). Модуль коннекторов не знает, кто отвечает:
 * провайдер даёт OpenAiChat, как раньше давал «спросить по схеме». Процесс провайдера между
 * ходами может уснуть - следующее сообщение поднимет его заново поверх того же разговора.
 */
export type AiChat = {
  /** Слова человека: посреди хода ИИ подхватит их, вне хода - начнёт новый. */
  tell: (text: string) => void
  /** Остановить идущий ход; конец придёт событием onTurnEnded со stopped. */
  stop: () => void
  /** Лента целиком (прошлые ходы - с диска); earlier - ещё страница выше. */
  feed: (earlier: boolean) => Promise<ConversationFeed>
  /** Погасить процесс и забыть ленту. */
  dispose: () => void
}

export type OpenAiChat = (options: AiChatOptions, events: AiChatEvents) => AiChat
