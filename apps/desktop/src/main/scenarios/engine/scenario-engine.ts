import type { ImageAttachment } from '@shared/claude'
import { planOf } from '@shared/scenario-rules'
import type { RunStep, ScenarioRun } from '@shared/scenario-runs'

import { follow, trySwap, untried, noticeLimit, stopResting, ranIntoLimit } from './engine-accounts'
import { askHead, closeHeadTurn } from './engine-asking'
import { onCardTurnEnded, onCardTurnStarted } from './engine-card'
import type { EngineHost } from './engine-core'
import { TICK_MS, EngineCore, CARD_PHASES } from './engine-core'
import { tell, deliverTold } from './engine-mail'
import { halt, tick, carryOnWords, carryOnFromPause } from './engine-pause'
import { onCardAsk, onHeadAsk, onWithdrawn, answerByPerson } from './engine-questions'
import { cardLine, headLine, openCard, openHead } from './engine-sessions'
import { takeOver, canTakeOver } from './engine-takeover'
import { nextStep, beginStep, freshCardTurn } from './engine-walk'
import { TAKE_OVER_CARRY_ON } from './head-person'
import { openingMessage } from './head-talk'
import { plannedStep, carryOnPoint } from './run-steps'
import type { ScenarioSession } from './scenario-session'

/**
 * Один прогон одного сценария (ScenarioEngine в ACC): форма круга работ - здесь, суждение -
 * голове. Машина состояний, а не прогулка по блокирующему потоку: прогон длится часы и почти
 * всё это время ждёт, что скажет процесс. Ход работы - в модулях engine-*.ts, здесь - вход
 * снаружи и ответы процессам.
 */
export class ScenarioEngine {
  private readonly e: EngineCore

  constructor(start: ScenarioRun, accountId: string, host: EngineHost) {
    this.e = new EngineCore(start, accountId, host)
    this.e.react = {
      line: (session, isHead, message) => this.line(session, isHead, message),
      headTurnEnded: (session) => {
        if (this.e.head !== session) return

        closeHeadTurn(this.e)
        trySwap(this.e)
      },
      cardTurnEnded: (session) => {
        onCardTurnEnded(this.e, session)
        if (this.e.card === session) trySwap(this.e)
      },
      cardTurnStarted: (session) => onCardTurnStarted(this.e, session),
      ask: (session, isHead, ask) =>
        isHead ? onHeadAsk(this.e, session, ask) : onCardAsk(this.e, session, ask),
      withdrawn: (session, requestId) => onWithdrawn(this.e, session, requestId),
      error: (session, isHead, message) => this.failed(session, isHead, message),
      crashed: (session, isHead) => this.crashed(session, isHead),
    }
  }

  get run(): ScenarioRun {
    return this.e.run
  }

  /** Начать: весь план записан до старта, голове - первое сообщение. */
  begin(): void {
    const { e } = this

    e.started = true
    this.joinTheChoice()

    const steps = planOf(e.scenario).map((planned) =>
      plannedStep(planned.key, planned.stageId, planned.cardId, planned.pass, planned.title),
    )

    e.run = { ...e.run, steps, total: steps.length, state: 'running' }
    e.head = openHead(e, '')
    e.phase = 'opening'
    // Часы - до первого сообщения: оно может кончить прогон здесь же, и часы снимет end.
    this.windClock()
    askHead(e, openingMessage(e.scenario, e.host.projectPath, e.run.inputs, steps.length))
    e.changed()
  }

  /**
   * Подхватить законченный прогон с места: голова и карточка поднимаются поверх своих
   * транскриптов и помнят всё; время между концом и подхватом - не работа (idle).
   */
  carryOn(): void {
    const { e } = this
    const point = carryOnPoint(e.run)

    if (!point) return

    e.started = true
    this.joinTheChoice()

    const now = Date.now()
    const cut = e.run.steps[point.at]
    const words = cut ? carryOnWords(cut.verdictReason) : carryOnWords('')
    const headWasFinishing = point.begun && Boolean(cut?.takeOver)
    const gap = e.run.finishedAt > 0 ? Math.max(0, now - e.run.finishedAt) : 0
    const pastGap = (step: RunStep): RunStep =>
      step.stageId !== cut?.stageId || step.startedAt === 0
        ? step
        : {
            ...step,
            startedAt: step.startedAt + gap,
            finishedAt: step.finishedAt > 0 ? step.finishedAt + gap : 0,
          }

    e.run = {
      ...e.run,
      state: 'running',
      finishedAt: 0,
      failure: '',
      error: '',
      question: null,
      limit: null,
      answering: false,
      idle: e.run.idle + gap,
      steps: e.run.steps.map((step, index) => {
        if (index < point.at) return pastGap(step)
        if (index === point.at && point.begun) {
          return {
            ...pastGap(step),
            state: 'waiting' as const,
            finishedAt: 0,
            failure: '' as const,
            error: '',
            said: '',
            verdict: '',
            verdictReason: '',
            takeOver: headWasFinishing ? step.takeOver : '',
          }
        }

        return {
          ...plannedStep(step.key, step.stageId, step.cardId, step.pass, step.title),
          item: step.item ?? null,
        }
      }),
    }
    e.headCost = Math.max(0, e.run.cost - e.run.steps.reduce((sum, step) => sum + step.cost, 0))
    e.cardCost = 0
    e.head = openHead(e, e.run.headConversationId, headWasFinishing)
    e.unfenced = headWasFinishing
    e.tookOver = headWasFinishing
    this.windClock()
    e.at = point.at
    this.reenter(point.begun, headWasFinishing, words)
    e.changed()
    deliverTold(e)
  }

  pause(): void {
    const { e } = this

    if (e.phase === 'over') return

    if (e.phase === 'paused') {
      // Стоял на лимите или переезжал: пауза человека делает его паузу своей.
      if (!e.restingOnLimit && !e.pendingSwap?.thenResume && !e.pendingRelief?.thenResume) return

      stopResting(e)
      if (e.pendingSwap) e.pendingSwap.thenResume = false
      if (e.pendingRelief) e.pendingRelief.thenResume = false

      return e.changed()
    }

    halt(e)
    e.changed()
    deliverTold(e)
  }

  resume(): void {
    const { e } = this

    if (e.phase !== 'paused') return

    if (e.pendingRelief) {
      e.pendingRelief.thenResume = true

      return
    }

    if (e.pendingSwap) {
      e.pendingSwap.thenResume = true

      return
    }

    stopResting(e)
    carryOnFromPause(e)
  }

  stop(): void {
    this.e.end('stopped', 'stopped', '')
  }

  /** Прогон не завёлся: снять поднятое, ничего не сообщая (неудачу пишет стол). */
  abandon(): void {
    if (this.e.phase !== 'over') this.e.takeEverythingDown()
  }

  answer(allow: boolean, text: string): void {
    answerByPerson(this.e, allow, text)
  }

  tell(text: string, images: readonly ImageAttachment[], tokens: unknown): boolean {
    return tell(this.e, text, images, tokens)
  }

  /** Человек выбрал аккаунт (или выбор разослали заново). */
  follow(to: string): void {
    follow(this.e, to)
  }

  /** Выбор аккаунта на момент старта: сделанный между созданием и стартом не теряется. */
  private joinTheChoice() {
    const chosen = this.e.host.accounts.current()

    this.e.accountId = chosen
    this.e.followedChoice = chosen
  }

  private windClock() {
    if (this.e.clock) clearInterval(this.e.clock)

    this.e.clock = setInterval(() => {
      try {
        tick(this.e)
        deliverTold(this.e)
      } catch (error) {
        console.warn('[scenarios] часы прогона споткнулись:', error)
      }
    }, TICK_MS)
    this.e.clock.unref()
  }

  /** Куда войти при подхвате: голова доделывала, карточка оборвана, до неё или между ними. */
  private reenter(begun: boolean, headWasFinishing: boolean, words: string) {
    const { e } = this
    const step = e.step
    const card = e.cardOf(step)

    if (headWasFinishing && step) {
      e.editStep(step.key, (one) => ({ ...one, state: 'running' }))
      e.phase = 'takeover'
      e.windCardClock()

      return askHead(e, TAKE_OVER_CARRY_ON)
    }

    if (begun && step && card && step.conversationId) {
      e.nudges = 0
      e.cardCost = step.cost
      freshCardTurn(e)
      e.editStep(step.key, (one) => ({ ...one, state: 'running' }))
      e.card = openCard(
        e,
        step,
        card,
        e.host.onDisk(step.conversationId) ? step.conversationId : '',
      )
      e.phase = 'card'
      e.windCardClock()
      e.card.sendPrompt(words)

      return
    }

    if (begun) return beginStep(e)

    if (e.at === 0) {
      e.phase = 'opening'

      return askHead(
        e,
        openingMessage(e.scenario, e.host.projectPath, e.run.inputs, e.run.steps.length),
      )
    }

    e.at -= 1
    nextStep(e)
  }

  private line(session: ScenarioSession, isHead: boolean, message: Parameters<typeof headLine>[1]) {
    const { e } = this

    if ((isHead ? e.head : e.card) !== session) return

    noticeLimit(e, session, message)

    if (isHead) headLine(e, message)
    else cardLine(e, message)
  }

  /** Процесс не поднялся или не принял сообщение. */
  private failed(session: ScenarioSession, isHead: boolean, message: string) {
    const { e } = this

    if (e.phase === 'over' || (isHead ? e.head : e.card) !== session) return
    if (!isHead && e.phase === 'takeover') return
    if (e.settlingAccount()) return
    if (untried(e, session)) return ranIntoLimit(e, 'unfit')

    const failure = isHead
      ? e.run.headConversationId && e.host.onDisk(e.run.headConversationId)
        ? 'refused'
        : 'noHead'
      : 'noStart'

    e.end('failed', failure, message)
  }

  /** Процесс ушёл сам. Карточка посреди работы - работа голове, если так настроено. */
  private crashed(session: ScenarioSession, isHead: boolean) {
    const { e } = this

    if (e.phase === 'over' || (isHead ? e.head : e.card) !== session) return
    if (!isHead && (e.phase === 'takeover' || e.tookOver)) return
    if (e.settlingAccount()) return
    if (untried(e, session)) return ranIntoLimit(e, 'unfit')

    const step = e.step

    if (!isHead && CARD_PHASES.has(e.phase) && step && canTakeOver(e, false)) {
      return takeOver(e, step, 'its process went away', step.said || step.summary)
    }

    e.end(
      'failed',
      'crashed',
      isHead ? 'the head’s process went away' : 'a step’s process went away',
    )
  }
}
