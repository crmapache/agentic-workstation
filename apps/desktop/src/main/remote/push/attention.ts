import type { Conversation } from '@shared/claude'
import type { ScenarioQueuesView } from '@shared/scenario-queues'
import type { ScenarioRun } from '@shared/scenario-runs'
import { isRunFinished } from '@shared/scenario-runs'

import type { PushNotice, PushReason } from '@agentic-workstation/remote-protocol/push'
import { PUSH_TEXT_MAX } from '@agentic-workstation/remote-protocol/push'

import { titleOf, CLAUDE_PROVIDER } from '../bridge/conversation-wire'
import type { Redact } from '../bridge/fit'
import type { ProjectKeys } from '../bridge/project-keys'

/**
 * Что в IDE сейчас ждёт человека - поводы пуша по разговорам, прогонам и очередям. Чистая
 * функция от состояния: когда будить и кого, решает PushDesk. Тексты - данными, по-английски
 * их соберёт воркер телефона; имена - с метками вместо папок машины (redact) и короткие.
 */

/**
 * Повод, который приходит событием, а не состоянием: разговор позвал человека (звук окна) -
 * процесс упал или ход кончился ошибкой (trouble), лимит, доплата сверх лимита.
 */
export type ConversationEvent = {
  conversationId: string
  reason: Extract<PushReason, 'trouble' | 'limit' | 'extraUsage'>
  at: number
}

/** Один повод: тег (разговор или очередь), повод и его опознание внутри тега. */
export type Attention = {
  tag: string
  reason: PushReason
  /** Какой именно вопрос, лимит или остановка: новый - новый пуш, тот же - нет. */
  key: string
  /** Когда появился (часы IDE); null - не знает сам, считается с первой встречи. */
  since: number | null
  notice: Omit<PushNotice, 'p' | 'at'>
}

export type AttentionInput = {
  conversations: readonly Conversation[]
  events: readonly ConversationEvent[]
  queues: ScenarioQueuesView
  /** Последнее состояние идущих прогонов - в нём вопрос головы с опознанием. */
  runs: ReadonlyMap<string, ScenarioRun>
  keys: ProjectKeys
  redact: Redact
}

/** Почему очередь встала - будят только эти: interrupted - IDE закрыли, человек и так знает. */
const PUSHED_HOLDS = new Set(['stopAfter', 'failed', 'refused'])

/** Имя для экрана блокировки: метки вместо папок, одной строкой, не длиннее потолка. */
const short = (text: string, redact: Redact, max = PUSH_TEXT_MAX): string => {
  const line = redact(text).replace(/\s+/g, ' ').trim()

  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

const conversationAttention = (input: AttentionInput): Attention[] => {
  const { keys, redact } = input

  return input.conversations.flatMap((conversation) => {
    // Разговоры закрытого проекта телефону не видны - и будить ими незачем.
    if (!keys.isOpen(conversation.projectPath)) return []

    const tag = `c-${conversation.id}`
    const base = {
      detail: '',
      provider: CLAUDE_PROVIDER,
      project: short(keys.nameOf(conversation.projectPath), redact),
      title: short(titleOf(conversation), redact),
      tool: '',
      until: 0,
      tag,
      route: {
        screen: 'conversation' as const,
        projectKey: keys.keyOf(conversation.projectPath),
        conversationId: conversation.id,
      },
    }
    const out: Attention[] = []
    const { pending } = conversation

    if (pending) {
      out.push({
        tag,
        reason: pending.kind,
        key: pending.requestId,
        since: null,
        notice: {
          ...base,
          reason: pending.kind,
          tool: pending.kind === 'permission' ? short(pending.toolName, redact, 40) : '',
        },
      })
    }

    // Событие живо, пока разговор не начал новый ход: человек ответил - звать не о чем.
    const turn = conversation.turnStartedAt ?? 0
    const plan = conversation.carryOn

    for (const event of input.events) {
      if (event.conversationId !== conversation.id || turn > event.at) continue

      out.push({
        tag,
        reason: event.reason,
        key: `${event.reason}:${event.at}`,
        since: event.at,
        notice: {
          ...base,
          reason: event.reason,
          until: event.reason === 'limit' && plan && !plan.guess ? plan.until : 0,
        },
      })
    }

    return out
  })
}

/** Тег прогона - его очередь: уведомление очереди заменяет прежнее того же прогона. */
const runTag = (run: { id: string; queueId: string }): string =>
  run.queueId ? `q-${run.queueId}` : `r-${run.id}`

const runAttention = (input: AttentionInput): Attention[] => {
  const { keys, redact } = input
  const base = (run: Pick<ScenarioRun, 'id' | 'queueId' | 'provider' | 'projectPath'>) => ({
    detail: '',
    provider: run.provider,
    project: short(keys.nameOf(run.projectPath), redact),
    tool: '',
    tag: runTag(run),
    route: { screen: 'run' as const, projectKey: keys.keyOf(run.projectPath), runId: run.id },
  })
  const questions = [...input.runs.values()].flatMap((run): Attention[] =>
    run.question && !isRunFinished(run.state)
      ? [
          {
            tag: runTag(run),
            reason: 'question',
            key: `${run.question.stepKey}:${run.question.askedAt}`,
            since: run.question.askedAt,
            notice: {
              ...base(run),
              reason: 'question',
              title: short(run.scenarioName, redact),
              until: 0,
            },
          },
        ]
      : [],
  )
  // Лимит - по сводкам идущих: они есть всегда, а не только у прогонов, менявшихся при линии.
  const limits = input.queues.live.flatMap((run): Attention[] =>
    run.limit
      ? [
          {
            tag: runTag(run),
            reason: 'limit',
            key: `${run.limit.account}:${run.limit.until}`,
            since: null,
            notice: {
              ...base(run),
              reason: 'limit',
              title: short(run.scenarioName, redact),
              until: run.limit.until,
            },
          },
        ]
      : [],
  )

  return [...questions, ...limits]
}

const queueAttention = (input: AttentionInput): Attention[] => {
  const { keys, redact } = input

  return input.queues.queues.flatMap((queue): Attention[] => {
    const { hold } = queue

    if (queue.closedAt !== 0 || !hold || !PUSHED_HOLDS.has(hold.reason)) return []

    const item = queue.items.find((one) => one.id === hold.itemId)

    return [
      {
        tag: `q-${queue.id}`,
        reason: 'held',
        key: `${hold.reason}:${hold.itemId}:${hold.at}`,
        since: hold.at,
        notice: {
          reason: 'held',
          detail: hold.reason,
          provider: item?.provider ?? '',
          project: short(keys.nameOf(queue.projectPath), redact),
          title: short(queue.name, redact),
          tool: '',
          until: 0,
          tag: `q-${queue.id}`,
          route: { screen: 'queue', projectKey: keys.keyOf(queue.projectPath), queueId: queue.id },
        },
      },
    ]
  })
}

/** Все поводы IDE сейчас. */
export const attentionOf = (input: AttentionInput): Attention[] => [
  ...conversationAttention(input),
  ...runAttention(input),
  ...queueAttention(input),
]

/** Опознание повода целиком: тег, повод и какой именно. */
export const attentionId = (attention: Attention): string =>
  `${attention.tag}|${attention.reason}|${attention.key}`
