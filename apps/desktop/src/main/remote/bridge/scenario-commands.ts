import { isProviderId } from '@shared/providers'
import type { ScenarioQueuesView } from '@shared/scenario-queues'

import type { Command, CommandArgs } from '@agentic-workstation/remote-protocol/commands'
import type { StepLogWire } from '@agentic-workstation/remote-protocol/scenario-wire-types'

import { withFiles } from './attached-files'
import type { BridgePorts } from './bridge-ports'
import type { Outcome } from './command-ledger'
import { tailWindow } from './feed-window'
import type { Redact } from './fit'
import { done, fail, scenarioOutcome } from './outcomes'
import type { ProjectKeys } from './project-keys'
import { PAGE_ROWS, pageBefore, READ_BUDGET, feedWithRowAbove } from './reads-fit'
import { runProjectPath } from './scenario-wire'
import { ShelfCommands } from './shelf-commands'

export type ScenarioCommand = Extract<Command, { name: `scenarios.${string}` }>

const NO_LOG: StepLogWire = { found: false, items: [], hasEarlier: false }

/**
 * Команды сценариев (ScenarioService, ADR 0039): запуск, очередь, идущий прогон, журнал шага и
 * история прогонов. Полки (сценарий целиком, копия, удаление, черновик ИИ, расписание) -
 * ShelfCommands. Прогон и очередь - по id, их проект находит IDE по своей очереди; прогон из
 * истории - по ключу проекта, который IDE назвала сама.
 */
export class ScenarioCommands {
  private readonly shelves: ShelfCommands

  constructor(
    private readonly ports: BridgePorts,
    private readonly keys: () => ProjectKeys,
    private readonly redact: () => Redact,
  ) {
    this.shelves = new ShelfCommands(ports, keys, redact)
  }

  async run(command: ScenarioCommand): Promise<Outcome> {
    const { scenarios } = this.ports
    const view = scenarios.queuesView()

    switch (command.name) {
      case 'scenarios.start':
        return this.start(command.args)
      case 'scenarios.queue':
        if (!view.queues.some((queue) => queue.id === command.args.queueId)) return fail('notFound')

        return scenarioOutcome(await scenarios.act(command.args.queueId, command.args.action))
      case 'scenarios.carryOn':
        return scenarioOutcome(await scenarios.carryOn(command.args.runId))
      case 'scenarios.control':
      case 'scenarios.answer':
        return this.runCommand(command, view)
      case 'scenarios.tell':
        return this.tell(command.args, view)
      case 'scenarios.log':
        return this.log(command.args, view)
      case 'scenarios.starRun': {
        const path = this.keys().pathOf(command.args.projectKey)

        if (!path) return fail('notFound')

        const { runId, starred } = command.args

        return scenarioOutcome(await scenarios.starRun(path, runId, starred))
      }
      case 'scenarios.deleteRun': {
        const path = this.keys().pathOf(command.args.projectKey)

        if (!path) return fail('notFound')

        return scenarioOutcome(await scenarios.deleteRun(path, command.args.runId))
      }
      default:
        return this.shelves.run(command)
    }
  }

  private async start(args: CommandArgs<'scenarios.start'>): Promise<Outcome> {
    // afterSuccess - поле для IDE постарше: очередь идёт дальше только после сделанного (ADR 0082).
    const { projectKey, provider, afterSuccess, ...rest } = args
    const path = this.keys().openPathOf(projectKey)

    if (!path) return fail('notOpen')
    if (!isProviderId(provider)) return fail('refused', 'providerMissing')

    const started = await this.ports.scenarios.start({ ...rest, projectPath: path, provider })

    return started.ok
      ? done({ queueId: started.queueId, itemId: started.itemId })
      : fail('refused', started.code)
  }

  /** Слова голове прогона; файлы с телефона - в каталог вставок IDE и ссылками в текст. */
  private async tell(
    args: CommandArgs<'scenarios.tell'>,
    view: ScenarioQueuesView,
  ): Promise<Outcome> {
    const path = runProjectPath(view, args.runId)

    if (!path) return fail('notFound')

    const text = await withFiles(args.text, args.files ?? [], this.ports.conversations.saveFile)

    if (text === null) return fail('refused', 'fileNotSaved')

    return this.ports.scenarios.tell(path, args.runId, text, args.images ?? [])
      ? done()
      : fail('refused', 'runOver')
  }

  /** Команды идущему прогону: проект находит IDE по очереди прогона. */
  private runCommand(command: ScenarioCommand, view: ScenarioQueuesView): Outcome {
    const { scenarios } = this.ports
    const runId = 'runId' in command.args ? command.args.runId : ''
    const path = runProjectPath(view, runId)

    if (!path) return fail('notFound')

    switch (command.name) {
      case 'scenarios.control': {
        const refusal = scenarios.control(path, runId, command.args.action, command.args.seen)

        return refusal ? fail(refusal === 'runMoved' ? 'runMoved' : 'refused', refusal) : done()
      }
      case 'scenarios.answer': {
        const { allow, text, question } = command.args

        return scenarios.answer(path, runId, allow, text, question) ? done() : fail('questionGone')
      }
      default:
        return fail('unknownCommand')
    }
  }

  /**
   * Журнал шага - разговор карточки (или головы) той же лентой, что разговор: конец строками,
   * сколько влезло в кадр, или страница строк выше before; шаги субагентов - счётом. Выше
   * before в журнале IDE строк нет, а есть транскрипт - сначала его страницы, как «load
   * earlier» окна прогона.
   */
  private async log(
    args: CommandArgs<'scenarios.log'>,
    view: ScenarioQueuesView,
  ): Promise<Outcome> {
    const path = runProjectPath(view, args.runId) ?? this.keys().pathOf(args.projectKey)

    if (!path) return fail('notFound')

    const { scenarios } = this.ports
    const redact = this.redact()
    const page = await scenarios.log(path, args.runId, args.key, false)

    if (!page.found || !page.feed) return done(NO_LOG)

    if (args.before === undefined) {
      const tail = tailWindow(page.feed.items, READ_BUDGET, PAGE_ROWS, redact)

      return done({
        found: true,
        items: tail.items,
        steps: tail.steps,
        hasEarlier: tail.cut || page.feed.hasEarlier,
      })
    }

    const before = args.before
    const feed = await feedWithRowAbove(
      page.feed,
      before,
      async () => (await scenarios.log(path, args.runId, args.key, true)).feed,
    )
    const above = feed && pageBefore(feed.items, before, feed.hasEarlier, redact)

    return above ? done({ found: true, ...above }) : fail('notFound')
  }
}
