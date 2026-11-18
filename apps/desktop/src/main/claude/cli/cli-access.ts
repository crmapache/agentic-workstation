import type { CliStatus, ModelInfo, SlashCommand } from '@shared/claude'
import type { CliSearch } from '@shared/claude-panel'

import { modelsFromReply, builtinsFromReply } from '../conversation/cli-replies'
import { loginShellEnv } from '../../process/shell-env'
import type { ClaudeCli } from './cli-locator'
import { locateClaudeCli } from './cli-locator'
import { checkCliPath, searchedPlaces } from './cli-path'
import { askCli } from './cli-probe'

/**
 * Где Claude Code на этой машине, какие у него модели и свои команды. Ищется сразу при
 * старте IDE: окно должно знать, что CLI нет, ещё до первого сообщения. Каталоги - одним
 * служебным процессом без разговора (`initialize`), пока ни один разговор их не спросил.
 */
export class CliAccess {
  status: CliStatus = 'unknown'
  models: ModelInfo[] = []
  /** Свои команды CLI (/compact, /clear…) - для подсказки «/» до первого хода. */
  commands: SlashCommand[] = []
  /** Где искали и что с путём, названным руками (экран «Claude Code not found»). */
  search: CliSearch = { path: '', searched: [], rejected: null }
  private lookup: Promise<ClaudeCli | null> | null = null

  /** Путь к CLI, названный руками (экран «Claude Code not found»); пусто - искать самой. */
  configured: () => string = () => ''

  /** prepare - окружение для служебного процесса каталога (аккаунт разговоров). */
  constructor(
    private readonly onChange: () => void,
    private readonly prepare: (cli: ClaudeCli) => ClaudeCli = (cli) => cli,
  ) {}

  /** CLI или null. Не нашёлся - следующий вызов ищет заново, а не отдаёт тот же отказ. */
  locate(): Promise<ClaudeCli | null> {
    this.lookup ??= this.find().then((cli) => {
      this.status = cli ? 'found' : 'missing'
      if (!cli) this.lookup = null
      if (cli && (this.models.length === 0 || this.commands.length === 0)) {
        void this.loadCatalog(cli)
      }
      this.onChange()

      return cli
    })

    return this.lookup
  }

  /** Поискать заново: человек поставил CLI, пока IDE открыта. */
  recheck(): Promise<ClaudeCli | null> {
    this.lookup = null

    return this.locate()
  }

  /** Каталог от живого разговора - свежее служебного. Пустой ответ ничего не стирает. */
  setModels(models: ModelInfo[]): void {
    if (models.length === 0) return

    this.models = models
    this.onChange()
  }

  /** Поиск вместе с тем, что о нём рассказать: где искали и чем не подошёл путь руками. */
  private async find(): Promise<ClaudeCli | null> {
    const configured = this.configured()
    const cli = await locateClaudeCli(configured)
    const env = cli?.env ?? (await loginShellEnv())

    this.search = {
      path: configured,
      searched: cli ? [] : searchedPlaces(env['PATH'] ?? '', configured),
      rejected: configured ? await checkCliPath(configured, env) : null,
    }

    return cli
  }

  /**
   * Модели и свои команды CLI одним `initialize`. CLI, чей ответ на него моделей не
   * несёт, спрашивается ещё и `list_models`.
   */
  private async loadCatalog(cli: ClaudeCli) {
    const prepared = this.prepare(cli)
    const reply = await askCli(prepared, { subtype: 'initialize' })
    const commands = builtinsFromReply(reply)
    const models = modelsFromReply(reply)

    if (commands.length > 0) {
      this.commands = commands
      this.onChange()
    }

    if (this.models.length > 0) return

    this.setModels(
      models.length > 0
        ? models
        : modelsFromReply(await askCli(prepared, { subtype: 'list_models' })),
    )
  }
}
