import type { ImageAttachment } from '@shared/claude'
import type { RunStep, RunState, RunFailure, ScenarioRun } from '@shared/scenario-runs'
import { isStepOver, isStepBegun } from '@shared/scenario-runs'
import type { Scenario, ScenarioCard, ScenarioStage } from '@shared/scenarios'

import type { CliMessage } from '../../claude/cli/cli-messages'
import type { ReliefCandidate } from './limit-relief'
import type { CardAsk } from './run-mail'
import { noteStamp } from './run-mail'
import { followClock } from './run-steps'
import type { SessionSpawn, ScenarioSession } from './scenario-session'
import type { BackgroundWork } from './stream-reading'
import { TurnEndings } from './stream-reading'

/** Чего движок ждёт. Ровно одно в каждый момент. */
export type Phase =
  | 'opening'
  | 'list'
  | 'slots'
  | 'card'
  | 'question'
  | 'verdict'
  | 'again'
  | 'blocked'
  | 'takeover'
  | 'paused'
  | 'over'

/** Фазы, в которых ждут голову и только её. */
export const HEAD_PHASES: ReadonlySet<Phase> = new Set([
  'opening',
  'list',
  'slots',
  'question',
  'verdict',
  'again',
])

/** Фазы, в которых ход карточки открыт: работает или стоит на вопросе. */
export const CARD_PHASES: ReadonlySet<Phase> = new Set(['card', 'question', 'blocked'])

/** Фазы, в которых от головы ничего не ждут: слова человека могут быть отдельным ходом. */
export const WAITING_PHASES: ReadonlySet<Phase> = new Set(['card', 'blocked', 'paused'])

/** Работа карточки (и головы на её месте) - не дольше трёх часов. */
export const CARD_CEILING_MS = 3 * 60 * 60 * 1000

/** Ответ головы - полчаса: её работа - фраза и маленький объект. */
export const HEAD_CEILING_MS = 30 * 60 * 1000

export const TICK_MS = 30_000
export const SWAP_GRACE_MS = 8_000
export const UNFIT_MS = 60 * 60 * 1000
export const SAID_CHARS = 1200
export const SUMMARY_CHARS = 4000
export const NOTE_CHARS = 1200
export const TAKE_OVER_CHARS = 400
export const DETAIL_CHARS = 2000

export const shorten = (text: string, limit: number): string =>
  text.length <= limit ? text : `${text.slice(0, limit)}...`

/** Аккаунты для прогона: выбор человека, имена, кандидаты на переезд, общая память отказов. */
export type EngineAccounts = {
  current: () => string
  label: (id: string) => string
  /** Кандидаты на переезд; here - аккаунт прогона: его двойник отказывает вместе с ним. */
  candidates: (here: string, now: number) => ReliefCandidate[]
  /** Один и тот же вход под двумя именами - переезд между ними ничего не меняет. */
  same: (left: string, right: string) => boolean
  noteRefused: (id: string, until: number) => void
}

/** Что движку нужно от IDE. */
export type EngineHost = {
  projectPath: string
  spawn: SessionSpawn
  /** Есть ли транскрипт разговора на диске: поднимать ли поверх него. */
  onDisk: (sessionId: string) => boolean
  transcriptPath: (sessionId: string) => string | null
  newSessionId: () => string
  /** Модель и усилие новой вкладки - на них идут пустые поля сценария. */
  defaults: () => { model: string; effort: string }
  accounts: EngineAccounts
  onChange: (run: ScenarioRun) => void
  onFinished: (run: ScenarioRun) => void
  /** Позвать человека: прогон встал на вопросе. */
  notify: (body: string) => void
  /** Разговор прогона - в книжку скрытых из истории. */
  noteConversation: (id: string) => void
}

/** Как движок отвечает своим процессам: подключает фасад (scenario-engine.ts). */
export type EngineReactions = {
  line: (session: ScenarioSession, isHead: boolean, message: CliMessage) => void
  headTurnEnded: (session: ScenarioSession) => void
  cardTurnEnded: (session: ScenarioSession) => void
  cardTurnStarted: (session: ScenarioSession) => void
  ask: (session: ScenarioSession, isHead: boolean, ask: CardAsk) => void
  withdrawn: (session: ScenarioSession, requestId: string) => void
  error: (session: ScenarioSession, isHead: boolean, message: string) => void
  crashed: (session: ScenarioSession, isHead: boolean) => void
}

/** Переезд на другой аккаунт в пути: процессы заменятся, когда ходы закроются. */
export type Swap = { to: string; borrowed: boolean; thenResume: boolean }

/** Отказ лимита, который пережидают: решение, куда идти, - вне потока процесса. */
export type Relief = {
  window: string
  resets: number
  reason: 'limit' | 'unfit'
  thenResume: boolean
}

/**
 * Состояние одного прогона и мелкие общие действия над ним. Сам ход работы - в модулях
 * engine-*.ts, которые берут это состояние первым аргументом: движок ACC - три тысячи строк,
 * здесь он разложен по ответственности.
 */
export class EngineCore {
  readonly scenario: Scenario
  run: ScenarioRun
  accountId: string
  borrowed = false
  head: ScenarioSession | null = null
  card: ScenarioSession | null = null
  private current: Phase = 'opening'
  at = 0
  nudges = 0
  tookOver = false
  unfenced = false
  pendingHead = ''
  headAskedAt = 0
  questions: CardAsk[] = []
  deciding = ''
  readonly headTurn = new TurnEndings()
  readonly cardTurn = new TurnEndings()
  headCost = 0
  cardCost = 0
  helpers: BackgroundWork | null = null
  heldEndings: string[] = []
  judged: string[] = []
  cardWaits = false
  interrupting = false
  cardTurnEnded = false
  resumeTo: Phase = 'opening'
  reasked = false
  headTalking = false
  answeringPerson = false
  carrying: number[] = []
  personAskedAt = 0
  deferred = false
  forCardOnResume = ''
  readonly toldImages = new Map<number, ImageAttachment[]>()
  carryingImages = new Map<number, ImageAttachment[]>()
  clock: NodeJS.Timeout | null = null
  lastStop: { window: string; resetsAt: number } | null = null
  pendingSwap: Swap | null = null
  swapTimer: NodeJS.Timeout | null = null
  restingOnLimit = false
  restTimer: NodeJS.Timeout | null = null
  mailTimer: NodeJS.Timeout | null = null
  cardStartsOver = false
  readonly refusals = new Map<string, number>()
  pendingRelief: Relief | null = null
  readonly provenModels = new Set<string>()
  started = false
  followedChoice: string
  cardStartedAt = 0
  pausedAt = 0
  pausedFor = 0
  /** Ответы процессам - подключает фасад до первого процесса. */
  react: EngineReactions | null = null

  constructor(
    start: ScenarioRun,
    accountId: string,
    readonly host: EngineHost,
  ) {
    this.run = start
    this.scenario = start.snapshot
    this.accountId = accountId
    this.followedChoice = accountId
  }

  get phase(): Phase {
    return this.current
  }

  /** Фаза и часы прогона вместе: пауза и вопрос человеку - стоянка, остальное - работа. */
  set phase(value: Phase) {
    this.current = value
    this.run = followClock(this.run, value === 'paused' || value === 'blocked', this.at, Date.now())
  }

  get step(): RunStep | undefined {
    return this.run.steps[this.at]
  }

  stageOf(step: RunStep | undefined): ScenarioStage | undefined {
    return this.scenario.stages.find((stage) => stage.id === step?.stageId)
  }

  cardOf(step: RunStep | undefined): ScenarioCard | undefined {
    return this.stageOf(step)?.cards.find((card) => card.id === step?.cardId)
  }

  editStep(key: string, change: (step: RunStep) => RunStep): void {
    this.run = {
      ...this.run,
      steps: this.run.steps.map((step) => (step.key === key ? change(step) : step)),
    }
  }

  editHere(change: (step: RunStep) => RunStep): void {
    const step = this.step

    if (step) this.editStep(step.key, change)
  }

  /** Фразы головы - в таймлайн, туда, где сказаны. */
  note(text: string, stepKey: string, relayed = ''): void {
    this.run = {
      ...this.run,
      notes: [
        ...this.run.notes,
        {
          at: noteStamp(this.run.notes, Date.now()),
          stepKey,
          text: shorten(text, NOTE_CHARS),
          who: '',
          deliveredAt: 0,
          relayed: shorten(relayed, NOTE_CHARS),
        },
      ],
    }
  }

  changed(): void {
    try {
      this.host.onChange(this.run)
    } catch (error) {
      console.warn('[scenarios] слушатель прогона упал:', error)
    }
  }

  hold(): void {
    if (this.pausedAt === 0) this.pausedAt = Date.now()
  }

  release(): void {
    if (this.pausedAt === 0) return

    this.pausedFor += Date.now() - this.pausedAt
    this.pausedAt = 0
  }

  /** Часы карточки с начала: новый ход, новые три часа. */
  windCardClock(): void {
    this.cardStartedAt = Date.now()
    this.pausedFor = 0
    this.pausedAt = 0
  }

  closeCard(): void {
    this.card?.stop()
    this.card = null
  }

  /** Отказ прогону именно на этом аккаунте ещё в силе. */
  refusedHere(): boolean {
    return (this.refusals.get(this.accountId) ?? 0) > Date.now()
  }

  /** Процессы заменяются или пережидается лимит: смерть процесса сейчас - не новость. */
  settlingAccount(): boolean {
    return this.pendingSwap !== null || this.pendingRelief !== null || this.restingOnLimit
  }

  /** Всё, что прогон держит живым: процессы, часы, вопросы. */
  takeEverythingDown(): void {
    this.phase = 'over'
    this.answeringPerson = false
    this.deferred = false
    this.toldImages.clear()
    this.carryingImages = new Map()

    for (const timer of [this.clock, this.swapTimer, this.restTimer, this.mailTimer]) {
      if (timer) clearTimeout(timer)
    }

    this.clock = null
    this.swapTimer = null
    this.restTimer = null
    this.mailTimer = null
    this.pendingSwap = null
    this.pendingRelief = null
    this.restingOnLimit = false
    this.closeCard()
    this.head?.stop()
    this.head = null
    this.questions = []
    this.deciding = ''
  }

  /**
   * Конец прогона. Карточки в воздухе различаются по тому, начались ли: не дошедшая -
   * пропущена, оборванная посреди дела - упала (её работа может лежать на диске наполовину).
   */
  end(state: RunState, failure: RunFailure, error: string): void {
    if (this.phase === 'over') return

    this.takeEverythingDown()

    const now = Date.now()

    this.run = {
      ...this.run,
      state,
      finishedAt: now,
      failure: failure || this.run.failure,
      error: error || this.run.error,
      question: null,
      answering: false,
      limit: null,
      steps: this.run.steps.map((step) => {
        if (isStepOver(step.state)) return step

        const begun = isStepBegun(step.state)
        const own: RunFailure = state === 'stopped' ? 'stopped' : 'crashed'

        return {
          ...step,
          state: begun ? 'failed' : 'skipped',
          failure: step.failure || (begun ? own : ''),
          finishedAt: step.finishedAt > 0 ? step.finishedAt : now,
          said: '',
        }
      }),
    }
    this.changed()
    this.host.onFinished(this.run)
  }
}
