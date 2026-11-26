import type { ProviderId } from '@shared/providers'
import { PROVIDER_IDS } from '@shared/providers'
import type {
  QueueHours,
  QueueAction,
  QueueTarget,
  ScenarioQueue,
  ScenarioStartOutcome,
  ScenarioStartRequest,
  QueuePlaceholderRequest,
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
import { dueKey } from '@shared/tracker-repeat'
import { expandCardText, defaultInputValue } from '@shared/tracker-text'

import type { RunLink } from './tracker-book'
import { completeCard } from './tracker-complete'
import { TrackerError } from './tracker-fields'
import { own, openBranch } from './tracker-guards'
import { flagOf, textOf } from './tracker-records'
import type { TrackerService } from './tracker-service'
import type { TrackerPlace } from './tracker-spaces'
import { TrackerTree } from './tracker-tree'
import { cardOf, isSameRound } from './tracker-view'

/**
 * Узкая ручка сценариев: прочитать сценарий, поставить в очередь сценарий или пометку (карточку
 * без сценария), назвать очередь, увидеть её.
 */
export type TrackerScenariosPort = {
  fetch: (projectPath: string, id: string, scope: ScenarioScope) => Promise<Scenario | null>
  start: (request: ScenarioStartRequest) => Promise<ScenarioStartOutcome>
  placeholder: (request: QueuePlaceholderRequest) => Promise<ScenarioStartOutcome>
  act: (queueId: string, action: QueueAction) => Promise<ScenarioCode | null>
  queues: () => ScenarioQueue[]
}

/** Сколько живут связи карточек с прошедшими прогонами: дольше статус никому не нужен. */
const KEEP_LINKS_MS = 30 * 24 * 60 * 60 * 1000

/** Карточка к постановке: со сценарием - запрос запуска, без сценария - пометка (request null). */
type Prepared = { card: TrackerCard; request: Omit<ScenarioStartRequest, 'target'> | null }

const isProvider = (value: string): value is ProviderId =>
  (PROVIDER_IDS as readonly string[]).includes(value)

/**
 * Идёт ли карточка колонки в очередь: открытая и не стоящая в очереди. Карточка без сценария,
 * уже стоявшая пометкой в той очереди, куда шлют, туда второй раз не встаёт: повторная отправка
 * колонки (добавили карточку, переслали упавшую) не задваивает пометки.
 */
const isQueueable = (card: TrackerCard, target: QueueTarget): boolean =>
  !card.done &&
  !isInQueue(card.run) &&
  !(!card.scenario && target.kind === 'queue' && card.run?.queueId === target.queueId)

/** Отказы самой очереди, а не исполнителя или папки. */
const QUEUE_CODES: ReadonlySet<ScenarioCode> = new Set(['queueGone', 'queueClosed', 'queueBusy'])

/**
 * Чья карточка отказала. Пометка, открывающая очередь, отказывает за исполнителя и папку первой
 * карточки со сценарием - отказ называет ту; отказ самой очереди (нет, закрыта, занята) - свой.
 */
const refusedCard = (item: Prepared, lead: Prepared | null, code: ScenarioCode): string =>
  item.request || !lead || QUEUE_CODES.has(code) ? item.card.id : lead.card.id

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
 * компьютере; когда элемент сделан, карточка отмечается выполненной (повторяющаяся - переезжает на
 * следующий срок) - один раз: снятую потом руками галочку очередь назад не ставит.
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

    if (!queue || !item) return 'gone'
    // Закрытая очередь (видна, пока жив её worktree) ничего больше не запустит: несделанное в ней
    // не «ждёт», иначе карточка навсегда осталась бы «queued» и не уходила бы снова.
    if (queue.closedAt !== 0 && item.state !== 'done') return 'gone'

    return item.state === 'waiting' && item.refusal ? 'refused' : item.state
  }

  /** Очереди поменялись: учесть сделанное и перерисовать доски, если статусы сдвинулись. */
  queuesChanged() {
    const { book } = this.tracker
    const runs = book.runs()
    const states: string[] = []
    let settled = false
    let tree: TrackerTree | null = null

    for (const [cardId, link] of Object.entries(runs)) {
      const state = this.stateOf(link)

      states.push(`${cardId}:${state}`)

      if (link.settled) {
        if (this.now() - link.sentAt > KEEP_LINKS_MS) book.setRun(cardId, null)

        continue
      }

      if (state === 'done' && !link.placeholder) {
        const card = book.get(cardId)

        // Повторяющаяся карточка не гаснет, а переезжает на следующий срок - как от галочки.
        // Удалённая тоже отмечается: «Undo» вернёт её сделанной.
        if (card && !flagOf(card, 'done') && isSameRound(card, link)) {
          tree ??= new TrackerTree(book.records())
          completeCard(book, tree, card, this.now(), link.sentAt)
        }
      }

      if (state === 'done' || state === 'gone' || state === 'skipped') {
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
    const ctx = {
      book: this.tracker.book,
      spaceId,
      projectPath: place.rootPath,
      now: this.now(),
      local: this.tracker.local(),
    }
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
          .map((one) => cardOf(one.record, ctx.local))
          .filter((card) => isQueueable(card, request.target))
      } else {
        const record = own(ctx, tree, request.source.cardId, 'card')
        const card = cardOf(record, ctx.local)

        if (!card.scenario) return { ok: false, code: 'noScenario', cardId: card.id }
        if (isInQueue(card.run)) return { ok: false, code: 'alreadyQueued', cardId: card.id }

        cards = [card]
      }
    } catch (error) {
      if (error instanceof TrackerError) return { ok: false, code: error.code, cardId: null }

      throw error
    }

    // Одни пометки - не очередь: запускать в ней нечего.
    if (!cards.some((card) => card.scenario)) {
      return { ok: false, code: 'nothingToSend', cardId: null }
    }

    const prepared = await this.prepare(place.rootPath, cards)

    if (!Array.isArray(prepared)) return prepared

    return this.place(place, request, prepared, groupTitle)
  }

  /**
   * Все карточки проверяются до первого запуска: отказ не оставит полуочереди. Карточка без
   * сценария идёт пометкой на своём месте.
   */
  private async prepare(
    projectPath: string,
    cards: TrackerCard[],
  ): Promise<Prepared[] | Extract<TrackerSendOutcome, { ok: false }>> {
    const prepared: Prepared[] = []

    for (const card of cards) {
      const binding = card.scenario

      if (!binding) {
        prepared.push({ card, request: null })

        continue
      }

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
    const placeholders: string[] = []
    // Первая карточка со сценарием: её исполнитель готовит worktree очереди, если открывает её
    // пометка, - и её же называет отказ исполнителя или папки.
    const lead = prepared.find((item) => item.request) ?? null
    // «Рядом сразу» для новой очереди - и для карточек за первой: группа, начатая пометкой, иначе
    // отпустила бы папку, пройдя её, и первый сценарий встал бы ждать (ADR 0128).
    const alongside = request.target.kind === 'new' && request.target.alongside === true
    let queueId: string | null = null

    for (const item of prepared) {
      const target: QueueTarget = queueId
        ? { kind: 'queue', queueId, ...(alongside && { alongside }) }
        : request.target
      const hours: { hours?: QueueHours | null } =
        queueId === null && request.target.kind === 'new' ? { hours: request.hours ?? null } : {}
      const outcome: ScenarioStartOutcome = item.request
        ? await this.scenarios.start({ ...item.request, target, ...hours })
        : await this.scenarios.placeholder({
            projectPath: place.rootPath,
            title: item.card.title,
            provider: lead?.request?.provider ?? 'claude',
            target,
            ...hours,
          })

      if (!outcome.ok) {
        if (sent.length > 0) book.commit()

        return { ok: false, code: outcome.code, cardId: refusedCard(item, lead, outcome.code) }
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
        due: item.card.due ? dueKey(item.card.due) : null,
        ...(!item.request && { placeholder: true }),
      })

      if (!item.request) {
        placeholders.push(item.card.id)

        continue
      }

      sent.push(item.card.id)

      // Карточка ушла - прежний отказ запуска в срок больше не про неё.
      const auto = book.autoRuns()[item.card.id]

      if (auto?.failure) book.setAutoRun(item.card.id, { ...auto, failure: null })
    }

    return {
      ok: true,
      board: await this.tracker.board(place),
      queueId: queueId ?? '',
      sent,
      placeholders,
    }
  }
}
