import { open } from 'node:fs/promises'

import type { CliProcess } from '../cli/cli-process'
import { claudeOf } from '../conversation/claude-conversation'
import { findTranscript } from '../history/transcript-paths'
import type { ConversationRuntime } from '../../agents/conversation/conversation-runtime'

/** Перевод строки в UTF-8 - один байт. */
const NEWLINE = 0x0a

/**
 * Имя от человека - живому процессу. `source: host` делает его именем от человека: CLI
 * перестаёт называть разговор сам. session_id - чтобы гонка с /clear отказала, а не
 * назвала новый разговор. Отказ - строка в журнале: вкладка имя держит и так, а
 * следующее сообщение спросит снова.
 */
const askRename = (runtime: ConversationRuntime, process: CliProcess, title: string) => {
  process
    .control({
      subtype: 'rename_session',
      title,
      source: 'host',
      session_id: runtime.meta.sessionId,
    })
    .then(() => {
      claudeOf(runtime).namedAs = title
    })
    .catch((error: unknown) => console.warn('[claude] имя не ушло в разговор:', error))
}

/**
 * Строка `custom-title` в конец транскрипта - так же, как SDK переименовывает разговор
 * без процесса. Только дописывается: открытие на r+ не создаёт пропавший файл. После
 * оборванной строки - со своим переводом строки.
 */
const appendTitle = async (file: string, sessionId: string, title: string) => {
  const handle = await open(file, 'r+')

  try {
    const { size } = await handle.stat()
    const last = Buffer.alloc(1)

    if (size > 0) await handle.read(last, 0, 1, size - 1)

    const torn = size > 0 && last[0] !== NEWLINE
    const line = JSON.stringify({ type: 'custom-title', customTitle: title, sessionId })

    await handle.write(`${torn ? '\n' : ''}${line}\n`, size)
  } finally {
    await handle.close()
  }
}

/**
 * Имя от человека - в транскрипт разговора: оттуда имена читают история, поиск и
 * `claude --resume` в терминале. Живой процесс держит имя в памяти и переписал бы
 * строку, подсунутую за его спиной, - ему управляющий запрос. Без процесса - строка в
 * файл: поднимать агента ради имени дорого. Разговора ещё нет (нет файла) - имя уедет
 * с первым сообщением (nameAfterPerson).
 */
export const writeOwnTitle = async (runtime: ConversationRuntime, title: string): Promise<void> => {
  const { meta } = runtime
  const { process } = claudeOf(runtime)

  if (process?.isAlive) return askRename(runtime, process, title)

  const file = await findTranscript(meta.projectPath, meta.sessionId)

  if (!file) return

  await appendTitle(file, meta.sessionId, title).catch((error: unknown) => {
    console.warn('[claude] имя не записалось в транскрипт:', error)
  })
}

/**
 * Имя от человека, которое этот процесс ещё не получил: вкладку назвали до первого
 * сообщения, пока процесс спал, или процесс поднят заново и прочёл файл раньше строки.
 * Спрашивается после каждого сообщения: дёшево, когда давать нечего, а после сообщения
 * у разговора точно есть транскрипт.
 */
export const nameAfterPerson = (runtime: ConversationRuntime, process: CliProcess): void => {
  const { title, titleSource } = runtime.meta

  if (titleSource !== 'user' || !title || claudeOf(runtime).namedAs === title) return

  askRename(runtime, process, title)
}
