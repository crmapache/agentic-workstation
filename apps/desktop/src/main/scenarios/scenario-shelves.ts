import type { ProviderId } from '@shared/providers'
import type {
  ScenarioSaveOutcome,
  ScenarioShelvesView,
  ScenarioDraftOutcome,
} from '@shared/scenario-view'
import type { Scenario, ScenarioCode } from '@shared/scenarios'

import type { ScenarioProvider } from '../providers/scenario-provider'
import type { RunDesk } from './run-desk'
import { withAccRuns } from './store/acc-runs'
import { scopeOf, parseScenario } from './store/scenario-parse'

export type ShelvesHost = {
  desk: (projectPath: string) => RunDesk
  provider: (id: ProviderId) => ScenarioProvider | null
  dataDir: string
  onShelves: (projectPath: string) => void
}

/**
 * Полки сценариев проекта и личная, история прогонов (свои и сделанные в проекте плагином ACC)
 * и расписание - то, что вид сценариев показывает о проекте. Удалённые сценарии уносят свои часы; файл, который не прочитался, -
 * это не «пусто», и по нему ничего не удаляется.
 */
export class ScenarioShelves {
  constructor(private readonly host: ShelvesHost) {}

  async view(projectPath: string): Promise<ScenarioShelvesView> {
    const desk = this.host.desk(projectPath)

    await desk.sweep()

    const project = await desk.store.shelf('project')
    const user = await desk.store.shelf('user')
    const hours = await desk.schedules.keepOnly(project, user)

    return {
      scenarios: [...(project ?? []), ...(user ?? [])],
      runs: withAccRuns(await desk.runs.summaries(), await desk.acc.summaries()),
      schedules: hours ?? [],
      schedulesUnread: hours === null,
      canShare: await desk.store.canShare(),
    }
  }

  fetch(projectPath: string, id: string, scope: string): Promise<Scenario | null> {
    return this.host.desk(projectPath).store.find(id, scopeOf(scope))
  }

  async save(projectPath: string, raw: unknown, scope: string): Promise<ScenarioSaveOutcome> {
    const shelf = scopeOf(scope)
    const scenario = parseScenario(raw, shelf)

    if (!scenario) return { ok: false, code: 'scenarioBroken' }

    const stored = await this.host.desk(projectPath).store.save(scenario, shelf)

    this.host.onShelves(projectPath)

    return stored ? { ok: true, scenario: stored } : { ok: false, code: 'scenarioNotWritten' }
  }

  async delete(projectPath: string, id: string, scope: string): Promise<ScenarioCode | null> {
    const gone = await this.host.desk(projectPath).store.delete(id, scopeOf(scope))

    this.host.onShelves(projectPath)

    return gone ? null : 'scenarioNotDeleted'
  }

  async duplicate(projectPath: string, id: string, scope: string): Promise<ScenarioCode | null> {
    const copy = await this.host.desk(projectPath).store.duplicate(id, scopeOf(scope))

    this.host.onShelves(projectPath)

    return copy ? null : 'scenarioNotWritten'
  }

  async place(projectPath: string, id: string, from: string, to: string, before: string) {
    const refusal = await this.host
      .desk(projectPath)
      .store.place(id, scopeOf(from), scopeOf(to), before)

    this.host.onShelves(projectPath)

    return refusal
  }

  /** Черновик пишет модель провайдера; сейчас провайдер один - Claude Code. */
  draft(
    projectPath: string,
    draftId: string,
    description: string,
    scope: string,
  ): Promise<ScenarioDraftOutcome> {
    const provider = this.host.provider('claude')

    if (!provider) return Promise.resolve({ ok: false, error: 'noClaude', cancelled: false })

    return provider.draft(projectPath, draftId, description, scopeOf(scope))
  }

  cancelDraft(draftId: string): void {
    this.host.provider('claude')?.cancelDraft(draftId)
  }

  async deleteRun(projectPath: string, runId: string): Promise<ScenarioCode | null> {
    const desk = this.host.desk(projectPath)

    if (desk.live.has(runId)) return 'runBusy'
    if (await this.isForeign(desk, runId)) return 'runForeign'

    await desk.runs.delete(runId)
    this.host.onShelves(projectPath)

    return null
  }

  async starRun(
    projectPath: string,
    runId: string,
    starred: boolean,
  ): Promise<ScenarioCode | null> {
    const desk = this.host.desk(projectPath)

    if (desk.live.has(runId)) return 'runBusy'
    if (await this.isForeign(desk, runId)) return 'runForeign'
    if (!(await desk.runs.star(runId, starred))) return 'runGone'

    this.host.onShelves(projectPath)

    return null
  }

  /** Прогон ACC: своей записи у IDE нет, а его книгу IDE не пишет. */
  private async isForeign(desk: RunDesk, runId: string): Promise<boolean> {
    return (await desk.runs.read(runId)) === null && (await desk.acc.read(runId)) !== null
  }
}
