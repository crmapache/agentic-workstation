import type { ImageAttachment } from '@shared/conversation'
import type { FeedItem } from '@shared/conversation-feed'

import type { CodexTurn } from '../catalog/catalog-shapes'
import { CodexFeedBuilder } from './codex-feed-builder'
import type { CodexItem } from './codex-tools'
import type { CodexTurnEntry } from './codex-turn-log'
import { codexUserText } from './codex-user-text'

/**
 * Сообщение человека из журнала - в ленту, как живое: команды «!», ехавшие с ним, карточками
 * перед ним, заметка о редакторе - строкой под ним. id - тот, что панель дала сообщению
 * (`clientId`): по нему его закрепляли и откатывают.
 */
const replayUser = (
  builder: CodexFeedBuilder,
  item: CodexItem,
  steering: boolean,
  images: ReplayedPage['images'],
): string => {
  const user = codexUserText(item['content'])
  const id = typeof item['clientId'] === 'string' && item['clientId'] ? item['clientId'] : item.id

  for (const [index, run] of user.shellRuns.entries()) {
    builder.putShell({
      kind: 'shell',
      id: `${id}:shell:${index}`,
      parentToolUseId: null,
      ...run,
      status: 'done',
      truncated: false,
    })
  }

  if (user.images.length > 0) images.push([id, user.images.map(dataUrlOf)])

  if (user.text || user.images.length > 0) {
    builder.addUserMessage(id, user.text, user.images, steering, {
      editor: user.editor ?? undefined,
      voice: user.voice ?? undefined,
    })
  }

  return id
}

/** Шов форка: после хода `at` - строка «ответвлено от», выше неё - унаследованное. */
export type ReplaySeam = { at: string; title: string; sourceSessionId: string }

/**
 * Страница истории: элементы ленты, ходы с сообщениями, которыми они начаты, и картинки
 * сообщений целиком (data URL) - лента несёт только миниатюры.
 */
export type ReplayedPage = {
  items: FeedItem[]
  log: CodexTurnEntry[]
  images: [messageId: string, urls: string[]][]
}

const dataUrlOf = (image: ImageAttachment) => `data:${image.mediaType};base64,${image.data}`

/**
 * Прошлые ходы (от старого к новому) - в элементы ленты тем же сборщиком, что живой ход: время
 * хода - из журнала, строки хода и отметки - со своим префиксом страницы, чтобы не совпасть с
 * живыми. Ход, оставшийся «идущим» (IDE закрылась посреди него), - прерванный: сейчас он не идёт.
 */
export const replayTurns = (
  turns: readonly CodexTurn[],
  prefix: string,
  thumbnail: (image: ImageAttachment) => string,
  seam: ReplaySeam | null = null,
): ReplayedPage => {
  let clock = 0
  const builder = new CodexFeedBuilder(thumbnail, () => clock, prefix)
  const log: CodexTurnEntry[] = []
  const images: ReplayedPage['images'] = []

  for (const turn of turns) {
    let messageId = ''

    clock = turn.startedAt
    builder.turnStarted()

    for (const item of turn.items) {
      if (item.type === 'userMessage') {
        const id = replayUser(builder, item, messageId !== '', images)

        messageId ||= id
      } else {
        builder.putItem(item, null, true)
      }
    }

    clock = turn.completedAt || turn.startedAt
    builder.turnCompleted({
      status: turn.status === 'inProgress' ? 'interrupted' : turn.status,
      error: turn.error,
    })
    log.push({ turnId: turn.id, messageId })

    if (seam && turn.id === seam.at) {
      builder.addNotice('forked', seam.title, { sourceSessionId: seam.sourceSessionId })
    }
  }

  return { items: [...builder.items], log, images }
}
