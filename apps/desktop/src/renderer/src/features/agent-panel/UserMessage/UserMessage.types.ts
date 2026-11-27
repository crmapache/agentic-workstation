import type { UserFeedItem } from '@shared/conversation-feed'
import type { DraftChip, EditorRef, DraftToken, MessageDraft } from '@shared/message-draft'

import type { PictureSource } from '../picture.types'

export type UserMessageProps = {
  item: UserFeedItem
}

export type MessageActionsProps = {
  item: UserFeedItem
  /** Сообщение кусками - для копии и возврата в поле. */
  draft: MessageDraft
}

export type MessageBodyProps = {
  tokens: readonly DraftToken[]
  /** id сообщения: вставленная картинка без файла берётся из его строки в транскрипте. */
  messageId: string
  /** Открыть картинку чипа крупно - оттуда же, откуда она показывается под курсором. */
  onOpenPicture: (source: PictureSource, chip: DraftChip) => void
}

/** Открытая крупно выбранная картинка и что на ней. */
export type OpenedPicture = { source: PictureSource; label: string }

export type PastedTextProps = {
  chip: DraftChip
  /** Последняя в сообщении: свёрнутая занимает всю ширину и показывает первые строки. */
  isBlock: boolean
}

export type EditorLineProps = {
  editor: EditorRef
}

export type SentChipProps = {
  chip: DraftChip
  /** id сообщения: цитата без записанного места ищется в ответах выше него. */
  messageId: string
  /** Картинка за чипом - превью под курсором; нет - чип не картинка или её не достать. */
  picture?: PictureSource | null | undefined
  /** Картинка открывается крупно. Не задано - чип картинки просто плашка с превью. */
  onOpen?: (() => void) | undefined
}
