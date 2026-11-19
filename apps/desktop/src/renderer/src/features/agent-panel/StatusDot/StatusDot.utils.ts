import type { Conversation } from '@shared/conversation'

import type { DotState } from './StatusDot.types'

type DotSource = Pick<
  Conversation,
  'status' | 'outcome' | 'pending' | 'turnStartedAt' | 'backgroundWork'
>

/**
 * Работает ли агент: идёт ход или ждут фоновые субагенты. Это «running» точки и вопрос
 * перед закрытием вкладки клавишей.
 */
export const isWorking = (conversation: DotSource): boolean =>
  conversation.status !== 'idle' || conversation.backgroundWork

/**
 * Состояние точки вкладки. Сначала поломка: ход оборван против воли, и даже фоновая
 * вкладка должна это сказать. Потом - ждут человека: разрешение всегда, вопрос и план -
 * пока идёт ход; ошибка последним событием - только у фоновой (на открытой её и так
 * видно в ленте). Потом работа, потом «ход закончен».
 */
export const dotState = (conversation: DotSource, isActive: boolean): DotState => {
  if (conversation.outcome === 'crashed') return 'crashed'
  if (conversation.pending?.kind === 'permission') return 'attention'
  if (conversation.status === 'waiting' && conversation.turnStartedAt !== null) return 'attention'
  if (!isActive && conversation.outcome === 'error') return 'attention'
  if (isWorking(conversation)) return 'running'

  return conversation.outcome === 'none' ? 'idle' : 'done'
}

/**
 * Агент работает сам, человека не ждёт: вкладка разговора горит «running» (без поломки,
 * разрешения и вопроса). Этим же правилом вкладка проекта показывает, что в нём идёт работа.
 */
export const worksOnItsOwn = (conversation: DotSource): boolean =>
  dotState(conversation, true) === 'running'
