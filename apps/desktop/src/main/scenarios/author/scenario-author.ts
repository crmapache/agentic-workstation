import { stat } from 'node:fs/promises'

import type { ScenarioDraftOutcome } from '@shared/scenario-view'
import type { ScenarioScope } from '@shared/scenarios'

import { cliHelp } from '../../claude/cli/cli-help'
import type { ClaudeCli } from '../../claude/cli/cli-locator'
import { commandShelves } from '../../claude/composer/command-shelves'
import { AiRuns } from '../../claude/search/ai-runs'
import { runCli } from '../../claude/tools/cli-run'
import { authorBody, AUTHOR_SYSTEM_PROMPT } from './author-instructions'
import { atTheFloor, readAuthorOutput } from './author-parse'
import { authorSkills } from './author-skills'

/** Потолки под модель, которая читает проект и каждый скилл: 60 шагов и десять минут. */
const MAX_TURNS = '60'
const TIMEOUT_MS = 600_000
const FALLBACK_MODEL = 'sonnet'

export type AuthorHost = {
  /** CLI на выбранном аккаунте: писать сценарий оплачивает тот, на ком он пойдёт. */
  cli: () => Promise<ClaudeCli | null>
  home: () => Promise<string>
  isTrusted: (projectPath: string) => Promise<boolean>
  /** Модель и усилие новой вкладки - выбор человека уважается вверх от пола. */
  defaults: () => { model: string; effort: string }
}

const shortError = (message: string): string => message.trim().split('\n')[0]?.slice(0, 200) ?? ''

/**
 * Модель пишет сценарий из фразы (ScenarioAuthor в ACC) и НЕ сохраняет его: черновик
 * открывается в редакторе, Save жмёт человек. Запуск голый и с инструментами чтения в папке
 * проекта: сценарий пишется для этого проекта. Отмена знает о запросе раньше процесса.
 */
export class ScenarioAuthor {
  private readonly runs = new AiRuns<AbortController>((controller) => controller.abort())

  constructor(private readonly host: AuthorHost) {}

  cancel(draftId: string): void {
    this.runs.cancel(draftId)
  }

  async draft(
    projectPath: string,
    draftId: string,
    description: string,
    scope: ScenarioScope,
  ): Promise<ScenarioDraftOutcome> {
    if (!description.trim()) return { ok: false, error: 'empty', cancelled: false }

    this.runs.asked(draftId)

    try {
      return await this.write(projectPath, draftId, description, scope)
    } finally {
      this.runs.finished(draftId)
    }
  }

  private async write(
    projectPath: string,
    draftId: string,
    description: string,
    scope: ScenarioScope,
  ): Promise<ScenarioDraftOutcome> {
    const cancelled = (): ScenarioDraftOutcome => ({ ok: false, error: '', cancelled: true })
    const cli = await this.host.cli()

    if (!cli) return { ok: false, error: 'noClaude', cancelled: false }
    if (!(await this.host.isTrusted(projectPath)))
      return { ok: false, error: 'untrusted', cancelled: false }

    const help = await cliHelp(cli)

    if (!help.includes('--tools')) return { ok: false, error: 'outdated', cancelled: false }

    const home = await this.host.home()
    const shelves = await commandShelves(projectPath, home)
    const skills = await authorSkills(shelves)

    if (this.runs.isCancelled(draftId)) return cancelled()

    const readable = await existing([
      ...new Set(shelves.flatMap((shelf) => [shelf.skills, shelf.commands])),
    ])
    const args = this.args(help, readable)
    const controller = new AbortController()

    this.runs.started(draftId, controller)

    if (controller.signal.aborted) return cancelled()

    const run = await runCli(cli, args, projectPath, TIMEOUT_MS, authorBody(description, skills), {
      signal: controller.signal,
    })

    if (controller.signal.aborted || this.runs.isCancelled(draftId)) return cancelled()
    if (run.timedOut) return { ok: false, error: 'timeout', cancelled: false }

    const read = readAuthorOutput(run.stdout, scope)

    if ('scenario' in read) return { ok: true, scenario: read.scenario }

    return {
      ok: false,
      error: shortError(read.error || run.stderr) || 'unreadable',
      cancelled: false,
    }
  }

  private args(help: string, readable: readonly string[]): string[] {
    const flag = (name: string, ...value: string[]) => (help.includes(name) ? [name, ...value] : [])
    const defaults = this.host.defaults()
    const { model, effort } = atTheFloor(defaults.model, defaults.effort)

    return [
      '-p',
      '--tools',
      'Grep',
      'Read',
      'Glob',
      ...flag('--output-format', 'json'),
      ...(model ? flag('--model', model) : []),
      ...(model !== FALLBACK_MODEL ? flag('--fallback-model', FALLBACK_MODEL) : []),
      ...flag('--effort', effort),
      ...flag('--max-turns', MAX_TURNS),
      ...flag('--system-prompt', AUTHOR_SYSTEM_PROMPT),
      // Папки скиллов и плагинов лежат вне проекта: «прочитай файл скилла» иначе невыполнимо.
      ...readable.flatMap((dir) => (/["\n]/.test(dir) ? [] : flag('--add-dir', dir))),
      ...flag('--safe-mode'),
      ...flag('--strict-mcp-config'),
      ...flag('--no-session-persistence'),
    ]
  }
}

const existing = async (dirs: readonly string[]): Promise<string[]> => {
  const checked = await Promise.all(
    dirs.map(async (dir) => ((await stat(dir).catch(() => null))?.isDirectory() ? dir : null)),
  )

  return checked.flatMap((dir) => (dir ? [dir] : []))
}
