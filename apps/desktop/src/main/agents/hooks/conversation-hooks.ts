import type { ToolInput, ToolAction } from '@shared/conversation-feed'
import type { ProviderId } from '@shared/providers'

/** Сообщение человека перед уходом модели: его текст можно переписать. */
export type OutgoingContext = {
  conversationId: string
  provider: ProviderId
  projectPath: string
  text: string
}

/** Вопрос разрешения перед тем, как его увидит человек: его можно только отклонить. */
export type GuardContext = {
  conversationId: string
  provider: ProviderId
  projectPath: string
  toolName: string
  action: ToolAction
  input: ToolInput
  description: string
}

/** Ход кончился: чем, последний ответ модели, какие файлы правились. */
export type TurnEndContext = {
  conversationId: string
  provider: ProviderId
  projectPath: string
  outcome: 'done' | 'error' | 'interrupted'
  answer: string
  changedFiles: string[]
  durationMs: number | null
  costUsd: number | null
}

/**
 * Хуки разговоров всех провайдеров (ADR 0091): их держат расширения IDE. Ядро разговоров зовёт
 * их в трёх точках: отправка сообщения, вопрос разрешения, конец хода. Хук не держит разговор
 * дольше своего срока - срок и порядок держит тот, кто хуки реализует.
 */
export type ConversationHooks = {
  /** Новый текст сообщения; тот же - если переписывать нечего. */
  beforeSend: (context: OutgoingContext) => Promise<string>
  /** Причина отказа словами для модели; null - пусть решает человек, как обычно. */
  guard: (context: GuardContext) => Promise<string | null>
  turnEnded: (context: TurnEndContext) => void
  /** Есть ли хоть одна охрана: без неё вопрос разрешения встаёт сразу, как раньше. */
  guarding: () => boolean
  /** Есть ли хоть один хук отправки: без него сообщение уходит сразу, как раньше. */
  rewriting: () => boolean
}

/** Что знает ядро разговора: всё, кроме провайдера, - его добавляет панель. */
type Local<T> = Omit<T, 'provider'>

/** Хуки одной панели: провайдер уже подставлен. */
export type PanelHooks = {
  beforeSend: (context: Local<OutgoingContext>) => Promise<string>
  guard: (context: Local<GuardContext>) => Promise<string | null>
  turnEnded: (context: Local<TurnEndContext>) => void
  guarding: () => boolean
  rewriting: () => boolean
}

/**
 * Связка хуков: панели поднимаются раньше расширений, поэтому получают её пустой, а сборка
 * IDE вставляет хуки потом. Пустая связка ничего не меняет и не держит.
 */
export class ConversationHooksLink {
  target: ConversationHooks | null = null

  forPanel(provider: ProviderId): PanelHooks {
    return {
      beforeSend: (context) =>
        this.target
          ? this.target.beforeSend({ ...context, provider })
          : Promise.resolve(context.text),
      guard: (context) =>
        this.target ? this.target.guard({ ...context, provider }) : Promise.resolve(null),
      turnEnded: (context) => this.target?.turnEnded({ ...context, provider }),
      guarding: () => this.target?.guarding() ?? false,
      rewriting: () => this.target?.rewriting() ?? false,
    }
  }
}
