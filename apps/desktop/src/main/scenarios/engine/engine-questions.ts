import type { RunStep } from '@shared/scenario-runs'

import { askHead } from './engine-asking'
import { turnOver } from './engine-card'
import type { EngineCore } from './engine-core'
import { shorten, DETAIL_CHARS } from './engine-core'
import { judgeHead } from './head-fence'
import { questionRequest } from './head-judging'
import type { ReplyBody } from './head-reply'
import { replyFlag, replyText } from './head-reply'
import type { CardAsk } from './run-mail'
import { askTitle, askAnswers, askOptions, takeOverVerdict } from './run-mail'
import type { ScenarioSession } from './scenario-session'

/**
 * Вопросы, на которых карточка встаёт (onCardQuestion … writeAnswer в ACC): разрешение,
 * которого её доверие не покрыло, или вопрос словами. Решает голова или человек - как
 * сказано в сценарии. Вопросов бывает несколько за раз - очередью, по одному, по порядку.
 */

const detailOf = (ask: CardAsk): string => shorten(JSON.stringify(ask.input), DETAIL_CHARS)

/** Вопрос, который видит человек, и звонок к нему. */
const standOn = (e: EngineCore, step: RunStep, ask: CardAsk) => {
  const title = askTitle(ask)

  e.editStep(step.key, (one) => ({ ...one, state: 'asking' }))
  e.run = {
    ...e.run,
    question: {
      stepKey: step.key,
      title,
      tool: ask.toolName,
      detail: detailOf(ask),
      options: askOptions(ask),
      askedAt: Date.now(),
    },
  }
  e.host.notify(`${step.title}: ${title || ask.toolName}`)
}

/** Отдать вопрос тому, кто его решает: человеку (прогон стоит) или голове. */
export const putQuestion = (e: EngineCore, step: RunStep, ask: CardAsk): void => {
  if (e.scenario.head.onQuestion === 'stop') {
    // По-настоящему стоит: ход открыт, процесс жив, ничего не тратится - и часы стоят.
    e.hold()
    e.phase = 'blocked'
    e.run = { ...e.run, state: 'blocked' }
    standOn(e, step, ask)
    e.changed()

    return
  }

  e.deciding = ask.requestId
  e.phase = 'question'
  askHead(e, questionRequest(askTitle(ask), ask.toolName, detailOf(ask), askOptions(ask)))
  e.changed()
}

/** Вопрос карточки. На паузе он ждёт в очереди: снявшись с паузы молча, тормоз не тормозил бы. */
export const onCardAsk = (e: EngineCore, from: ScenarioSession, ask: CardAsk): void => {
  if (e.card !== from || e.phase === 'over' || e.phase === 'takeover') return

  const step = e.step

  if (!step) return

  e.questions = [...e.questions, ask]

  if (e.phase === 'paused') return

  e.editStep(step.key, (one) => ({ ...one, state: 'asking' }))

  if (e.questions.length > 1) return e.changed()

  putQuestion(e, step, ask)
}

/**
 * Один вопрос решён: следующий или дальше работать. Ход, спросивший, уже умер - остальные
 * вопросы о работе, которая остановилась, и карточка идёт к голове с тем, что успела сказать.
 */
export const afterQuestion = (e: EngineCore): void => {
  const step = e.step

  if (e.cardTurnEnded) {
    e.questions = []
    e.deciding = ''
    if (e.phase === 'blocked') e.release()
    e.run = { ...e.run, question: null }
    turnOver(e)

    return
  }

  const next = e.questions[0]

  if (next && step) return putQuestion(e, step, next)

  if (e.phase === 'blocked') e.release()

  e.phase = 'card'
  e.run = { ...e.run, state: 'running', question: null }

  if (step) e.editStep(step.key, (one) => ({ ...one, state: 'running' }))
}

/**
 * Ответ - в запрос самой карточки. Вопрос с вариантами не отказывается никогда: CLI собирает
 * результат из выбранного под `answers`, и «нет» там значило бы, что никто не ответил.
 */
export const writeAnswer = (e: EngineCore, ask: CardAsk, allow: boolean, text: string): void => {
  const answers = askAnswers(ask, text)

  e.card?.answer(
    ask.requestId,
    allow || answers !== null,
    text,
    answers ? { ...ask.input, answers } : ask.input,
  )
}

/** Голова решила вопрос карточки; ответ на снятый вопрос не ложится на следующий. */
export const answerCardQuestion = (e: EngineCore, body: ReplyBody): void => {
  const ask = e.questions[0]

  if (!ask || ask.requestId !== e.deciding) return afterQuestion(e)

  e.questions = e.questions.slice(1)
  e.deciding = ''
  afterQuestion(e)
  writeAnswer(e, ask, replyFlag(body, 'allow') ?? false, replyText(body, 'answer'))
}

/** Человек ответил. И на паузе тоже: пауза над вопросом ничего не прерывала. */
export const answerByPerson = (e: EngineCore, allow: boolean, text: string): void => {
  const ask = e.questions[0]
  const paused = e.phase === 'paused' && e.resumeTo === 'blocked'

  if (!ask || (e.phase !== 'blocked' && !paused)) return

  e.questions = e.questions.slice(1)
  e.run = { ...e.run, question: null }
  writeAnswer(e, ask, allow, text)

  if (!paused) {
    afterQuestion(e)
    e.changed()

    return
  }

  const next = e.questions[0]
  const step = e.step

  if (!next) e.resumeTo = 'card'
  else if (step) {
    e.resumeTo = 'blocked'
    standOn(e, step, next)
  }

  e.changed()
}

/** CLI снял вопрос (хук решил, ход кончился): перестать ждать, ничего не отвечая. */
export const onWithdrawn = (e: EngineCore, from: ScenarioSession, requestId: string): void => {
  if (e.card !== from) return

  const current = e.questions[0]?.requestId === requestId
  const before = e.questions.length

  e.questions = e.questions.filter((ask) => ask.requestId !== requestId)

  if (e.questions.length === before || !current) return
  if (e.deciding === requestId) e.deciding = ''

  if (e.phase === 'paused') {
    if (e.resumeTo !== 'blocked' && e.resumeTo !== 'question') return

    const next = e.questions[0]
    const step = e.step

    if (!next) e.resumeTo = 'card'
    else if (e.resumeTo === 'blocked' && step) {
      standOn(e, step, next)
      e.changed()
    }

    return
  }

  // Голова посреди ответа о снятом вопросе: её ответ ни к чему не ляжет, очередь - потом.
  if (e.phase !== 'blocked') return

  afterQuestion(e)
  e.changed()
}

/** Вопрос разрешения головы: забор прораба или правила карточки, если голова на её месте. */
export const onHeadAsk = (e: EngineCore, from: ScenarioSession, ask: CardAsk): void => {
  if (e.head !== from) return

  const verdict = e.unfenced
    ? takeOverVerdict(e.scenario.head, ask.toolName)
    : judgeHead(ask.toolName, ask.input)

  from.answer(ask.requestId, verdict.ok, verdict.why, ask.input)
}
