import { realpath } from 'node:fs/promises'
import { homedir } from 'node:os'

import type {
  PluginScope,
  ToolsResult,
  PluginAction,
  PluginCatalog,
  PluginsOutcome,
} from '@shared/claude-tools'

import { isRecord } from '../cli/cli-messages'
import { claudeOf } from '../conversation/claude-conversation'
import { commandsFromChange } from '../conversation/cli-replies'
import { runCli } from './cli-run'
import { installedFor, parseCliJson, marketplacesOf, availablePlugins } from './plugin-catalog'
import { maskText } from './secret-mask'
import type { ToolsHost } from './tools-host'
import { failed, resultOf } from './tools-result'
import { PLUGIN_INSTALL_TIMEOUT_MS } from './tools.constants'

const emptyCatalog = (result: ToolsResult): PluginCatalog => ({
  installed: [],
  available: [],
  marketplaces: [],
  failure: result.failure,
  detail: result.detail,
})

/**
 * Плагины Claude Code - разовыми командами CLI. Всё, что читает или меняет проект
 * (каталог, плагины областей project и local), идёт в его папке: CLI там читает её
 * настройки. Своё для всех проектов (область user, маркетплейсы) - из домашней папки.
 * Живые процессы перечитывают плагины сами (reload_plugins); каждое действие отвечает и
 * каталогом после него.
 */
export class PluginTools {
  constructor(private readonly host: ToolsHost) {}

  async catalog(projectPath: string): Promise<PluginCatalog> {
    const cli = await this.host.cli()

    if (!cli) return emptyCatalog(failed('cli-not-found'))

    const [plugins, markets, real] = await Promise.all([
      runCli(cli, ['plugin', 'list', '--available', '--json'], projectPath),
      runCli(cli, ['plugin', 'marketplace', 'list', '--json'], projectPath),
      realpath(projectPath).catch(() => projectPath),
    ])
    const list = parseCliJson(plugins.stdout)

    return {
      installed: installedFor(list, [projectPath, real]),
      available: availablePlugins(list),
      marketplaces: marketplacesOf(parseCliJson(markets.stdout)),
      failure: list === null ? 'refused' : null,
      detail: list === null ? maskText(plugins.stderr.trim() || plugins.stdout.trim()) : '',
    }
  }

  async act(
    projectPath: string,
    action: PluginAction,
    pluginId: string,
    scope: PluginScope | '',
    consent: boolean,
  ): Promise<PluginsOutcome> {
    const withScope = scope ? ['-s', scope] : []
    // Команду маркетплейса без явного согласия человека не запускаем: --yes - только по кнопке.
    const withConsent = consent && (action === 'install' || action === 'update') ? ['-y'] : []
    // Без области установка - для человека (user): папка проекта ей не нужна.
    const inProject = scope === 'project' || scope === 'local'

    return this.change(
      projectPath,
      inProject,
      ['plugin', action, ...withScope, ...withConsent, '--', pluginId],
      PLUGIN_INSTALL_TIMEOUT_MS,
    )
  }

  addMarketplace(projectPath: string, source: string): Promise<PluginsOutcome> {
    return this.change(
      projectPath,
      false,
      ['plugin', 'marketplace', 'add', '--', source],
      PLUGIN_INSTALL_TIMEOUT_MS,
    )
  }

  removeMarketplace(projectPath: string, name: string): Promise<PluginsOutcome> {
    return this.change(projectPath, false, ['plugin', 'marketplace', 'remove', '--', name])
  }

  /** Команда плагинов, перезагрузка плагинов у живых процессов и каталог после. */
  private async change(
    projectPath: string,
    inProject: boolean,
    args: string[],
    timeoutMs?: number,
  ): Promise<PluginsOutcome> {
    const result = await this.run(projectPath, inProject, args, timeoutMs)

    if (result.ok) await this.reloadPlugins()

    return { result, catalog: await this.catalog(projectPath) }
  }

  private async run(
    projectPath: string,
    inProject: boolean,
    args: string[],
    timeoutMs?: number,
  ): Promise<ToolsResult> {
    const cli = await this.host.cli()

    if (!cli) return failed('cli-not-found')

    return resultOf(await runCli(cli, args, inProject ? projectPath : homedir(), timeoutMs))
  }

  private async reloadPlugins() {
    for (const runtime of this.host.runtimes()) {
      const { process } = claudeOf(runtime)

      if (!process?.isAlive) continue

      const reply = await process
        .control({ subtype: 'reload_plugins', hold_on_cache_impact: false })
        .catch(() => null)

      const commands = isRecord(reply) ? commandsFromChange({ type: '', ...reply }) : null

      if (commands) this.host.onCommands(runtime.meta.projectPath, commands)
    }
  }
}
