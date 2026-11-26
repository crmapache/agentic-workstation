import type { ParseKeys } from 'i18next'
import type { LucideIcon } from 'lucide-react'

import type { Conversation, ConversationError } from '@shared/conversation'

export type ConversationBlockedProps = {
  conversation: Conversation
  error: ConversationError
}

/** Вид карточки для причины, по которой разговор стоит. */
export type BlockedView = {
  icon: LucideIcon
  titleKey: ParseKeys
  textKey: ParseKeys
}
