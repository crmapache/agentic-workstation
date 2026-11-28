import type { MarkPoint, WalkthroughPen, WalkthroughPanelView } from '@shared/walkthrough'

import type { Aim } from '../computer/computer-agent'
import { ComputerError, asComputerError } from '../computer/computer-error'
import { windowsChangedAt } from '../computer/computer-seen'
import type { Glance } from '../computer/computer-seen'
import type { Timer } from '../voice/call/utterances'
import type { WalkthroughCall } from './walkthrough-call'
import { boundedSpeech } from './walkthrough-call'
import { WalkthroughListen } from './walkthrough-listen'
import { boxOf, boxAnchors } from './walkthrough-marks'
import { USER_HOLD_MAX_MS } from './walkthrough-stage'
import type { WalkthroughStage } from './walkthrough-stage'

/** Что показу нужно от Computer Use: снимок разговора, окна экрана, ввод человека, мышь ему. */
export type WalkthroughPorts = {
  computer: {
    aim: (key: string, pixels: readonly MarkPoint[]) => Aim
    glance: () => Glance
    quietMs: () => number | null
    /** Человек трогал мышь или клавиатуру после последнего снимка разговора. */
    touched: (key: string) => boolean
    handOver: (key: string) => void
  }
  stage: WalkthroughStage
  timer: Timer
  now: () => number
}

/** Ответ подсветки: не встала (почему; look - модели нужен свежий снимок) или встала в такт. */
export type MarkOutcome = { refusal: string; look: boolean } | { note: string }

/** Пока человек двигает мышь, ИИ ждёт: столько тишины значит «отпустил». */
export const USER_QUIET_MS = 1500

const HOLD_POLL_MS = 250

export const NOT_RUNNING =
  'No walkthrough is running in this chat. The user starts one with the Walkthrough button in the ' +
  'chat header; do not draw on the screen or wait for the user otherwise.'

const SPOKEN_OVER =
  'The user spoke over you before this action, so nothing was done. Listen to what they said.'

const unseenMarks = (count: number) =>
  `While you waited, the user drew ${count === 1 ? 'a mark' : `${count} marks`} and talked about it, so nothing was done. Call user_marks to see what they point at, then go on.`

const SKIPPED =
  'Your previous highlight was not shown: the windows under it changed before your words were spoken. '

const WILL_SHOW =
  'It appears when your earlier words have been spoken, and its say is spoken with it: do not repeat it in your text.'

/**
 * Показ Walkthrough (ADR 0134, 0135) в главном процессе: подсветка в такт голосу звонка, вопросы
 * и практика, инструменты человека и конец. Звонок один на IDE - и показ один.
 *
 * Подсветка - с фразой о том, что подсвечено: фраза встаёт во рот сразу за словами модели до
 * вызова, подсветка появляется, когда они прозвучали, и держится, пока звучит её фраза, - потом
 * следующая. Перебил человек - всё, что стояло в очереди до этого, не рисуется. Действие Computer
 * Use ждёт так же, и ещё - пока человек держит мышь или инструмент: он забрал управление на время.
 */
export class WalkthroughDesk {
  private queue: Promise<void> = Promise.resolve()
  /** Растёт, когда человек перебил: подсветки, вставшие в очередь раньше, уже не к месту. */
  private generation = 0
  private readonly notes = new Map<string, string>()
  private readonly listen: WalkthroughListen

  constructor(private readonly ports: WalkthroughPorts) {
    this.listen = new WalkthroughListen({
      computer: ports.computer,
      isDrawing: () => ports.stage.isDrawing,
      timer: ports.timer,
    })
  }

  /**
   * Звонок показа в разговоре; не идёт - null. Ставит тот, кто знает звонки (ide-features): голос
   * поднимается позже Computer Use.
   */
  call: (conversationId: string) => WalkthroughCall | null = () => null

  /** Показ кончился - вернуть человека к чату (ADR 0135). Ставит тот, кто знает панели и окно. */
  backToChat: (conversationId: string) => void = () => undefined

  /** Идёт ли показ в разговоре: возврат к чату после Computer Use тогда молчит (ADR 0130). */
  isShowing(conversationId: string): boolean {
    return this.call(conversationId) !== null
  }

  /** Звонок показа начался: панель инструментов человека - на экран. */
  started(conversationId: string): void {
    this.ports.stage.open(conversationId)
  }

  /**
   * Подсветить область (углы - в пикселях последнего снимка Computer Use разговора) и сказать о
   * ней say. keep - рядом с прежними подсветками, иначе вместо них.
   */
  async highlight(
    conversationId: string,
    corners: [MarkPoint, MarkPoint],
    say: string,
    keep: boolean,
  ): Promise<MarkOutcome> {
    const call = this.call(conversationId)

    if (!call) return { refusal: NOT_RUNNING, look: false }

    const aim = this.ports.computer.aim(conversationId, corners)

    if ('refusal' in aim) return { refusal: aim.refusal, look: true }

    const box = boxOf([aim.toScreen(corners[0]), aim.toScreen(corners[1])])
    const glance = this.ports.computer.glance()
    const { spoken: prior } = await this.spokenSoFar(call)
    const narration = call.say(say)
    const { generation } = this

    this.enqueue(async () => {
      if (generation !== this.generation || this.call(conversationId)?.id !== call.id) return

      if (!(await prior)) return this.spokenOver()

      if (windowsChangedAt(glance, this.ports.computer.glance(), boxAnchors(box))) {
        this.notes.set(conversationId, SKIPPED)

        return
      }

      this.ports.stage.light(aim.display, box, glance, keep)

      // Подсветка держится, пока звучит её фраза: следующая встанет после неё.
      if (!(await boundedSpeech(narration.spoken, this.ports.timer))) this.spokenOver()
    })

    return { note: `${this.takeNote(conversationId)}${WILL_SHOW}` }
  }

  /** Стереть подсветку и пометки в такт голосу: когда прозвучат слова перед вызовом. */
  async clear(conversationId: string): Promise<string | null> {
    const call = this.call(conversationId)

    if (!call) return NOT_RUNNING

    const { spoken: prior } = await this.spokenSoFar(call)

    this.enqueue(async () => {
      if ((await prior) && this.ports.stage.conversation === conversationId) this.ports.stage.wipe()
    })

    return null
  }

  /**
   * Перед действием Computer Use (ComputerRuntime.beforeAct): дождаться слов модели перед ним и
   * подсветок до него, потом - пока человек отпустит мышь и отложит инструмент, и стереть метки:
   * экран сейчас поменяется. Человек перебил - действие не идёт.
   */
  async beforeAct(conversationId: string, signal: AbortSignal): Promise<void> {
    const call = this.call(conversationId)

    if (!call) return

    const isSpoken = await abortable((await this.spokenSoFar(call)).spoken, signal)

    await abortable(
      this.queue.then(() => true),
      signal,
    )

    if (!isSpoken) {
      this.spokenOver()
      throw new ComputerError('interrupted', SPOKEN_OVER)
    }

    await this.whileUserHolds(conversationId, signal)

    const { stage } = this.ports

    if (stage.conversation !== conversationId) return

    // Человек показал и сказал, о чём, пока действие ждало: оно решено без его пометок - модели
    // сначала посмотреть их. Отказ - один: пометки считаются увиденными, следующее действие идёт.
    const { unseen } = stage

    if (unseen > 0) {
      stage.markSeen()
      throw new ComputerError('interrupted', unseenMarks(unseen))
    }

    stage.wipe()
  }

  /** Практика «попробуй сам»: договорить просьбу, отдать мышь и ждать шага человека. */
  async waitForUser(
    conversationId: string,
    limitMs: number,
    signal?: AbortSignal,
  ): Promise<string> {
    const call = this.call(conversationId)

    if (!call) return NOT_RUNNING

    if (!(await abortable((await this.spokenSoFar(call)).spoken, signal))) return SPOKEN_OVER

    return this.listen.forStep(conversationId, call, limitMs, signal)
  }

  /**
   * Вопрос человеку (ADR 0135): звучит своим ходом голоса после слов модели перед ним, молчание -
   * согласие, у важного вопроса - повтор и конец показа. Ответ - что случилось, словами для модели.
   */
  async ask(
    conversationId: string,
    question: { text: string; critical: boolean },
    signal?: AbortSignal,
  ): Promise<string> {
    const call = this.call(conversationId)

    if (!call) return NOT_RUNNING

    // Мерка нужна, чтобы слова модели перед вопросом успели встать во рот раньше него.
    await abortable(call.speechSoFar(), signal)

    return this.listen.forAnswer(conversationId, call, question, signal)
  }

  /** Реплика человека, пока показ его ждёт: она - ответ ожидания. Забрал - true. */
  intercept(conversationId: string, text: string): boolean {
    return this.listen.intercept(conversationId, text, () => this.drawn(conversationId))
  }

  /** Сколько пометок человек нарисовал к реплике: она уходит модели с этим числом. */
  drawn(conversationId: string): number {
    const { stage } = this.ports

    return stage.conversation === conversationId ? stage.takeDrawn() : 0
  }

  /** Пометки человека на экране - инструменту user_marks; нет их или показа - null. */
  userMarks(conversationId: string): ReturnType<WalkthroughStage['lookAt']> {
    const { stage } = this.ports

    return this.call(conversationId) && stage.conversation === conversationId
      ? stage.lookAt()
      : null
  }

  /** Человек взял или отложил инструмент на панели. */
  pick(pen: WalkthroughPen | null): WalkthroughPanelView {
    return this.ports.stage.pick(pen)
  }

  /** Человек нарисовал пометку (точки экрана). */
  stroke(pen: WalkthroughPen, points: MarkPoint[]): void {
    this.ports.stage.draw(pen, points)
  }

  /** Кнопка «стереть» на панели. */
  erase(): WalkthroughPanelView {
    return this.ports.stage.erase()
  }

  panelView(): WalkthroughPanelView {
    return this.ports.stage.panelView()
  }

  /**
   * Договорить и положить трубку: показ кончился, IDE возвращает человека к чату, конспект модель
   * пишет туда уже без голоса. Человек перебил последние слова («подожди, ещё вопрос») - звонок
   * остаётся.
   */
  async finish(conversationId: string, signal?: AbortSignal): Promise<string> {
    const call = this.call(conversationId)

    if (!call) return NOT_RUNNING

    if (!(await abortable((await this.spokenSoFar(call)).spoken, signal))) {
      return 'The user spoke over your last words, so the call goes on. Listen to what they said.'
    }

    call.end()

    return 'The walkthrough call ended, and the user comes back to this chat. Now write a short recap here: what you showed, the user questions and what stayed unclear. It is no longer read aloud.'
  }

  /**
   * Звонок показа кончился - по любой причине: метки, инструмент и панель уходят, ожидание
   * человека - тоже, и IDE выходит вперёд с этим чатом (ADR 0135). Выход IDE и закрытый разговор -
   * возвращать некуда.
   */
  ended(conversationId: string, reason: string): void {
    if (this.ports.stage.conversation === conversationId) this.ports.stage.close()

    this.listen.ended(conversationId)
    this.notes.delete(conversationId)

    if (reason !== 'shutdown' && reason !== 'conversationGone') this.backToChat(conversationId)
  }

  dispose(): void {
    this.ports.stage.close()
    this.listen.ended(null)
  }

  /**
   * Пока человек показывает сам (инструмент в руке, свежая пометка) или двигает мышь, ИИ ждёт -
   * но не дольше USER_HOLD_MAX_MS.
   */
  private async whileUserHolds(conversationId: string, signal: AbortSignal): Promise<void> {
    const { computer, stage, now } = this.ports
    const started = now()
    const holds = () =>
      stage.isDrawing ||
      (computer.touched(conversationId) && (computer.quietMs() ?? USER_QUIET_MS) < USER_QUIET_MS)

    while (holds() && now() - started <= USER_HOLD_MAX_MS) {
      await abortable(
        new Promise<void>((resolve) => this.ports.timer(resolve, HOLD_POLL_MS)),
        signal,
      )
    }

    // Инструмент забыт в руке - отложить: окно меток ловит мышь, и клик ИИ попал бы в него.
    if (stage.inHand) stage.pick(null)
  }

  /** Человек перебил: всё, что стояло в очереди показа до этого, - не рисовать. */
  private spokenOver(): void {
    this.generation += 1
  }

  /**
   * Прозвучит ли сказанное до этой минуты - но не дольше SPEECH_WAIT_MAX_MS. Сама мерка - после
   * того, как лента показала идущий инструмент: текст перед ним уже во рту. Обёртка, а не голое
   * обещание: async склеил бы его, и вызывающий ждал бы сам голос, а не мерку.
   */
  private async spokenSoFar(call: WalkthroughCall): Promise<{ spoken: Promise<boolean> }> {
    const { spoken } = await call.speechSoFar()

    return { spoken: boundedSpeech(spoken, this.ports.timer) }
  }

  private enqueue(job: () => Promise<void>): void {
    this.queue = this.queue.then(job).catch((error: unknown) => {
      console.warn('[walkthrough] a highlight failed:', error)
    })
  }

  private takeNote(conversationId: string): string {
    const note = this.notes.get(conversationId) ?? ''

    this.notes.delete(conversationId)

    return note
  }
}

/** Обещание или обрыв вызова: Stop, конец хода, отмена провайдером. */
const abortable = <T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> => {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(asComputerError(signal))

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(asComputerError(signal))

    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}
