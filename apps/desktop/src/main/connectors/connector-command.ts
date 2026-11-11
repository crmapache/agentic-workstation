import { maskArgs } from '../claude/tools/secret-mask'
import type { ConnectorSecrets } from './connector-secrets'
import type { StoredCommand, StoredConnector } from './connector-store'

/** Команда без папки: что запускать или что показать. */
export type CommandWords = { command: string; args: readonly string[] }

/**
 * Команда для реестра и для хранилища. В реестр - как её написал человек (с $NAME и ~, а не
 * с подставленными значениями: в переменной часто ключ) и с маской на ключах (--api-key …).
 * Полная, уже раскрытая, - в секреты, если она отличается от записи в реестре: реестр лежит
 * на диске открытым текстом.
 */
export const commandForStore = (
  launch: CommandWords,
  shown: CommandWords,
  cwd: string | null,
): { stored: StoredCommand; secret: ConnectorSecrets['command'] } => {
  const stored = { command: shown.command, args: maskArgs(shown.args), cwd }
  const same =
    launch.command === stored.command &&
    launch.args.length === stored.args.length &&
    launch.args.every((arg, index) => arg === stored.args[index])

  return {
    stored,
    secret: same ? undefined : { command: launch.command, args: [...launch.args] },
  }
}

/** Команда для запуска: полная из хранилища, а без ключей - как в реестре. */
export const launchCommand = (
  connector: StoredConnector,
  secrets: ConnectorSecrets,
): StoredCommand | null => connector.command && { ...connector.command, ...(secrets.command ?? {}) }
