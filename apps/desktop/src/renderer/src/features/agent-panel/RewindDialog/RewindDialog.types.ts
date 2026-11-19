import type { Conversation } from '@shared/conversation'
import type { RewindScope, RewindPreview, RewindRefusal } from '@shared/rewind'

import type { RewindTarget } from '../panel.types'

export type RewindDialogProps = {
  target: RewindTarget
  conversation: Conversation
}

/** Отказ для показа: причина и подробность от CLI; null у reason - сбой связи с IDE. */
export type ShownRefusal = { reason: RewindRefusal | null; detail: string }

export type RewindCodeProps = {
  /** Что тронет откат кода; undefined - ещё спрашиваем CLI. */
  code: RewindPreview | undefined
  /** Показывать ли файлы: при выбранном «только разговор» список ни к чему. */
  showFiles: boolean
}

export type RewindChoicesProps = {
  choice: RewindScope
  onChoice: (scope: RewindScope) => void
}
