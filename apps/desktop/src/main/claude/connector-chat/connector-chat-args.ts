import { fenceArgs } from '../structured-ask'
import type { CliFeatures } from '../cli/cli-features'
import { CHAT_TOOLS } from './connector-chat.constants'

export type ChatLaunch = {
  sessionId: string
  /** Разговор уже на диске: продолжить его, а не начинать под этим id. */
  resume: boolean
  schema: object
  /** Файл правил для ИИ: в аргументе им было бы тесно, и переводы строк там не к месту. */
  instructionsFile: string
}

/**
 * Аргументы процесса разговора о коннекторе (ADR 0050): двусторонний поток JSON, как у
 * панели, - слова человека доходят посреди хода, - и ограда разового вопроса: ответ по
 * схеме, только чтение сети, без настроек, хуков и MCP человека (fenceArgs). `--safe-mode`
 * есть не у всех версий CLI - без него процесс не поднялся бы вовсе.
 */
export const connectorChatArgs = (launch: ChatLaunch, features: CliFeatures): string[] => {
  const fence = fenceArgs({ schema: launch.schema, tools: CHAT_TOOLS })

  return [
    '-p',
    '--verbose',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--include-partial-messages',
    ...(features.safeMode ? fence : fence.filter((arg) => arg !== '--safe-mode')),
    '--append-system-prompt-file',
    launch.instructionsFile,
    ...(launch.resume ? ['--resume', launch.sessionId] : ['--session-id', launch.sessionId]),
  ]
}
