import type { Glance } from '../computer/computer-seen'
import type { Timer } from '../voice/call/utterances'
import type { WalkthroughCall } from './walkthrough-call'
import { boundedSpeech } from './walkthrough-call'
import { watchForUser, waitForSilence } from './walkthrough-wait'
import type { UserMove } from './walkthrough-wait'

/**
 * Сколько тишины после обычного вопроса значит «да» (ADR 0135): человек успел бы ответить, а
 * показ не стоит. Важный вопрос (отправить, купить, удалить) ждёт дольше, его повторяют.
 */
export const ASK_SILENCE_MS = 8000
export const CRITICAL_SILENCE_MS = 12_000

export type ListenPorts = {
  computer: {
    glance: () => Glance
    quietMs: () => number | null
    /** Отдать мышь человеку: показ просит его сделать шаг самому. */
    handOver: (key: string) => void
  }
  /** Человек показывает сам: инструмент в руке или свежая пометка - он рисует, а не молчит. */
  isDrawing: () => boolean
  timer: Timer
}

/** Ожидание человека: чего ждёт разговор и как сказать ему, что дождались. */
type Waiting = { conversationId: string; done: (move: UserMove) => void }

const drawnNote = (drawn: number): string =>
  drawn > 0
    ? ` While saying it they drew ${drawn === 1 ? 'a mark' : `${drawn} marks`} on the screen: call user_marks to see what they point at.`
    : ''

const GO_ON =
  'No answer: the IDE told the user you take the silence as a yes and go on. Go on now, without saying that again.'

const GAVE_UP =
  'No answer to this critical question, asked twice: the walkthrough call ended, and the user comes back to this chat. Do not do this step. In the chat, write in one line what is left to do.'

const answerText = (move: UserMove): string => {
  switch (move.kind) {
    case 'said':
      return `The user answered: "${move.text}".${drawnNote(move.drawn)}`
    case 'replaced':
      return 'You started waiting for the user again, so this question ended.'
    case 'ended':
      return 'The walkthrough ended.'
    case 'acted':
    case 'timeout':
      return GO_ON
  }
}

const stepText = (move: UserMove, limitMs: number): string => {
  switch (move.kind) {
    case 'acted':
      return 'The user did something on the screen and stopped. Take a Computer Use screenshot to check it. If the step is not done yet, give a short hint and wait again.'
    case 'said':
      return `The user said: "${move.text}". Answer them; take a screenshot first if it is about the screen.${drawnNote(move.drawn)}`
    case 'timeout':
      return `Nothing happened for ${Math.round(limitMs / 1000)} s. Ask whether the user needs help, or show the step yourself.`
    case 'replaced':
      return 'You started waiting for the user again, so this wait ended.'
    case 'ended':
      return 'The walkthrough ended.'
  }
}

/**
 * Показ ждёт человека (ADR 0134, 0135): шага в практике или ответа на вопрос. Пока ждёт, звонок
 * слушает (агент для ушей не занят: «да» - ответ, а не поддакивание), а реплика человека - ответ
 * ожидания, а не новое сообщение в чат. Ждёт один разговор за раз: новое ожидание снимает прежнее.
 */
export class WalkthroughListen {
  private waiting: Waiting | null = null

  constructor(private readonly ports: ListenPorts) {}

  /** Практика: отдать мышь человеку и ждать, пока он сделает шаг и затихнет, скажет что-то или выйдет время. */
  async forStep(
    conversationId: string,
    call: WalkthroughCall,
    limitMs: number,
    signal: AbortSignal | undefined,
  ): Promise<string> {
    const { computer, timer } = this.ports
    const wait = this.open(conversationId, signal)

    computer.handOver(conversationId)
    call.listen(true)

    const stop = watchForUser({
      glance: () => computer.glance(),
      quietMs: () => computer.quietMs(),
      isHolding: () => this.ports.isDrawing(),
      timer,
      limitMs,
      done: wait.done,
    })

    try {
      return stepText(await wait.move, limitMs)
    } finally {
      stop()
      call.listen(false)
      wait.close()
    }
  }

  /**
   * Вопрос человеку: звонок задаёт его своим ходом голоса (вопросительной интонацией) и ждёт ответа.
   * Тишина на обычный вопрос - согласие: звонок говорит, что идёт дальше. На важный - повторяет
   * вопрос, а после второй тишины прощается и кладёт трубку: IDE возвращает человека к чату.
   */
  async forAnswer(
    conversationId: string,
    call: WalkthroughCall,
    question: { text: string; critical: boolean },
    signal: AbortSignal | undefined,
  ): Promise<string> {
    const { timer } = this.ports
    const wait = this.open(conversationId, signal)
    let stopSilence = (): void => undefined
    // Ответ может прийти и пока звучит вопрос: человек перебил - его слова и есть ответ.
    const answerOr = (spoken: Promise<boolean>) =>
      Promise.race([wait.move, boundedSpeech(spoken, timer).then(() => null)])
    const silence = () =>
      new Promise<UserMove>((resolve) => {
        stopSilence = waitForSilence({
          // Человек рисует ответ - это не молчание, так же как пока он говорит.
          isHearing: () => call.hearing() || this.ports.isDrawing(),
          timer,
          ms: question.critical ? CRITICAL_SILENCE_MS : ASK_SILENCE_MS,
          done: () => resolve({ kind: 'timeout' }),
        })
      })

    try {
      const early = await answerOr(call.say(question.text).spoken)

      if (early) return answerText(early)

      call.listen(true)

      for (let round = 1; round <= 2; round += 1) {
        const move = await Promise.race([wait.move, silence()])

        stopSilence()

        if (move.kind !== 'timeout') return answerText(move)

        if (!question.critical) {
          call.cue({ kind: 'goOn' })

          return GO_ON
        }

        if (round === 1) {
          const again = await answerOr(
            call.cue({ kind: 'askAgain', question: question.text }).spoken,
          )

          if (again) return answerText(again)
        }
      }

      await boundedSpeech(call.cue({ kind: 'giveUp' }).spoken, timer)
      call.end('silence')

      return GAVE_UP
    } finally {
      stopSilence()
      call.listen(false)
      wait.close()
    }
  }

  /** Реплика человека, пока показ его ждёт: она - ответ ожидания. Забрал - true. */
  intercept(conversationId: string, text: string, drawn: () => number): boolean {
    if (this.waiting?.conversationId !== conversationId) return false

    this.waiting.done({ kind: 'said', text, drawn: drawn() })

    return true
  }

  /** Показ кончился: ждать больше некого. */
  ended(conversationId: string | null): void {
    if (conversationId === null || this.waiting?.conversationId === conversationId) {
      this.waiting?.done({ kind: 'ended' })
    }
  }

  /**
   * Начать ждать: прежнее ожидание снимается, обрыв вызова (Stop, конец хода) - конец ожидания.
   * move сбывается первым же исходом, close - убрать за собой.
   */
  private open(conversationId: string, signal: AbortSignal | undefined) {
    this.waiting?.done({ kind: 'replaced' })

    let resolve: (move: UserMove) => void = () => undefined
    const move = new Promise<UserMove>((settle) => {
      resolve = settle
    })
    const onAbort = () => entry.done({ kind: 'ended' })
    const close = () => {
      if (this.waiting === entry) this.waiting = null
      signal?.removeEventListener('abort', onAbort)
    }
    const entry: Waiting = {
      conversationId,
      done: (result) => {
        close()
        resolve(result)
      },
    }

    this.waiting = entry
    if (signal?.aborted) onAbort()
    else signal?.addEventListener('abort', onAbort, { once: true })

    return { move, done: entry.done, close }
  }
}
