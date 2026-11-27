import { use, createContext } from 'react'

import type { PendingRequest } from '@shared/conversation'
import type { DraftChip } from '@shared/message-draft'

/**
 * Чья это лента: разговор (для действий) и папка проекта (пути от корня, открытие файлов).
 * readOnly - лента не панели, а журнал (шаг сценария, ConversationLog): разговор не наш, и
 * откат, «вернуть в поле», булавки и откат файлов хода в нём били бы мимо. author - чья
 * подпись у сообщений со стороны человека, если пишет не он (главный поток прогона).
 */
type FeedScope = {
  conversationId: string
  projectPath: string
  readOnly?: boolean | undefined
  author?: string | undefined
}

/**
 * Лента кладёт сюда свой разговор, строки берут его отсюда, а не пропсом через каждую
 * обёртку: так строка перерисовывается по своим данным, а не по смене пропсов.
 */
export const FeedScopeContext = createContext<FeedScope>({ conversationId: '', projectPath: '' })

export const useFeedScope = () => use(FeedScopeContext)

/** Лента прыгает к месту, откуда взята цитата сообщения messageId. */
export type QuoteJump = (messageId: string, chip: DraftChip) => void

/**
 * Прыжок к месту цитаты - для чипа цитаты в сообщении. null - у ленты нет своей прокрутки
 * (журнал шага сценария): чип там просто плашка. Отдельно от FeedScope: прыжок стабилен,
 * а смена контекста перерисовывала бы все строки.
 */
export const QuoteJumpContext = createContext<QuoteJump | null>(null)

export const useJumpToQuote = () => use(QuoteJumpContext)

/**
 * Вопрос, на котором стоит ход (разрешение, план); null - никто не ждёт. Отдельно от
 * FeedScope: меняется на каждом вопросе, и перерисовывать из-за этого все строки
 * незачем - только карточки вызовов и плана.
 */
export const PendingContext = createContext<PendingRequest | null>(null)

export const usePendingRequest = () => use(PendingContext)

/** Вызов, который ждёт разрешения человека, - его id; null - никто. */
export const useAwaitingTool = (): string | null => {
  const pending = use(PendingContext)

  return pending?.kind === 'permission' ? pending.toolUseId : null
}
