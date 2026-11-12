import { readFile, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'

import { loginShellEnv } from '../cli/shell-env'

/** Где CLI помнит, каким папкам человек доверился в терминале. */
const cliConfigFile = async () => {
  const env = await loginShellEnv()
  const configDir = env['CLAUDE_CONFIG_DIR']

  return configDir
    ? join(configDir, '.claude.json')
    : join(env['HOME'] || homedir(), '.claude.json')
}

/** Папка и все её родители: доверие к папке распространяется на вложенные. */
export const withParents = (path: string): string[] => {
  const chain = [path]

  while (dirname(chain.at(-1) ?? '/') !== chain.at(-1)) chain.push(dirname(chain.at(-1) ?? '/'))

  return chain
}

/**
 * Принял ли человек вопрос о доверии к папке в терминальном Claude Code. На Windows CLI
 * пишет путь папки и с обратными, и с прямыми чертами (по версии) - сверяются оба.
 */
export const trustedInConfig = (config: unknown, path: string): boolean => {
  if (typeof config !== 'object' || config === null || !('projects' in config)) return false

  const projects = config.projects

  if (typeof projects !== 'object' || projects === null) return false

  return withParents(path)
    .flatMap((dir) => [dir, dir.replaceAll('\\', '/')])
    .some((dir) => {
      const entry: unknown = (projects as Record<string, unknown>)[dir]

      return typeof entry === 'object' && entry !== null && 'hasTrustDialogAccepted' in entry
        ? entry.hasTrustDialogAccepted === true
        : false
    })
}

/**
 * Доверие к папкам проектов. С `-p` CLI не спрашивает, доверяешь ли ты папке, и сразу
 * читает её настройки, хуки и CLAUDE.md - а в чужом репозитории хук выполнит что угодно.
 * Поэтому спрашивает панель: папка доверена, если человек согласился здесь или раньше
 * в терминальном Claude Code.
 */
export class WorkspaceTrust {
  private readonly trusted: Set<string>

  constructor(
    trusted: readonly string[],
    private readonly onChange: () => void,
  ) {
    this.trusted = new Set(trusted)
  }

  get list(): string[] {
    return [...this.trusted]
  }

  /**
   * CLI записывает доверие по настоящему пути папки, а проект мог открыться через
   * ссылку (/tmp вместо /private/tmp): проверяются оба пути.
   */
  async isTrusted(path: string): Promise<boolean> {
    const real = await realpath(path).catch(() => path)
    const paths = real === path ? [path] : [path, real]

    if (paths.some((item) => withParents(item).some((dir) => this.trusted.has(dir)))) return true

    try {
      const config: unknown = JSON.parse(await readFile(await cliConfigFile(), 'utf8'))

      return paths.some((item) => trustedInConfig(config, item))
    } catch {
      return false
    }
  }

  trust(path: string): void {
    if (this.trusted.has(path)) return

    this.trusted.add(path)
    this.onChange()
  }
}
