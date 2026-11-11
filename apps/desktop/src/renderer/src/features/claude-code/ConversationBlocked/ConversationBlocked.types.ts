import type { ParseKeys } from 'i18next'
import type { LucideIcon } from 'lucide-react'

import type { Conversation, ConversationError } from '@shared/claude'
import type { Project } from '@shared/workspace'

import type { CardTone } from '@agentic-workstation/ui/Card.types'

export type ConversationBlockedProps = {
  project: Project
  conversation: Conversation
  error: ConversationError
}

/** Вид карточки для причины, по которой разговор стоит. */
export type BlockedView = {
  icon: LucideIcon
  tone: CardTone
  titleKey: ParseKeys
  textKey: ParseKeys
}
