import type { ImageAttachment } from '@shared/conversation'
import type {
  ChipKind,
  EditorRef,
  DraftQuote,
  DraftToken,
  MessageDraft,
} from '@shared/message-draft'

/** Черновик поля ввода: текст с вложениями вперемешку и цитаты над полем. */
export type ComposerDraft = { tokens: DraftToken[]; quotes: DraftQuote[] }

/** Сообщение к отправке: текст для CLI, картинки, куски для ленты и очереди, открытый файл. */
export type OutgoingMessage = {
  text: string
  images: ImageAttachment[]
  draft: MessageDraft
  editor: EditorRef | null
}

/** Чип с путём в проекте: файл, кусок файла из редактора, папка. Рисуется иконкой типа. */
export type PathChipKind = Extract<ChipKind, 'file' | 'ref' | 'dir'>
