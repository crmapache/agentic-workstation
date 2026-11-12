import type { RunMove } from '@shared/scenario-runs'

import type { CliMessage } from '../../claude/cli/cli-messages'
import { numberField, recordField, stringField } from '../../claude/cli/cli-messages'
import type { Relief, EngineCore } from './engine-core'
import { UNFIT_MS, SWAP_GRACE_MS } from './engine-core'
import { halt, carryOnFromPause } from './engine-pause'
import { openCard, raiseHead } from './engine-sessions'
import { retryAt, chooseRelief, followsChoice, RESET_SLACK_MS } from './limit-relief'
import { noteStamp } from './run-mail'
import type { ScenarioSession } from './scenario-session'

/**
 * Аккаунт прогона (как в ACC): идёт за выбором человека и уходит с исчерпанного на аккаунт с
 * запасом. Процесс не меняет аккаунт на ходу - голова и карточка поднимаются заново поверх
 * своих транскриптов, когда их ходы закроются (не дольше восьми секунд).
 */

/** Окна, которые лимит называет, в которых отказ - это не лимит. */
const ALLOWED = new Set(['allowed', 'allowed_warning'])

const noteMove = (e: EngineCore, move: RunMove) => {
  e.run = {
    ...e.run,
    notes: [
      ...e.run.notes,
      {
        at: noteStamp(e.run.notes, Date.now()),
        stepKey: e.step?.key ?? '',
        text: '',
        who: 'panel',
        deliveredAt: 0,
        relayed: '',
        move,
      },
    ],
  }
}

/** Заменить процессы прямо сейчас: голову - поверх её разговора, карточку - тоже, если он есть. */
const swap = (e: EngineCore) => {
  const pending = e.pendingSwap

  if (!pending) return

  if (e.swapTimer) clearTimeout(e.swapTimer)

  e.swapTimer = null
  e.pendingSwap = null
  e.accountId = pending.to
  e.borrowed = pending.borrowed
  e.provenModels.clear()
  e.restingOnLimit = false
  e.run = { ...e.run, limit: null }
  raiseHead(e, e.unfenced)

  const step = e.step
  const card = e.cardOf(step)

  if (e.card && step && card) {
    e.closeCard()

    const resume =
      step.conversationId && e.host.onDisk(step.conversationId) ? step.conversationId : ''

    e.cardStartsOver = !resume
    e.card = openCard(e, step, card, resume)

    // Вопросы умирают с процессом: продолжив, карточка спросит снова.
    if (e.resumeTo === 'question' || e.resumeTo === 'blocked') {
      e.questions = []
      e.deciding = ''
      e.run = { ...e.run, question: null }
      e.resumeTo = 'card'
    }
  }

  if (pending.thenResume) carryOnFromPause(e)

  e.changed()
}

/** Заменить, если ходы закрылись; карточку на вопросе не ждут - её ход сам не закроется. */
export const trySwap = (e: EngineCore): void => {
  if (!e.pendingSwap) return

  const onQuestion = ['question', 'blocked'].includes(e.resumeTo)
  const cardBusy = Boolean(e.card?.isTurnOpen) && !onQuestion

  if (!e.head?.isTurnOpen && !cardBusy) swap(e)
}

const beginSwap = (
  e: EngineCore,
  to: string,
  borrowed: boolean,
  thenResume: boolean,
  move: RunMove,
) => {
  e.pendingSwap = { to, borrowed, thenResume }
  noteMove(e, move)
  e.changed()
  e.swapTimer = setTimeout(() => swap(e), SWAP_GRACE_MS)
  trySwap(e)
}

const refusedUntil = (e: EngineCore, id: string, shared: number | null): number | null => {
  const own = e.refusals.get(id) ?? 0

  return Math.max(own, shared ?? 0) || null
}

/** Нет запаса нигде: пауза до первого известного сброса, и прогон сам пробует снова. */
const restOnLimit = (e: EngineCore, at: number, relief: Relief) => {
  e.restingOnLimit = true
  e.run = {
    ...e.run,
    limit: {
      account: e.host.accounts.label(e.accountId),
      window: relief.window,
      until: at,
      reason: relief.reason,
    },
  }
  noteMove(e, {
    reason: relief.reason,
    from: e.host.accounts.label(e.accountId),
    to: '',
    waits: true,
    window: relief.window,
    until: at,
  })
  e.changed()
  e.restTimer = setTimeout(
    () => {
      e.restTimer = null

      if (!e.restingOnLimit || e.phase === 'over') return

      e.restingOnLimit = false
      e.pendingRelief = { ...relief, thenResume: relief.thenResume }
      relieve(e, true)
    },
    Math.max(0, at - Date.now()) + RESET_SLACK_MS,
  )
}

/** Решить, куда идти, - вне потока процесса, который отказал. */
const relieve = (e: EngineCore, fresh = false) => {
  const relief = e.pendingRelief

  if (!relief || e.phase === 'over') return

  const now = Date.now()
  const candidates = e.host.accounts.candidates(e.accountId, now).map((one) => ({
    ...one,
    refusedUntil: refusedUntil(e, one.id, one.refusedUntil),
  }))
  const way = chooseRelief(e.accountId, e.host.accounts.current(), candidates, now)

  e.pendingRelief = null

  if (way.kind === 'wait') return restOnLimit(e, way.at, relief)

  if (way.account === e.accountId && !fresh) {
    if (relief.thenResume) carryOnFromPause(e)

    return
  }

  beginSwap(e, way.account, way.account !== e.host.accounts.current(), relief.thenResume, {
    reason: relief.reason,
    from: e.host.accounts.label(e.accountId),
    to: e.host.accounts.label(way.account),
    waits: false,
    window: relief.window,
    until: relief.resets,
  })
}

/** Аккаунт отказал прогону: пауза до того, как ход закроется, и поиск запаса. */
export const ranIntoLimit = (e: EngineCore, reason: 'limit' | 'unfit'): void => {
  if (e.phase === 'over' || e.settlingAccount()) return

  const now = Date.now()
  const until = reason === 'unfit' ? now + UNFIT_MS : (e.lastStop?.resetsAt ?? retryAt(null, now))

  e.refusals.set(e.accountId, until)

  if (reason === 'limit') e.host.accounts.noteRefused(e.accountId, until)

  const paused = e.phase === 'paused'

  if (!paused) halt(e)

  e.pendingRelief = { window: e.lastStop?.window ?? '', resets: until, reason, thenResume: !paused }
  e.changed()
  setTimeout(() => relieve(e), 0)
}

/** Строка процесса о лимите: окно и сброс заранее, отказ - словом CLI, только свой. */
export const noticeLimit = (e: EngineCore, session: ScenarioSession, message: CliMessage): void => {
  if (e.head !== session && e.card !== session) return

  if (message.type === 'rate_limit_event') {
    const info = recordField(message, 'rate_limit_info')
    const resetsAt = numberField(info, 'resetsAt') * 1000
    const status = stringField(info, 'status').toLowerCase()

    if (status && !ALLOWED.has(status) && resetsAt > 0) {
      e.lastStop = { window: stringField(info, 'rateLimitType'), resetsAt }
    }
  }

  const own = !message['parent_tool_use_id']

  if (message.type === 'assistant' && own && message['error'] === 'rate_limit')
    ranIntoLimit(e, 'limit')

  if (message.type === 'result' && message['is_error'] !== true) e.provenModels.add(session.model)
}

/** Процесс на взятом самим прогоном аккаунте упал, не пройдя ни хода на своей модели. */
export const untried = (e: EngineCore, session: ScenarioSession): boolean =>
  e.borrowed && !e.provenModels.has(session.model)

/** Человек выбрал другой аккаунт: прогон идёт за ним, как вкладки. */
export const follow = (e: EngineCore, to: string): void => {
  if (!e.started || e.phase === 'over') return

  const refused = (refusedUntil(e, to, null) ?? 0) > Date.now()

  if (!followsChoice(to, e.followedChoice, e.borrowed, refused)) return

  e.followedChoice = to

  if (to === e.accountId || e.host.accounts.same(to, e.accountId)) return

  const byPerson =
    e.phase === 'paused' &&
    !e.restingOnLimit &&
    !e.pendingSwap?.thenResume &&
    !e.pendingRelief?.thenResume

  if (e.phase !== 'paused') halt(e)
  if (e.restTimer) clearTimeout(e.restTimer)

  e.restTimer = null
  e.restingOnLimit = false
  e.pendingRelief = null
  beginSwap(e, to, false, !byPerson, {
    reason: 'choice',
    from: e.host.accounts.label(e.accountId),
    to: e.host.accounts.label(to),
    waits: false,
    window: '',
    until: 0,
  })
}

/** Прогон на лимите человек снял с паузы сам - пробовать сейчас: он может знать больше часов. */
export const stopResting = (e: EngineCore): void => {
  if (e.restTimer) clearTimeout(e.restTimer)

  e.restTimer = null
  e.restingOnLimit = false
  e.run = { ...e.run, limit: null }
}
