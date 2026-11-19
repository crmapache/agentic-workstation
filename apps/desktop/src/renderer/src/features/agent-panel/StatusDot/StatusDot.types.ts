import type { ConversationStatus } from '@shared/conversation'

/**
 * Что происходит во вкладке: ничего, идёт работа, ход закончен, ждут человека, процесс
 * умер. Кружок один, отличаются цвет и дыхание - состояние видно краем глаза.
 */
export type DotState = 'idle' | 'running' | 'done' | 'attention' | 'crashed'

export type StatusDotProps = {
  /** waiting - то же, что attention: строка «что сейчас» под лентой зовёт так. */
  status: DotState | Exclude<ConversationStatus, 'idle'>
  /** Подсказка словами; нет - точка молчит (рядом и так всё сказано). */
  hint?: string | undefined
}
