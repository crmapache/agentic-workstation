import type { OpenCodeEvent } from '../server/opencode-server'
import { awaitsBackground } from '../../agents/feed/background-work'
import { outranks } from '../../agents/tabs/tab-names'
import { openCodeOf } from './opencode-conversation'
import type { ToolFacts } from './opencode-requests'
import { holdForm, holdPermission } from './opencode-requests'
import type { OpenCodeSession } from './opencode-session'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (record: Record<string, unknown>, key: string): string => {
  const value = record[key]

  return typeof value === 'string' ? value : ''
}

const count = (value: unknown): number => (typeof value === 'number' ? value : 0)

/** Сессия события: у формы - внутри формы (`form.created` 2.3.2), у прочих - сверху. */
export const eventSessionOf = (data: Record<string, unknown>): string =>
  text(data, 'sessionID') || (isRecord(data['form']) ? text(data['form'], 'sessionID') : '')

/**
 * События субагента, которые идут в разговор: его вопросы человеку. Его ход, текст и вызовы -
 * его собственная лента; в разговоре субагент виден своим вызовом.
 */
export const CHILD_EVENTS: ReadonlySet<string> = new Set([
  'permission.asked',
  'permission.replied',
  'form.created',
  'form.replied',
  'form.cancelled',
])

/** Ключ текста: сообщение модели и номер части. */
const keyOf = (data: Record<string, unknown>) => ({
  messageId: text(data, 'assistantMessageID'),
  ordinal: count(data['ordinal']),
})

/** Ход начался: разговор узнаёт об этом здесь, если ход начал не человек. */
const executionStarted = (session: OpenCodeSession) => {
  const { runtime } = session

  openCodeOf(runtime).feed.builder.turnStarted()

  if (!runtime.turnActive) {
    runtime.turnActive = true
    runtime.update({ turnStartedAt: Date.now() })
    runtime.syncStatus()
  }
}

/** Ход кончился: лента, свободная вкладка, исход, зов; потом очередь и сон. */
const executionEnded = (session: OpenCodeSession, type: string, data: Record<string, unknown>) => {
  const { runtime } = session
  const status =
    type === 'session.execution.failed'
      ? 'failed'
      : type === 'session.execution.interrupted'
        ? 'interrupted'
        : 'succeeded'
  const error = isRecord(data['error']) ? text(data['error'], 'message') : text(data, 'error')
  const interrupted = status === 'interrupted' || runtime.meta.stopRequestedAt !== null
  const isError = status === 'failed'

  openCodeOf(runtime).feed.builder.turnCompleted({ status, error })
  runtime.settleTurn({ interrupted, isError, usage: runtime.meta.usage })

  // Субагенты ещё работают - разговор не готов: «готово» прозвучит, когда кончится их ход.
  const stillWorking = awaitsBackground(openCodeOf(runtime).feed.builder)

  if (!interrupted && (isError || !stillWorking)) {
    runtime.host.onCall(runtime.meta.id, isError ? 'error' : 'turnDone')
  }

  runtime.afterTurn(!interrupted && !isError)
}

/** Окно контекста - по шагу модели: всё, что ушло модели, и её ответ. */
const stepEnded = (session: OpenCodeSession, data: Record<string, unknown>) => {
  const { runtime } = session
  const tokens = isRecord(data['tokens']) ? data['tokens'] : {}
  const cache = isRecord(tokens['cache']) ? tokens['cache'] : {}
  const used =
    count(tokens['input']) + count(tokens['output']) + count(cache['read']) + count(cache['write'])

  if (used > 0) {
    runtime.update({
      usage: {
        contextTokens: used,
        contextWindow: session.contextWindow || runtime.meta.usage.contextWindow,
      },
    })
  }
}

/** Что известно о вызове из ленты: вопрос разрешения покажет его по-настоящему. */
const factsOf = (session: OpenCodeSession, toolId: string): ToolFacts | null => {
  const item = openCodeOf(session.runtime).feed.builder.items.find((known) => known.id === toolId)

  return item?.kind === 'tool' ? { name: item.name, input: item.input, action: item.action } : null
}

const asked = (session: OpenCodeSession, data: Record<string, unknown>) => {
  const { runtime } = session
  const source = isRecord(data['source']) ? data['source'] : {}
  const held = holdPermission(
    `opencode-${session.epoch}-${text(data, 'id')}`,
    data,
    factsOf(session, text(source, 'id')),
    runtime.meta.permissionMode,
    runtime.meta.projectPath,
    openCodeOf(runtime).servers,
  )

  void runtime.hold(held)
}

const formCreated = (session: OpenCodeSession, data: Record<string, unknown>) => {
  const { runtime } = session
  const form = isRecord(data['form']) ? data['form'] : data

  runtime.held = [...runtime.held, holdForm(`opencode-${session.epoch}-${text(form, 'id')}`, form)]
  runtime.syncStatus()
  runtime.host.onCall(runtime.meta.id, 'question')
}

/** OpenCode сам снял вопрос (ответили в другом месте, ход кончился): карточка уходит. */
const withdraw = (session: OpenCodeSession, openCodeId: string) => {
  const { runtime } = session
  const requestId = `opencode-${session.epoch}-${openCodeId}`

  runtime.held = runtime.held.filter((held) => held.pending.requestId !== requestId)
  runtime.syncStatus()
}

/**
 * Событие сервера OpenCode своей сессии - в ленту и в разговор (docs/plan-providers/
 * 40-open-models.md): ход, текст и размышление кусками, вызовы, шаг модели, имя, повтор,
 * сжатие, вопросы.
 */
export const routeEvent = (session: OpenCodeSession, event: OpenCodeEvent): void => {
  const { data, type } = event
  const { feed } = openCodeOf(session.runtime)
  const { builder } = feed

  switch (type) {
    case 'session.execution.started':
      executionStarted(session)
      break
    case 'session.execution.succeeded':
    case 'session.execution.failed':
    case 'session.execution.interrupted':
      executionEnded(session, type, data)

      return
    case 'session.text.delta':
      builder.appendText('assistant', keyOf(data), text(data, 'delta'))
      break
    case 'session.text.ended':
      builder.endText('assistant', keyOf(data), text(data, 'text'))
      break
    case 'session.reasoning.delta':
      builder.appendText('thinking', keyOf(data), text(data, 'delta'))
      break
    case 'session.reasoning.ended':
      builder.endText('thinking', keyOf(data), text(data, 'text'))
      break
    case 'session.tool.input.started':
      builder.toolStarted(text(data, 'id'), text(data, 'name'))
      break
    case 'session.tool.called':
      builder.toolCalled(
        text(data, 'id'),
        text(data, 'name'),
        isRecord(data['input']) ? data['input'] : {},
      )
      break
    case 'session.tool.progress':
      builder.toolProgress(text(data, 'id'), data)
      break
    case 'session.tool.success':
    case 'session.tool.failed':
      builder.toolEnded(text(data, 'id'), data, type === 'session.tool.failed')
      break
    case 'session.step.ended':
      stepEnded(session, data)

      return
    case 'session.renamed': {
      const title = text(data, 'title')

      if (title && outranks('llm', session.runtime.meta.titleSource)) {
        session.runtime.update({ title, titleSource: 'llm' })
      }

      return
    }
    case 'session.retry.scheduled':
      builder.retrying(
        isRecord(data['error']) ? text(data['error'], 'message') : text(data, 'message'),
      )
      break
    case 'session.compaction.started':
      if (text(data, 'reason') === 'manual') builder.compactRequested()
      builder.compaction('started')
      break
    case 'session.compaction.ended':
      builder.compaction('ended')
      break
    case 'session.compaction.failed':
      builder.compaction(
        'failed',
        isRecord(data['error']) ? text(data['error'], 'message') : text(data, 'error'),
      )
      break
    case 'permission.asked':
      asked(session, data)

      return
    case 'permission.replied':
      withdraw(session, text(data, 'requestID'))

      return
    case 'form.created':
      formCreated(session, data)

      return
    case 'form.replied':
    case 'form.cancelled':
      withdraw(session, text(data, 'formID') || text(data, 'id'))

      return
    default:
      return
  }

  feed.schedule()
}
