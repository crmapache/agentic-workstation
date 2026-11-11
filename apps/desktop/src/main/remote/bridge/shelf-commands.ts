import { isProviderId } from '@shared/providers'
import type { Scenario, ScenarioScope } from '@shared/scenarios'

import type { Command, CommandArgs } from '@agentic-workstation/remote-protocol/commands'

import type { BridgePorts } from './bridge-ports'
import type { Outcome } from './command-ledger'
import type { Redact } from './fit'
import { done, fail, scenarioOutcome } from './outcomes'
import type { ProjectKeys } from './project-keys'
import { shelvesThatFit, scenarioThatFits } from './scenario-shelf-wire'

/** Сколько черновик ИИ ждёт «сохранить» с телефона: столько же IDE помнит итог команды. */
export const DRAFT_KEPT_MS = 10 * 60_000

type Draft = { path: string; scenario: Scenario; scope: ScenarioScope; at: number }

/**
 * Черновики с телефона - под своей приставкой: номер называет телефон, с номером черновика окна
 * он не совпадёт и чужой черновик не отменит.
 */
const remoteDraft = (draftId: string) => `remote:${draftId}`

/**
 * Полки сценариев открытого проекта с телефона (ScenarioShelves): прочитать сценарий целиком,
 * копия, удаление, черновик ИИ и расписание. Полного редактора на телефоне нет: сохраняется
 * только то, что написала модель, - черновик держится здесь по его id, а телефон говорит лишь
 * «сохранить» или «выбросить».
 */
export class ShelfCommands {
  private readonly drafts = new Map<string, Draft>()

  constructor(
    private readonly ports: BridgePorts,
    private readonly keys: () => ProjectKeys,
    private readonly redact: () => Redact,
    private readonly clock: () => number = Date.now,
  ) {}

  async run(command: Command): Promise<Outcome> {
    const { scenarios } = this.ports

    switch (command.name) {
      case 'scenarios.shelves': {
        const path = this.keys().openPathOf(command.args.projectKey)

        if (!path) return fail('notOpen')

        const wire = shelvesThatFit(await scenarios.shelves(path), this.keyOf, this.redact())

        return wire ? done(wire) : fail('failed')
      }
      case 'scenarios.fetch': {
        const path = this.keys().openPathOf(command.args.projectKey)

        if (!path) return fail('notOpen')

        const { scenarioId, scope } = command.args
        const scenario = await scenarios.fetch(path, scenarioId, scope)
        const wire = scenario && scenarioThatFits(scenario, this.redact())

        return wire ? done(wire) : fail('notFound')
      }
      case 'scenarios.duplicate':
      case 'scenarios.delete': {
        const path = this.keys().openPathOf(command.args.projectKey)

        if (!path) return fail('notOpen')

        const { scenarioId, scope } = command.args
        const act = command.name === 'scenarios.delete' ? scenarios.delete : scenarios.duplicate

        return scenarioOutcome(await act(path, scenarioId, scope))
      }
      case 'scenarios.draft':
        return this.draft(command.args)
      case 'scenarios.saveDraft':
        return this.saveDraft(command.args)
      case 'scenarios.cancelDraft':
        // Отмена пишущегося и «выбросить» написанное - одно слово: черновика больше нет.
        scenarios.cancelDraft(remoteDraft(command.args.draftId))
        this.drafts.delete(command.args.draftId)

        return done()
      case 'scenarios.schedule':
        return this.schedule(command.args)
      case 'scenarios.unschedule': {
        const path = this.keys().openPathOf(command.args.projectKey)

        if (!path) return fail('notOpen')

        return scenarioOutcome(await scenarios.unschedule(path, command.args.scheduleId))
      }
      default:
        return fail('unknownCommand')
    }
  }

  private readonly keyOf = (rootPath: string) => this.keys().keyOf(rootPath)

  /**
   * Модель пишет сценарий по описанию - в проекте, только чтение (ScenarioAuthor). Написанное
   * не сохраняется само: телефон показывает его и говорит «сохранить» (saveDraft).
   */
  private async draft(args: CommandArgs<'scenarios.draft'>): Promise<Outcome> {
    const path = this.keys().openPathOf(args.projectKey)

    if (!path) return fail('notOpen')

    const outcome = await this.ports.scenarios.draft(
      path,
      remoteDraft(args.draftId),
      args.description,
      args.scope,
    )

    if (!outcome.ok) {
      return done({ ok: false, cancelled: outcome.cancelled, error: this.redact()(outcome.error) })
    }

    const wire = scenarioThatFits(outcome.scenario, this.redact())

    if (!wire) return done({ ok: false, cancelled: false, error: 'tooBig' })

    this.forgetOld()
    this.drafts.set(args.draftId, {
      path,
      scenario: outcome.scenario,
      scope: args.scope,
      at: this.clock(),
    })

    return done({ ok: true, scenario: wire })
  }

  /** Сохранить ровно то, что написала модель, на полку, которую выбрали перед черновиком. */
  private async saveDraft(args: CommandArgs<'scenarios.saveDraft'>): Promise<Outcome> {
    this.forgetOld()

    const path = this.keys().openPathOf(args.projectKey)
    const draft = this.drafts.get(args.draftId)

    if (!path) return fail('notOpen')
    if (draft?.path !== path) return fail('refused', 'draftGone')

    const saved = await this.ports.scenarios.save(path, draft.scenario, draft.scope)

    if (!saved.ok) return fail('refused', saved.code)

    this.drafts.delete(args.draftId)

    return done({ scenarioId: saved.scenario.id, scope: saved.scenario.scope })
  }

  /** Час с телефона - той же проверкой, что форма When окна (scheduleHour). */
  private async schedule(args: CommandArgs<'scenarios.schedule'>): Promise<Outcome> {
    const { projectKey, provider, ...hour } = args
    const path = this.keys().openPathOf(projectKey)

    if (!path) return fail('notOpen')
    if (!isProviderId(provider)) return fail('refused', 'providerMissing')

    return scenarioOutcome(await this.ports.scenarios.schedule(path, { ...hour, provider }))
  }

  private forgetOld() {
    const now = this.clock()

    for (const [id, draft] of this.drafts) {
      if (now - draft.at > DRAFT_KEPT_MS) this.drafts.delete(id)
    }
  }
}
