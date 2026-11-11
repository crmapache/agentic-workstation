import type {
  RunWire,
  PendingWire,
  RunQuestionWire,
  ConversationWire,
} from '@agentic-workstation/remote-protocol/wire-types'

import type { Redact } from './fit'
import { sizeOf, cutStrings, BODY_BUDGET, redactStrings, STRING_LIMITS } from './fit'

/**
 * Вопрос к человеку по дороге на телефон: урезанный, он получает явный флаг truncated, а не
 * пометку в тексте, по которой телефону пришлось бы догадываться. Телефон не даёт одобрить то,
 * чего человек не видел целиком: длинная команда с безобидным началом и «; curl … | sh» в конце
 * иначе разрешалась бы вслепую. Метки папок (redact) - не урезание.
 */

/** Самый короткий предел строки: карточка вопроса едет со строками не длиннее его. */
const SHORTEST = 200

const same = (first: unknown, second: unknown): boolean =>
  JSON.stringify(first) === JSON.stringify(second)

/**
 * Значение, которое должно влезть в кадр: целиком, со всё более короткими строками, а последним
 * - с вопросом-карточкой (stub). mark сверяет урезанный вопрос с целым.
 */
const fitAsking = <T>(clean: T, mark: (cut: T) => T, stub: (cut: T) => T): T | null => {
  if (sizeOf(clean) <= BODY_BUDGET) return clean

  for (const limit of STRING_LIMITS) {
    const shorter = mark(cutStrings(clean, limit) as T)

    if (sizeOf(shorter) <= BODY_BUDGET) return shorter
  }

  const last = stub(cutStrings(clean, SHORTEST) as T)

  return sizeOf(last) <= BODY_BUDGET ? last : null
}

/** Вопрос хода, не влезший и урезанным: только то, что нужно для отказа. */
const pendingStub = (pending: PendingWire): PendingWire => {
  switch (pending.kind) {
    case 'permission':
      return {
        kind: 'permission',
        requestId: pending.requestId,
        toolName: pending.toolName.slice(0, SHORTEST),
        description: '',
        reason: '',
        input: null,
        truncated: true,
      }
    case 'question':
      return { kind: 'question', requestId: pending.requestId, questions: [], truncated: true }
    case 'plan':
      return { kind: 'plan', requestId: pending.requestId, plan: '', truncated: true }
  }
}

/** Состояние разговора в кадр; null - не влезает никак. */
export const fitConversation = (
  wire: ConversationWire,
  redact: Redact,
): ConversationWire | null => {
  const clean = redactStrings(wire, redact) as ConversationWire
  const whole = clean.pending

  return fitAsking(
    clean,
    (cut) =>
      cut.pending && whole && !same(cut.pending, whole)
        ? { ...cut, pending: { ...cut.pending, truncated: true } }
        : cut,
    (cut) => ({ ...cut, pending: whole && pendingStub(whole) }),
  )
}

const questionStub = (question: RunQuestionWire): RunQuestionWire => ({
  ...question,
  title: question.title.slice(0, SHORTEST),
  tool: question.tool.slice(0, SHORTEST),
  detail: '',
  options: [],
  truncated: true,
})

/** Прогон в кадр: вопрос головы с флагом, если его урезали; null - не влезает никак. */
export const fitRun = (wire: RunWire, redact: Redact): RunWire | null => {
  const clean = redactStrings(wire, redact) as RunWire
  const whole = clean.question

  return fitAsking(
    clean,
    (cut) =>
      cut.question && whole && !same(cut.question, whole)
        ? { ...cut, question: { ...cut.question, truncated: true } }
        : cut,
    (cut) => ({ ...cut, question: whole && questionStub(whole) }),
  )
}
