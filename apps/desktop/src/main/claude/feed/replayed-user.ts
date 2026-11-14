import type { ImageAttachment } from '@shared/claude'
import type { FeedItem, FeedImage, ToolFeedItem } from '@shared/claude-feed'

import type { CliMessage } from '../cli/cli-messages'
import { isRecord, recordField, stringField } from '../cli/cli-messages'
import { parseCarryOn } from '../panel/carry-on-words'
import { queuedPrompt } from './queued-prompt'
import type { UserText } from './user-text'
import { userTextOf, INTERRUPT_MARKER } from './user-text'

/** Элементы ленты из сообщения человека; messageId - id сообщения, если оно встало. */
type ReplayedItems = { kind: 'items'; items: FeedItem[]; messageId: string | null }

/** Что дала строка человека из транскрипта: отметку остановки или элементы ленты. */
export type ReplayedUser = { kind: 'interrupted' } | ReplayedItems

/** Миниатюры картинок сообщения - их делает главный процесс (Electron). */
type Thumbnails = (images: readonly ImageAttachment[]) => FeedImage[]

/** Сообщение человека из транскрипта: его слова и картинки, id и место в ходе. */
type ReplayedMessage = { user: UserText; id: string; at: number; steering: boolean }

/**
 * Сообщение человека в элементы ленты: команды «!», уехавшие модели вместе с ним (в ленте
 * они стояли перед ним), и само сообщение.
 */
const userItems = (
  { user, id, at, steering }: ReplayedMessage,
  thumbnails: Thumbnails,
): ReplayedItems => {
  const items: FeedItem[] = user.shellRuns.map((run, index) => ({
    kind: 'shell',
    id: `${id}:shell:${index}`,
    parentToolUseId: null,
    ...run,
    status: 'done',
    truncated: false,
  }))

  if (!user.text && user.images.length === 0) return { kind: 'items', items, messageId: null }

  // Слова панели (продолжение оборванной работы) узнаются по тегу: карточка PANEL, а не YOU.
  const carried = parseCarryOn(user.text)

  items.push({
    kind: 'user',
    id,
    parentToolUseId: null,
    text: carried ? carried.words : user.text,
    time: at,
    images: thumbnails(user.images),
    steering,
    ...(carried && { auto: carried.reason }),
  })

  return { kind: 'items', items, messageId: id }
}

/**
 * Строка человека из транскрипта - в элементы ленты. Служебное (мета, сводка компакта,
 * строки субагента) - null.
 */
export const replayedUser = (
  message: CliMessage,
  at: number,
  thumbnails: Thumbnails,
  fallbackId: () => string,
): ReplayedUser | null => {
  if (message['isMeta'] === true || message['isCompactSummary'] === true) return null
  if (message['isSidechain'] === true) return null

  const parent = message['parent_tool_use_id']

  if (typeof parent === 'string' && parent) return null

  const user = userTextOf(recordField(message, 'message')['content'])

  if (!user) return null
  if (INTERRUPT_MARKER.test(user.text)) return { kind: 'interrupted' }

  const id = stringField(message, 'uuid') || fallbackId()

  return userItems({ user, id, at, steering: false }, thumbnails)
}

/**
 * Написанное посреди хода - транскрипт хранит его вложением очереди (queued-prompt.ts) - в
 * элементы ленты под нашим uuid, как в живой ленте: без этого после перезапуска оно
 * пропадало из разговора. Не такое вложение - null.
 */
export const replayedQueued = (
  message: CliMessage,
  at: number,
  thumbnails: Thumbnails,
): ReplayedItems | null => {
  if (message['isSidechain'] === true) return null

  const queued = queuedPrompt(message)
  const user = queued ? userTextOf(queued.content) : null

  return queued && user ? userItems({ user, id: queued.id, at, steering: true }, thumbnails) : null
}

/** Текст блоков сообщения модели - у ошибки входа или лимита CLI пишет его текстом. */
export const assistantText = (body: Record<string, unknown>): string => {
  const content = body['content']

  return Array.isArray(content)
    ? content
        .filter(isRecord)
        .map((block) => stringField(block, 'text'))
        .join('\n')
    : ''
}

/** Такой же текст ошибки уже стоит в ленте этого хода: второй раз он ничего не говорит. */
export const saidInTurn = (items: readonly FeedItem[], detail: string): boolean => {
  const lastUser = items.findLastIndex((item) => item.kind === 'user')

  return items
    .slice(Math.max(0, lastUser))
    .some((item) => item.kind === 'notice' && item.detail.trim() === detail.trim())
}

/**
 * Вопрос, на котором оборвался разговор: последний вызов AskUserQuestion основного
 * потока без ответа, и после него ни сообщения человека, ни отметки остановки.
 */
export const leftQuestion = (items: readonly FeedItem[]): ToolFeedItem | null => {
  const last = items.findLast((item) => item.parentToolUseId === null && item.kind !== 'thinking')

  return last?.kind === 'tool' && last.name === 'AskUserQuestion' && last.status === 'running'
    ? last
    : null
}
