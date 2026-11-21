import type { ProviderId } from '@shared/providers'
import { PROVIDER_IDS } from '@shared/providers'
import type {
  QueueAction,
  ScenarioQueue,
  ScenarioStartOutcome,
  ScenarioStartRequest,
} from '@shared/scenario-queues'
import { isRunnable, missingInputs } from '@shared/scenario-rules'
import type { Scenario, ScenarioCode, ScenarioScope } from '@shared/scenarios'
import type {
  TrackerCard,
  TrackerRunState,
  TrackerSendOutcome,
  TrackerSendRequest,
} from '@shared/tracker'
import { isInQueue } from '@shared/tracker'
import { expandCardText, defaultInputValue } from '@shared/tracker-text'

import type { RunLink } from './tracker-book'
import { TrackerError } from './tracker-fields'
import { own, openBranch } from './tracker-guards'
import { textOf } from './tracker-records'
import type { TrackerService } from './tracker-service'
import type { TrackerPlace } from './tracker-spaces'
import { TrackerTree } from './tracker-tree'
import { cardOf } from './tracker-view'

/** Узкая ручка сценариев: прочитать сценарий, поставить в очередь, назвать очередь, увидеть её. */
export type TrackerScenariosPort = {
  fetch: (projectPath: string, id: string, scope: ScenarioScope) => Promise<Scenario | null>
  start: (request: ScenarioStartRequest) => Promise<ScenarioStartOutcome>
  act: (queueId: string, action: QueueAction) => Promise<ScenarioCode | null>
  queues: () => ScenarioQueue[]
}

/** Сколько живут связи карточек с прошедшими прогонами: дольше статус никому не нужен. */
const KEEP_LINKS_MS = 30 * 24 * 60 * 60 * 1000

type Prepared = { card: TrackerCard; request: Omit<ScenarioStartRequest, 'target'> }

const isProvider = (value: string): value is ProviderId =>
  (PROVIDER_IDS as readonly string[]).includes(value)

/** Значения полей сценария из карточки: каждое объявленное поле, подстановки раскрыты. */
export const inputsOf = (scenario: Scenario, card: TrackerCard): Record<string, string> =>
  Object.fromEntries(
    scenario.inputs
      .filter((input) => input.name.trim())
      .map((input, index) => [
        input.name,
        expandCardText(card.scenario?.inputs[input.name] ?? defaultInputValue(index), card),
      ]),
  )

/**
 * Карточки трекера в очередях сценариев (ADR 0101). Отправка проверяет все карточки до первого
 * запуска и ставит их по одной в порядке доски: первая открывает очередь (или встаёт в
 * выбранную), остальные - за ней. Связь «карточка → элемент очереди» живёт только на этом
 * компьютере; когда элемент сделан, карточка отмечается выполненной - один раз: снятую потом
 * руками галочку очередь назад не ставит.
 */
export class TrackerRuns {
  private states = ''

  constructor(
    private readonly tracker: TrackerService,
    private readonly scenarios: TrackerScenariosPort,
    private readonly now: () => number = Date.now,
  ) {
    tracker.setRunState((link) => this.stateOf(link))
    this.queuesChanged()
  }

  /** Состояние элемента очереди по связи; gone - элемента или очереди больше нет. */
  stateOf(link: RunLink): TrackerRunState {
    const queue = this.scenarios.queues().find((one) => one.id === link.queueId)
    const item = queue?.items.find((one) => one.id === link.itemId)

    if (!item) return 'gone'

    return item.state === 'waiting' && item.refusal ? 'refused' : item.state
  }

  /** Очереди поменялись: учесть сделанное и перерисовать доски, если статусы сдвинулись. */
  queuesChanged() {
    const { book } = this.tracker
    const runs = book.runs()
    const states: string[] = []
    let settled = false

    for (const [cardId, link] of Object.entries(runs)) {
      const state = this.stateOf(link)

      states.push(`${cardId}:${state}`)

      if (link.settled) {
        if (this.now() - link.sentAt > KEEP_LINKS_MS) book.setRun(cardId, null)

        continue
      }

      if (state === 'done') {
        const card = book.get(cardId)

        if (card && card.fields.done?.[0] !== true)
          book.write(cardId, { done: true, doneAt: this.now() }, true)
      }

      if (state === 'done' || state === 'gone') {
        book.setRun(cardId, { ...link, settled: true })
        settled = true
      }
    }

    const signature = states.join('|')

    if (settled) book.commit()
    else if (signature !== this.states) this.tracker.refresh()

    this.states = signature
  }

  async send(place: TrackerPlace, request: TrackerSendRequest): Promise<TrackerSendOutcome> {
    const spaceId = await this.tracker.spaceOf(place)
    const ctx = { book: this.tracker.book, spaceId, now: this.now() }
    const tree = new TrackerTree(this.tracker.book.records())
    let cards: TrackerCard[]
    let groupTitle: string | null = null

    try {
      if (request.source.kind === 'group') {
        const group = openBranch(ctx, tree, request.source.groupId, 'group')

        groupTitle = textOf(group, 'title')
        cards = tree
          .tasks(group.id)
          .flatMap((task) => [task, ...tree.followUps(task.id)])
          .map((one) => cardOf(one.record, this.tracker.book.runs(), (link) => this.stateOf(link)))
          .filter((card) => card.scenario && !card.done && !isInQueue(card.run))
      } else {
        const record = own(ctx, tree, request.source.cardId, 'card')
        const card = cardOf(record, this.tracker.book.runs(), (link) => this.stateOf(link))

        if (!card.scenario) return { ok: false, code: 'noScenario', cardId: card.id }

        cards = [card]
      }
    } catch (error) {
      if (error instanceof TrackerError) return { ok: false, code: error.code, cardId: null }

      throw error
    }

    if (cards.length === 0) return { ok: false, code: 'nothingToSend', cardId: null }

    const prepared = await this.prepare(place.rootPath, cards)

    if (!Array.isArray(prepared)) return prepared

    return this.place(place, request, prepared, groupTitle)
  }

  /** Все карточки проверяются до первого запуска: отказ не оставит полуочереди. */
  private async prepare(
    projectPath: string,
    cards: TrackerCard[],
  ): Promise<Prepared[] | Extract<TrackerSendOutcome, { ok: false }>> {
    const prepared: Prepared[] = []

    for (const card of cards) {
      const binding = card.scenario

      if (!binding) continue

      const scenario = await this.scenarios.fetch(projectPath, binding.scenarioId, binding.scope)
      const fail = (code: ScenarioCode) => ({ ok: false as const, code, cardId: card.id })

      if (!scenario) return fail('scenarioGone')
      if (!isRunnable(scenario)) return fail('scenarioBroken')

      const inputs = inputsOf(scenario, card)
      const provider = binding.provider ?? scenario.head.provider

      if (missingInputs(scenario, inputs).length > 0) return fail('scenarioMissingInput')
      if (!isProvider(provider)) return fail('providerMissing')

      prepared.push({
        card,
        request: { projectPath, scenarioId: scenario.id, scope: binding.scope, inputs, provider },
      })
    }

    return prepared
  }

  private async place(
    place: TrackerPlace,
    request: TrackerSendRequest,
    prepared: Prepared[],
    groupTitle: string | null,
  ): Promise<TrackerSendOutcome> {
    const { book } = this.tracker
    const sent: string[] = []
    let queueId: string | null = null

    for (const item of prepared) {
      const outcome = await this.scenarios.start({
        ...item.request,
        target: queueId ? { kind: 'queue', queueId } : request.target,
        ...(queueId === null && request.target.kind === 'new'
          ? { hours: request.hours ?? null }
          : {}),
      })

      if (!outcome.ok) {
        if (sent.length > 0) book.commit()

        return { ok: false, code: outcome.code, cardId: item.card.id }
      }

      if (queueId === null && request.target.kind === 'new' && groupTitle) {
        await this.scenarios.act(outcome.queueId, { kind: 'rename', name: groupTitle })
      }

      queueId = outcome.queueId
      book.setRun(item.card.id, {
        queueId,
        itemId: outcome.itemId,
        sentAt: this.now(),
        settled: false,
      })
      sent.push(item.card.id)
    }

    return {
      ok: true,
      board: await this.tracker.board(place),
      queueId: queueId ?? '',
      sent,
    }
  }
}
