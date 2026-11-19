import type { ImageAttachment } from '@shared/conversation'
import { IMAGE_MEDIA_TYPES } from '@shared/conversation'
import type { FeedItem } from '@shared/conversation-feed'

import { splitEditorNote } from '../../agents/conversation/editor-note'
import { splitShellText } from '../../agents/shell/shell-text'
import { OpenCodeFeedBuilder } from './opencode-feed-builder'
import type { ToolContext } from './opencode-tools'

/** Шов форка: унаследованные сообщения - с общим началом id; после них - строка «ответвлено от». */
export type ReplaySeam = { inherited: string; title: string; sourceSessionId: string }

/** Страница журнала в ленте: элементы и картинки сообщений целиком (data URL) по id сообщения. */
export type ReplayedPage = { items: FeedItem[]; images: [messageId: string, urls: string[]][] }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (record: Record<string, unknown>, key: string): string => {
  const value = record[key]

  return typeof value === 'string' ? value : ''
}

/** Причина сбоя сообщения журнала (`error.message`). */
const errorOf = (message: Record<string, unknown>): string =>
  isRecord(message['error']) ? text(message['error'], 'message') : ''

const records = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(isRecord) : []

const timeOf = (message: Record<string, unknown>, key: 'created' | 'completed'): number => {
  const time = isRecord(message['time']) ? message['time'] : {}

  return typeof time[key] === 'number' ? time[key] : 0
}

const DATA_URL = /^data:([^;]+);base64,(.+)$/s

/** Картинка сообщения, которую панель отправила data URL; ссылка на файл - не картинка ленты. */
const imageOf = (file: Record<string, unknown>): ImageAttachment | null => {
  const [, type = '', data = ''] = DATA_URL.exec(text(file, 'uri')) ?? []
  const mediaType = IMAGE_MEDIA_TYPES.find((known) => known === type)

  return mediaType && data ? { mediaType, data } : null
}

/** id форкнутых сообщений - общее начало и номер (`msg_..._4`): начало - знак наследства. */
export const inheritedPrefix = (messageId: string): string => messageId.replace(/_\d+$/, '')

/**
 * Сообщение человека из журнала - в ленту, как живое: команды «!», ехавшие с ним, карточками
 * перед ним, заметка о редакторе - строкой под ним, картинки - миниатюрами.
 */
const replayUser = (
  builder: OpenCodeFeedBuilder,
  message: Record<string, unknown>,
  images: ReplayedPage['images'],
  steering: boolean,
) => {
  const id = text(message, 'id')
  const { text: words, editor } = splitEditorNote(text(message, 'text'))
  const { runs, text: own } = splitShellText(words)
  const attached = records(message['files'])
    .map(imageOf)
    .filter((image) => image !== null)

  for (const [index, run] of runs.entries()) {
    builder.putShell({
      kind: 'shell',
      id: `${id}:shell:${index}`,
      parentToolUseId: null,
      ...run,
      status: 'done',
      truncated: false,
    })
  }

  if (attached.length > 0) {
    images.push([id, attached.map((image) => `data:${image.mediaType};base64,${image.data}`)])
  }

  builder.addUserMessage(id, own, attached, steering, { editor: editor ?? undefined })
}

/** Сжатие из журнала: прошедшее - карточкой, не вышедшее - строкой ошибки. */
const replayCompaction = (builder: OpenCodeFeedBuilder, message: Record<string, unknown>) => {
  const status = text(message, 'status')

  if (status === 'running') return
  if (text(message, 'reason') === 'manual') builder.compactRequested()

  builder.compaction('started')
  builder.compaction(status === 'failed' ? 'failed' : 'ended', errorOf(message))
}

/** Ответ модели из журнала: размышления, текст и вызовы - по порядку его частей. */
const replayAssistant = (builder: OpenCodeFeedBuilder, message: Record<string, unknown>) => {
  const id = text(message, 'id')

  for (const [ordinal, part] of records(message['content']).entries()) {
    const key = { messageId: id, ordinal }
    const type = text(part, 'type')

    if (type === 'reasoning') builder.endText('thinking', key, text(part, 'text'))
    else if (type === 'text') builder.endText('assistant', key, text(part, 'text'))
    else if (type === 'tool') {
      const state = isRecord(part['state']) ? part['state'] : {}
      const status = text(state, 'status')
      const callId = text(part, 'id')

      builder.toolCalled(callId, text(part, 'name'), isRecord(state['input']) ? state['input'] : {})
      if (status === 'completed' || status === 'error') {
        builder.toolEnded(callId, state, status === 'error')
      }
    }
  }
}

/** Исход хода по отметке конца (`idle`): succeeded, failed или interrupted. */
const OUTCOMES = ['succeeded', 'failed', 'interrupted'] as const

const outcomeOf = (idle: Record<string, unknown>, failed: boolean) =>
  OUTCOMES.find((known) => known === idle['outcome']) ?? (failed ? 'failed' : 'succeeded')

/**
 * Страница журнала сессии (от старого к новому) - элементами ленты тем же сборщиком, что живой
 * ход: время - из журнала, строки хода и отметки - со своим префиксом страницы. Ход кончается
 * отметкой `idle` с исходом; сообщение человека посреди хода (до отметки) - доставка в идущий
 * ход, а не новый ход. Ход без отметки на последней странице (IDE закрылась посреди хода) -
 * прерванный; страница раньше обрывается не на конце хода - его конец на следующей. Форк:
 * после унаследованных сообщений - строка «ответвлено от».
 */
export const replayMessages = (
  messages: readonly Record<string, unknown>[],
  prefix: string,
  thumbnail: (image: ImageAttachment) => string,
  context: () => ToolContext,
  seam: ReplaySeam | null = null,
  latest = true,
): ReplayedPage => {
  let clock = 0
  const builder = new OpenCodeFeedBuilder(thumbnail, () => clock, context, prefix)
  const images: ReplayedPage['images'] = []
  let inTurn = false
  let error = ''

  const close = (status: 'succeeded' | 'failed' | 'interrupted') => {
    // Остановленный ход - строкой «прерван», без причины обрыва ошибкой.
    if (inTurn) builder.turnCompleted({ status, error: status === 'failed' ? error : '' })
    inTurn = false
    error = ''
  }

  for (const [index, message] of messages.entries()) {
    const type = text(message, 'type')

    clock = timeOf(message, 'created') || clock

    if (type === 'user') {
      if (!inTurn) builder.turnStarted()
      replayUser(builder, message, images, inTurn)
      inTurn = true
    } else if (type === 'assistant') {
      replayAssistant(builder, message)
      error = errorOf(message) || error
      clock = timeOf(message, 'completed') || clock
    } else if (type === 'idle') {
      error = errorOf(message) || error
      close(outcomeOf(message, error !== ''))
    } else if (type === 'compaction') {
      replayCompaction(builder, message)
    }

    const next = messages[index + 1]

    if (
      seam &&
      text(message, 'id').startsWith(seam.inherited) &&
      !(next && text(next, 'id').startsWith(seam.inherited))
    ) {
      close('succeeded')
      builder.addNotice('forked', seam.title, { sourceSessionId: seam.sourceSessionId })
    }
  }

  if (latest) close('interrupted')

  return { items: [...builder.items], images }
}
