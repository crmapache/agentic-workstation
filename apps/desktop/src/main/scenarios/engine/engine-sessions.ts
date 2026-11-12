import type { RunStep } from '@shared/scenario-runs'
import type { ScenarioCard } from '@shared/scenarios'

import type { CliMessage } from '../../claude/cli/cli-messages'
import { numberField, recordField } from '../../claude/cli/cli-messages'
import type { EngineCore } from './engine-core'
import { SAID_CHARS } from './engine-core'
import { cardBriefing, HEAD_BRIEFING, TAKE_OVER_BRIEFING } from './head-talk'
import { ScenarioSession } from './scenario-session'
import { addWords, livePiece, BackgroundWork } from './stream-reading'

/**
 * Процессы прогона - голова и карточка (openHead/openCard в ACC). Всё, что процесс говорит,
 * доходит до прогона, только пока он и есть голова или карточка: снятый процесс договаривает,
 * и его ход читался бы ответом нового.
 */

const TOKEN_FIELDS = [
  'input_tokens',
  'output_tokens',
  'cache_creation_input_tokens',
  'cache_read_input_tokens',
]

/**
 * Что ход добавил к счёту из нарастающего итога разговора. Итог ниже прежнего - счёт начался
 * заново (процесс поднят поверх транскрипта), и он и есть потраченное.
 */
export const spentOf = (total: number | null, before: number): number =>
  total === null ? 0 : total < before ? total : total - before

/** Итог хода: деньги нарастающим итогом и токены этого хода (все четыре поля). */
const costOf = (message: CliMessage): { total: number | null; tokens: number } => {
  if (message.type !== 'result') return { total: null, tokens: 0 }

  const cost = message['total_cost_usd']
  const usage = recordField(message, 'usage')

  return {
    total: typeof cost === 'number' && Number.isFinite(cost) ? cost : null,
    tokens: TOKEN_FIELDS.reduce((sum, field) => sum + numberField(usage, field), 0),
  }
}

/** Голова прогона; resumeFrom - её прошлый разговор (подхват, переезд, забор карточки). */
export const openHead = (
  e: EngineCore,
  resumeFrom: string,
  takingOver = false,
): ScenarioSession => {
  const { model, effort } = e.host.defaults()
  const session: ScenarioSession = new ScenarioSession(
    e.host.spawn,
    {
      sessionId: resumeFrom || e.host.newSessionId(),
      resume: Boolean(resumeFrom),
      model: e.scenario.head.model || model,
      effort: e.scenario.head.effort || effort,
      // Голова спрашивает, прежде чем делать: всё пишущее - карточкам (engine-questions.ts).
      // Голова на месте карточки получает доверие карточек - режим сценария.
      permissionMode: takingOver ? e.scenario.head.permissionMode || 'default' : 'default',
      briefing: takingOver ? TAKE_OVER_BRIEFING : HEAD_BRIEFING,
      accountId: e.accountId,
    },
    {
      onMessage: (message) => e.react?.line(session, true, message),
      onTurnStarted: () => undefined,
      onTurnEnded: () => e.react?.headTurnEnded(session),
      onAsk: (ask) => e.react?.ask(session, true, ask),
      onWithdrawn: () => undefined,
      onError: (message) => e.react?.error(session, true, message),
      onCrashed: () => e.react?.crashed(session, true),
    },
  )

  if (session.conversationId !== e.run.headConversationId) {
    e.run = { ...e.run, headConversationId: session.conversationId }
    e.host.noteConversation(session.conversationId)
  }

  return session
}

/** Карточка на доске; resumeFrom - её разговор, если её продолжают. */
export const openCard = (
  e: EngineCore,
  step: RunStep,
  card: ScenarioCard,
  resumeFrom = '',
): ScenarioSession => {
  const { model, effort } = e.host.defaults()
  // Помощники процесса - его собственные и умирают с ним: у каждого процесса свой счёт.
  const work = new BackgroundWork()
  const session: ScenarioSession = new ScenarioSession(
    e.host.spawn,
    {
      sessionId: resumeFrom || e.host.newSessionId(),
      resume: Boolean(resumeFrom),
      model: card.model || e.scenario.head.model || model,
      effort: card.effort || e.scenario.head.effort || effort,
      permissionMode: card.permissionMode || e.scenario.head.permissionMode || 'default',
      briefing: cardBriefing(step.item?.again ?? ''),
      accountId: e.accountId,
    },
    {
      onMessage: (message) => {
        if (e.card === session) work.read(message)

        e.react?.line(session, false, message)
      },
      onTurnStarted: () => e.react?.cardTurnStarted(session),
      onTurnEnded: () => e.react?.cardTurnEnded(session),
      onAsk: (ask) => e.react?.ask(session, false, ask),
      onWithdrawn: (requestId) => e.react?.withdrawn(session, requestId),
      onError: (message) => e.react?.error(session, false, message),
      onCrashed: () => e.react?.crashed(session, false),
    },
  )

  e.helpers = work
  e.editStep(step.key, (one) => ({ ...one, conversationId: session.conversationId }))
  e.host.noteConversation(session.conversationId)

  return session
}

/** Строка головы: счёт прогона и живые слова, пока голова делает работу карточки. */
export const headLine = (e: EngineCore, message: CliMessage): void => {
  e.headTurn.read(message)

  const { total, tokens } = costOf(message)
  const spent = spentOf(total, e.headCost)

  if (total !== null) e.headCost = total
  if (spent > 0 || tokens > 0) {
    e.run = { ...e.run, cost: e.run.cost + spent, tokens: e.run.tokens + tokens }
  }

  const piece = livePiece(message)

  if (piece !== null && e.phase === 'takeover') {
    e.editHere((step) => ({ ...step, said: addWords(step.said, piece, SAID_CHARS) }))
    e.changed()
  }
}

/** Строка карточки: счёт шага и прогона, живые слова - только пока ждут её ход. */
export const cardLine = (e: EngineCore, message: CliMessage): void => {
  const key = e.step?.key ?? ''

  e.cardTurn.read(message)

  const { total, tokens } = costOf(message)
  const spent = spentOf(total, e.cardCost)

  if (total !== null) e.cardCost = total
  if (spent > 0 || tokens > 0) {
    e.run = { ...e.run, cost: e.run.cost + spent, tokens: e.run.tokens + tokens }
    e.editStep(key, (step) => ({ ...step, cost: step.cost + spent, tokens: step.tokens + tokens }))
  }

  const piece = livePiece(message)

  if (piece !== null && e.phase === 'card') {
    e.editStep(key, (step) => ({ ...step, said: addWords(step.said, piece, SAID_CHARS) }))
    e.changed()
  }
}

/** Слова человека, которые голова отвечала, - обратно ждать: ответа не будет. */
export const takeBackTheirWords = (e: EngineCore): void => {
  if (!e.answeringPerson) return

  const stamps = new Set(e.carrying)

  e.run = {
    ...e.run,
    answering: false,
    notes: e.run.notes.map((note) =>
      note.who === 'person' && stamps.has(note.at) ? { ...note, deliveredAt: 0 } : note,
    ),
  }

  for (const [at, images] of e.carryingImages) e.toldImages.set(at, images)

  e.answeringPerson = false
  e.personAskedAt = 0
  e.carrying = []
  e.carryingImages = new Map()
}

/**
 * Голову - заново поверх её разговора, с забором или без: режим на живом процессе CLI может
 * отклонить, и отказ на обратном пути оставил бы прораба без забора молча. Процесс поднимется
 * следующим сообщением, так что поднятая после последней карточки голова ничего не стоит.
 */
export const raiseHead = (e: EngineCore, takingOver: boolean): void => {
  e.head?.stop()
  e.unfenced = takingOver

  const resume = e.host.onDisk(e.run.headConversationId) ? e.run.headConversationId : ''

  e.head = openHead(e, resume, takingOver)
  takeBackTheirWords(e)
  e.headTalking = false
  e.deferred = false
}
