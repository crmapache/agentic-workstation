import { stat } from 'node:fs/promises'

import type { ClaudeConfigView, ClaudeConfigFailure } from '@shared/claude-config'

import type { ClaudeCli } from '../cli/cli-locator'
import { runCli } from '../tools/cli-run'
import { maskText } from '../tools/secret-mask'
import type { ToolsHost } from '../tools/tools-host'
import type { ConfigEntry } from './claude-config'
import { configCommand, isChangeTaken, configSettings, parseConfigHelp } from './claude-config'
import { readConfigFiles } from './config-files'
import {
  RESTARTING_KEY,
  CONFIG_CLI_ARGS,
  CONFIG_MESSAGE_LIMIT,
  CONFIG_RUN_TIMEOUT_MS,
} from './config.constants'

/**
 * Экран собственных настроек Claude Code (`/config`). За ним два разовых запуска CLI в
 * папке проекта: `/config` - список, `/config ключ=значение` - правка; оба через stdin
 * и без следа в истории. Список держится на файл CLI и его дату: новая версия - новый
 * список. Правка - одна за раз: каждая - целый CLI, переписывающий файл настроек, и две
 * сразу записали бы файл каждая со своего чтения.
 */
export class ClaudeConfigDesk {
  private catalog: { identity: string; entries: ConfigEntry[] } | null = null
  private changing = false

  constructor(private readonly host: ToolsHost) {}

  /** Список с действующими значениями; CLI спрашивается, только если списка ещё нет. */
  async list(projectPath: string): Promise<ClaudeConfigView> {
    const entries = await this.entries(projectPath)

    if (!Array.isArray(entries)) return { settings: [], failure: entries, outcome: null }

    return { settings: await this.read(projectPath, entries), failure: null, outcome: null }
  }

  /**
   * Поменять одну настройку и ответить списком, перечитанным с диска, и исходом -
   * по файлу: настройка, прочитанная как просили, принята; иначе под рядом слова CLI.
   */
  async set(projectPath: string, key: string, value: string): Promise<ClaudeConfigView> {
    const entries = this.catalog?.entries ?? []
    const command = configCommand(entries, key, value)
    const cli = await this.trustedCli(projectPath)

    if (!command || typeof cli === 'string' || this.changing) {
      return { ...(await this.list(projectPath)), outcome: { key, ok: false, message: '' } }
    }

    this.changing = true

    try {
      const before = await this.valueOf(projectPath, entries, key)
      const run = await runCli(cli, CONFIG_CLI_ARGS, projectPath, CONFIG_RUN_TIMEOUT_MS, command)
      const after = await this.valueOf(projectPath, entries, key)
      const free = entries.find((entry) => entry.key === key)?.free === true
      const ok = run.code === 0 && isChangeTaken({ asked: value, before, after, free })
      const said = (run.code === 0 ? run.stdout : run.stderr || run.stdout).trim()

      if (!ok) console.warn('[claude] настройку Claude Code не приняли:', key, said)

      // Копии файлов процесс получает переменной при старте (spawn.ts): без перезапуска
      // переключатель не действовал бы ни в одной открытой вкладке. Ход не рвётся.
      if (ok && key === RESTARTING_KEY) {
        for (const runtime of this.host.runtimes()) runtime.restartSession()
      }

      return {
        settings: await this.read(projectPath, entries),
        failure: null,
        outcome: { key, ok, message: maskText(said).slice(0, CONFIG_MESSAGE_LIMIT) },
      }
    } finally {
      this.changing = false
    }
  }

  /** CLI для запуска в папке проекта - только после доверия, как и всё остальное. */
  private async trustedCli(projectPath: string): Promise<ClaudeCli | ClaudeConfigFailure> {
    if (!(await this.host.isTrusted(projectPath))) return 'untrusted'

    return (await this.host.cli()) ?? 'cli-not-found'
  }

  private async entries(projectPath: string): Promise<ConfigEntry[] | ClaudeConfigFailure> {
    const cli = await this.trustedCli(projectPath)

    if (typeof cli === 'string') return cli

    const info = await stat(cli.binary).catch(() => null)
    const identity = `${cli.binary}:${info?.mtimeMs ?? 0}`

    if (this.catalog?.identity === identity) return this.catalog.entries

    const run = await runCli(cli, CONFIG_CLI_ARGS, projectPath, CONFIG_RUN_TIMEOUT_MS, '/config')
    const entries = parseConfigHelp(run.stdout)

    // Старый CLI или новый вид ответа: экран так и скажет, а не покажет пустой список.
    if (entries.length === 0) {
      console.warn('[claude] /config ответил непонятно:', run.code, run.stderr.trim())

      return 'unreadable'
    }

    this.catalog = { identity, entries }

    return entries
  }

  private async read(projectPath: string, entries: readonly ConfigEntry[]) {
    return configSettings(entries, await readConfigFiles(projectPath))
  }

  private async valueOf(projectPath: string, entries: readonly ConfigEntry[], key: string) {
    const only = entries.filter((entry) => entry.key === key)

    return (await this.read(projectPath, only))[0]?.value ?? null
  }
}
