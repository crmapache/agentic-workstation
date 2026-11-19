import type { Conversation } from '@shared/conversation'
import type { AsideExchange } from '@shared/panel-extras'

export type SideQuestionProps = {
  conversation: Conversation
}

export type AsideExchangeProps = {
  exchange: AsideExchange
  onCancel: (askId: string) => void
  /** Спросить то же снова на месте вопроса, который кончился без ответа. */
  onAskAgain: (exchange: AsideExchange) => void
}

export type AsideAskingProps = {
  exchange: AsideExchange
  onCancel: (askId: string) => void
}

export type AsideUnansweredProps = {
  exchange: AsideExchange
  onAskAgain: (exchange: AsideExchange) => void
}
