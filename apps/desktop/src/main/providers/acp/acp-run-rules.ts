import type { PermissionMode } from '@shared/conversation'

import type { AcpAgent } from '../../acp/acp-agent'
import type { AcpHeld } from '../../acp/conversation/acp-requests'
import { replyOf, CANCELLED, isAllowed } from '../../acp/conversation/acp-requests'
import type { AcpToolKind } from '../../acp/protocol/acp-types'

/** Виды ACP, которые меняют файлы, даже когда диффа в вызове нет. */
const WRITE_KINDS: ReadonlySet<AcpToolKind> = new Set(['edit', 'delete', 'move'])

/**
 * Режим IDE, которым агент работает: «только чтение», которого у агента нет (у Kimi), - его
 * план. В плане Kimi сам не пишет никуда, кроме своего файла плана; выход из плана и запись,
 * если агент о них всё же спросит, прогон запрещает сам (ownAnswer).
 */
export const servedMode = (agent: Pick<AcpAgent, 'modes'>, mode: PermissionMode): PermissionMode =>
  mode === 'readOnly' && !agent.modes.includes('readOnly') ? 'plan' : mode

/** Что прогон знает о себе, решая вопрос без движка. */
export type AcpRunRules = {
  /** Правила шлюза «разрешено всегда»: свои серверы IDE и инструменты чтения разового вопроса. */
  allowed: readonly string[]
  /** Веб разрешён без вопроса: разговор о коннекторе, разовый вопрос с вебом. */
  web: boolean
  /** Только чтение планом агента: ни записи, ни выхода из плана. */
  readOnly: boolean
}

/**
 * Остаться в плане - «доработать» (Kimi: «User requested revisions. Plan mode remains active.»).
 * Так понимает отказ Claude Code; «отказ и выход» вывел бы агента из плана, и дальше он делал бы
 * по последнему сообщению - в обычном режиме Kimi правки идут без вопроса.
 */
export const stayInPlan = (held: AcpHeld): unknown => {
  const revise = held.options.find((option) => option.optionId === 'plan_revise')

  return revise ? { outcome: { outcome: 'selected', optionId: revise.optionId } } : CANCELLED
}

/**
 * Вопрос агента, который прогон решает сам, не спрашивая движок: свои серверы IDE (уведомления,
 * чтение IDE) и веб разговора о коннекторе - «да»; в только чтении - запись «нет», а выход из
 * плана - «доработать». null - решает движок (голова или правила задания).
 */
export const ownAnswer = (held: AcpHeld, rules: AcpRunRules, kind: AcpToolKind | null): unknown => {
  if (held.source === 'plan') return rules.readOnly ? stayInPlan(held) : null
  if (held.pending.kind !== 'permission') return null

  const { action } = held.pending

  if (isAllowed(rules.allowed, action) || (rules.web && action.kind === 'web')) {
    return replyOf(held, { kind: 'permission', decision: { behavior: 'allow' } })
  }

  const writes =
    action.kind === 'edit' || action.kind === 'write' || WRITE_KINDS.has(kind ?? 'other')

  return rules.readOnly && writes
    ? replyOf(held, {
        kind: 'permission',
        decision: { behavior: 'deny', message: 'This run is read-only.' },
      })
    : null
}
