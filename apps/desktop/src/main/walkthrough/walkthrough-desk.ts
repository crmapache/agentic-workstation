import type { MarkPoint } from '@shared/walkthrough'

import type { Aim } from '../computer/computer-agent'
import { ComputerError, asComputerError } from '../computer/computer-error'
import type { Rect } from '../computer/computer-geometry'
import { windowsChangedAt } from '../computer/computer-seen'
import type { Glance } from '../computer/computer-seen'
import type { Timer } from '../voice/call/utterances'
import type { MarkRequest } from './walkthrough-marks'
import { markIn, movedBy, pointsOf, anchorsOf } from './walkthrough-marks'
import { watchForUser } from './walkthrough-wait'
import type { UserMove } from './walkthrough-wait'

/**
 * Звонок показа в разговоре: его id (по нему метка узнаёт, что звонок тот же, - обёртку каждый
 * раз дают новую), такт голоса (VoiceCall.speechSoFar) и конец.
 */
export type WalkthroughCall = {
  id: string
  speechSoFar: () => Promise<{ spoken: Promise<boolean> }>
  end: () => void
}

/** Что показу нужно от Computer Use: снимок разговора, окна экрана, мышь человеку, окно меток. */
export type WalkthroughPorts = {
  computer: {
    aim: (key: string, pixels: readonly MarkPoint[]) => Aim
    glance: () => Glance
    quietMs: () => number | null
    handOver: (key: string) => void
  }
  window: {
    show: (area: Rect, mark: (origin: MarkPoint) => ReturnType<typeof markIn>[]) => void
    hide: () => void
  }
  timer: Timer
}

/** Метка на экране: что нарисовано, её номер и какие окна были, когда её ставили. */
type Shown = { request: MarkRequest; id: number; glance: Glance }

/** Ответ метки: не нарисована (почему; look - модели нужен свежий снимок) или поставлена в такт. */
export type MarkOutcome = { refusal: string; look: boolean } | { note: string }

/** Как часто сверять окна под метками: окно уехало - метки уходят. */
const WATCH_MS = 500

/**
 * Дольше этого голос не ждём: синтез завис или конечная точка молчит о проигранном - метка и
 * действие идут, а не висят вечно. Самая длинная фраза показа звучит заметно меньше.
 */
export const SPEECH_WAIT_MAX_MS = 45_000

export const NOT_RUNNING =
  'No walkthrough is running in this chat. The user starts one with the Walkthrough button in the ' +
  'chat header; do not draw on the screen or wait for the user otherwise.'

const SPOKEN_OVER =
  'The user spoke over you before this action, so nothing was done. Listen to what they said.'

const SKIPPED =
  'Your previous mark was not drawn: the windows under it changed before your words were spoken. '

const WILL_SHOW = 'It appears on the screen when your words before this call have been spoken.'

/**
 * Показ Walkthrough (ADR 0134) в главном процессе: метки, их такт с голосом звонка, ожидание
 * действия человека и конец. Звонок один на IDE - и показ один; метки принадлежат разговору,
 * который их поставил.
 *
 * Метка не рисуется сразу: она ждёт, пока прозвучат слова модели до её вызова (иначе обгоняла бы
 * голос на секунды), и встаёт в очередь за прежними. Действие Computer Use ждёт так же и стирает
 * метки - экран сейчас поменяется. Окна под меткой поменялись - метки уходят сами.
 */
export class WalkthroughDesk {
  private owner: string | null = null
  private area: Rect | null = null
  private shown: Shown[] = []
  private nextId = 0
  private queue: Promise<void> = Promise.resolve()
  private stopWatch: (() => void) | null = null
  private readonly notes = new Map<string, string>()
  private waiting: { conversationId: string; done: (move: UserMove) => void } | null = null

  constructor(private readonly ports: WalkthroughPorts) {}

  /**
   * Звонок показа в разговоре; не идёт - null. Ставит тот, кто знает звонки (ide-features): голос
   * поднимается позже Computer Use.
   */
  call: (conversationId: string) => WalkthroughCall | null = () => null

  /** Идёт ли показ в разговоре: возврат к чату после Computer Use тогда молчит (ADR 0130). */
  isShowing(conversationId: string): boolean {
    return this.call(conversationId) !== null
  }

  /**
   * Поставить метку в такт голосу: request - в пикселях последнего снимка Computer Use разговора.
   * keep - к прежним меткам, иначе вместо них.
   */
  async mark(conversationId: string, request: MarkRequest, keep: boolean): Promise<MarkOutcome> {
    const call = this.call(conversationId)

    if (!call) return { refusal: NOT_RUNNING, look: false }

    const aim = this.ports.computer.aim(conversationId, pointsOf(request))

    if ('refusal' in aim) return { refusal: aim.refusal, look: true }

    const onScreen = movedBy(request, aim.toScreen)
    const glance = this.ports.computer.glance()
    const { spoken } = await this.spokenSoFar(call)

    this.enqueue(async () => {
      if (!(await spoken) || this.call(conversationId)?.id !== call.id) return

      if (windowsChangedAt(glance, this.ports.computer.glance(), anchorsOf(onScreen))) {
        this.notes.set(conversationId, SKIPPED)

        return
      }

      this.draw(conversationId, aim.display.bounds, { request: onScreen, id: 0, glance }, keep)
    })

    return { note: `${this.takeNote(conversationId)}${WILL_SHOW}` }
  }

  /** Стереть метки в такт голосу: когда прозвучат слова перед вызовом. */
  async clear(conversationId: string): Promise<string | null> {
    const call = this.call(conversationId)

    if (!call) return NOT_RUNNING

    const { spoken } = await this.spokenSoFar(call)

    this.enqueue(async () => {
      if ((await spoken) && this.owner === conversationId) this.wipe()
    })

    return null
  }

  /**
   * Перед действием Computer Use (ComputerRuntime.beforeAct): дождаться слов модели перед ним и
   * меток, поставленных до него, потом стереть метки. Человек перебил - действие не идёт.
   */
  async beforeAct(conversationId: string, signal: AbortSignal): Promise<void> {
    const call = this.call(conversationId)

    if (!call) return

    const isSpoken = await abortable((await this.spokenSoFar(call)).spoken, signal)

    await abortable(
      this.queue.then(() => true),
      signal,
    )

    if (this.owner === conversationId) this.wipe()
    if (!isSpoken) throw new ComputerError('interrupted', SPOKEN_OVER)
  }

  /**
   * Практика «попробуй сам»: договорить просьбу, отдать мышь человеку и ждать, пока он сделает шаг
   * и затихнет, скажет что-то или выйдет время. Ответ - что случилось, словами для модели.
   */
  async waitForUser(
    conversationId: string,
    limitMs: number,
    signal?: AbortSignal,
  ): Promise<string> {
    const call = this.call(conversationId)

    if (!call) return NOT_RUNNING

    if (!(await abortable((await this.spokenSoFar(call)).spoken, signal))) return SPOKEN_OVER

    this.waiting?.done({ kind: 'replaced' })
    this.ports.computer.handOver(conversationId)

    const move = await new Promise<UserMove>((resolve) => {
      const stop = watchForUser({
        glance: () => this.ports.computer.glance(),
        quietMs: () => this.ports.computer.quietMs(),
        timer: this.ports.timer,
        limitMs,
        done: (result) => done(result),
      })
      const onAbort = () => done({ kind: 'ended' })
      const done = (result: UserMove) => {
        stop()
        signal?.removeEventListener('abort', onAbort)
        if (this.waiting?.done === done) this.waiting = null
        resolve(result)
      }

      signal?.addEventListener('abort', onAbort, { once: true })
      this.waiting = { conversationId, done }
    })

    return moveText(move, limitMs)
  }

  /** Реплика человека, пока агент ждёт его действия: она - ответ ожидания. Забрал - true. */
  intercept(conversationId: string, text: string): boolean {
    if (this.waiting?.conversationId !== conversationId) return false

    this.waiting.done({ kind: 'said', text })

    return true
  }

  /**
   * Договорить и положить трубку: показ кончился, конспект модель пишет в чат уже без голоса.
   * Человек перебил последние слова («подожди, ещё вопрос») - звонок остаётся.
   */
  async finish(conversationId: string, signal?: AbortSignal): Promise<string> {
    const call = this.call(conversationId)

    if (!call) return NOT_RUNNING

    if (!(await abortable((await this.spokenSoFar(call)).spoken, signal))) {
      return 'The user spoke over your last words, so the call goes on. Listen to what they said.'
    }

    call.end()

    return 'The walkthrough call ended. Now write a short recap in the chat: what you showed, the user questions and what stayed unclear. It is no longer read aloud.'
  }

  /** Звонок показа кончился: метки уходят, ожидание человека - тоже. */
  ended(conversationId: string): void {
    if (this.owner === conversationId) this.wipe()
    if (this.waiting?.conversationId === conversationId) this.waiting.done({ kind: 'ended' })

    this.notes.delete(conversationId)
  }

  dispose(): void {
    this.wipe()
    this.waiting?.done({ kind: 'ended' })
  }

  private draw(conversationId: string, area: Rect, mark: Shown, keep: boolean): void {
    const sameArea =
      this.area !== null &&
      this.area.x === area.x &&
      this.area.y === area.y &&
      this.area.width === area.width &&
      this.area.height === area.height
    const kept = keep && this.owner === conversationId && sameArea ? this.shown : []

    this.nextId += 1
    this.owner = conversationId
    this.area = area
    this.shown = [...kept, { ...mark, id: this.nextId }]
    this.ports.window.show(area, (origin) =>
      // Затемнение - снизу: обводка и стрелка поверх него.
      [...this.shown]
        .sort(
          (a, b) => Number(b.request.kind === 'spotlight') - Number(a.request.kind === 'spotlight'),
        )
        .map(({ request, id }) => markIn(request, id, area, origin)),
    )
    this.watch()
  }

  /** Сверять окна под метками, пока они на экране: окно уехало или закрылось - стереть. */
  private watch(): void {
    if (this.stopWatch) return

    const tick = () => {
      const now = this.ports.computer.glance()
      const moved = this.shown.some(
        ({ request, glance }) => windowsChangedAt(glance, now, anchorsOf(request)) !== null,
      )

      if (moved) this.wipe()
      else this.stopWatch = this.ports.timer(tick, WATCH_MS)
    }

    this.stopWatch = this.ports.timer(tick, WATCH_MS)
  }

  private wipe(): void {
    this.stopWatch?.()
    this.stopWatch = null
    this.owner = null
    this.area = null

    if (this.shown.length === 0) return

    this.shown = []
    this.ports.window.hide()
  }

  /**
   * Прозвучит ли сказанное до этой минуты - но не дольше SPEECH_WAIT_MAX_MS: тогда «да». Обёртка,
   * а не голое обещание: async склеил бы его, и вызывающий ждал бы сам голос, а не мерку.
   */
  private async spokenSoFar(call: WalkthroughCall): Promise<{ spoken: Promise<boolean> }> {
    const { spoken } = await call.speechSoFar()
    let cancel = (): void => undefined
    const late = new Promise<boolean>((resolve) => {
      cancel = this.ports.timer(() => resolve(true), SPEECH_WAIT_MAX_MS)
    })

    return { spoken: Promise.race([spoken, late]).finally(cancel) }
  }

  private enqueue(job: () => Promise<void>): void {
    this.queue = this.queue.then(job).catch((error: unknown) => {
      console.warn('[walkthrough] a mark failed:', error)
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

const moveText = (move: UserMove, limitMs: number): string => {
  switch (move.kind) {
    case 'acted':
      return 'The user did something on the screen and stopped. Take a Computer Use screenshot to check it. If the step is not done yet, give a short hint and wait again.'
    case 'said':
      return `The user said: "${move.text}". Answer them; take a screenshot first if it is about the screen.`
    case 'timeout':
      return `Nothing happened for ${Math.round(limitMs / 1000)} s. Ask whether the user needs help, or show the step yourself.`
    case 'replaced':
      return 'You started waiting for the user again, so this wait ended.'
    case 'ended':
      return 'The walkthrough ended.'
  }
}
