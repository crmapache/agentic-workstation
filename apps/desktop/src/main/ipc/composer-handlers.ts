import type { BrowserWindow } from 'electron'

import type { PicturePlace } from '@shared/claude-draft'

import type { ClaudeService } from '../claude/claude-service'
import type { WorkspaceService } from '../workspace/workspace-service'
import type { PictureHost } from '../claude/images/picture-reader'
import { readPicture } from '../claude/images/picture-reader'
import { assertUuid, assertIndex } from './claude-validate'
import type { InvokeHandlers } from './handle'
import { assertString } from './validate'
import { projectRootOf } from './workspace-handlers'

/** Каналы поля ввода: их обработчики здесь, а не в claude-handlers.ts. */
export type ComposerChannels =
  | 'claude:takeQueued'
  | 'claude:moveQueued'
  | 'claude:listCommands'
  | 'claude:pickAttachments'
  | 'claude:describePaths'
  | 'claude:savePasted'
  | 'claude:readPicture'

/** Потолки того, что окно присылает полю: пути и имена - не файлы. */
const MAX_PATHS = 100
const MAX_NAME_CHARS = 500
/** base64 вставленного файла: 50 МБ байтов - это 4/3 от них символами. */
const MAX_PASTED_CHARS = 70_000_000

const strings = (value: unknown, name: string, max: number, maxChars: number): string[] => {
  if (!Array.isArray(value) || value.length > max) throw new Error(`Недопустимый список ${name}`)

  return value.map((item) => {
    assertString(item, name)

    if (item.length > maxChars) throw new Error(`Слишком длинное значение в ${name}`)

    return item
  })
}

/** Место картинки из окна: путь - строкой с потолком, id - как везде, номер - картинки. */
const parsePicturePlace = (value: unknown): PicturePlace => {
  const record = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >
  const { kind, path, conversationId, queuedId, messageId, image } = record

  if (kind === 'file') {
    assertString(path, 'path')

    if (path.length > 4_096) throw new Error('Слишком длинный путь')

    return { kind, path }
  }

  assertString(conversationId, 'conversationId')

  if (kind === 'queued') {
    return {
      kind,
      conversationId,
      queuedId: assertUuid(queuedId, 'queuedId'),
      image: assertIndex(image),
    }
  }

  if (kind === 'said') {
    return {
      kind,
      conversationId,
      messageId: assertUuid(messageId, 'messageId'),
      image: assertIndex(image),
    }
  }

  throw new Error('Недопустимое место картинки')
}

/** Где главный процесс берёт картинки сообщений: очередь вкладки и её транскрипт. */
const pictureHost = (claude: ClaudeService): PictureHost => ({
  queued: (conversationId, queuedId) =>
    claude.runtime(conversationId).outbox.queueImages.get(queuedId) ?? [],
  said: (conversationId, messageId, image) =>
    claude.actions.getImage(conversationId, messageId, image),
})

/**
 * Каналы поля ввода: очередь (вынуть, переставить), команды с диска и вложения. Проект -
 * только открытый, разговор - по id, остальное проверяется здесь.
 */
export const createComposerHandlers = (
  workspace: WorkspaceService,
  claude: ClaudeService,
  getWindow: () => BrowserWindow | null,
): Pick<InvokeHandlers, ComposerChannels> => {
  const root = (projectId: unknown) => projectRootOf(workspace, projectId)
  const runtime = (conversationId: unknown, queuedId: unknown) => {
    assertString(conversationId, 'conversationId')
    assertString(queuedId, 'queuedId')

    return { outbox: claude.runtime(conversationId).outbox, queuedId }
  }

  return {
    'claude:takeQueued': ({ conversationId, queuedId }) => {
      const target = runtime(conversationId, queuedId)
      const taken = target.outbox.takeOut(target.queuedId)

      return { state: claude.getState(), taken }
    },
    'claude:moveQueued': ({ conversationId, queuedId, toIndex }) => {
      const target = runtime(conversationId, queuedId)

      if (typeof toIndex !== 'number' || !Number.isInteger(toIndex) || toIndex < 0) {
        throw new Error('Недопустимое место в очереди')
      }

      return claude.actions.moveQueued(conversationId, target.queuedId, toIndex)
    },
    'claude:listCommands': ({ projectId }) => claude.composer.commands(root(projectId)),
    'claude:pickAttachments': ({ projectId }) => claude.composer.pick(getWindow(), root(projectId)),
    'claude:describePaths': ({ projectId, paths }) =>
      claude.composer.describe(root(projectId), strings(paths, 'paths', MAX_PATHS, 4_096)),
    'claude:savePasted': ({ name, data }) => {
      assertString(name, 'name')
      assertString(data, 'data')

      if (name.length > MAX_NAME_CHARS || data.length > MAX_PASTED_CHARS) {
        throw new Error('Недопустимый файл')
      }

      return claude.composer.savePasted(name, data)
    },
    // Путь из чипа читается только картинкой и не больше потолка (picture-reader.ts).
    'claude:readPicture': ({ projectId, place, whole }) =>
      readPicture(pictureHost(claude), root(projectId), parsePicturePlace(place), whole === true),
  }
}
