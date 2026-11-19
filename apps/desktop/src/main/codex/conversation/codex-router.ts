import { refuseUnknown } from '../app-server/app-server-process'
import type { CodexPlanStep } from '../feed/codex-feed-builder'
import { isCodexItem } from '../feed/codex-feed-builder'
import type { CodexItem } from '../feed/codex-tools'
import type { RpcId } from '../../process/rpc-lines'
import { outranks } from '../../agents/tabs/tab-names'
import { codexOf } from './codex-conversation'
import { tierOf } from './codex-fast'
import { policyFor } from './codex-modes'
import { holdPlan } from './codex-plan'
import type { ToolFacts } from './codex-requests'
import { holdServerRequest } from './codex-requests'
import type { CodexSession } from './codex-session'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (record: Record<string, unknown>, key: string): string => {
  const value = record[key]

  return typeof value === 'string' ? value : ''
}

/** Номер части рассуждения: у сводки `summaryIndex`, у полного текста `contentIndex`. */
const partOf = (body: Record<string, unknown>): number => {
  const part = body['summaryIndex'] ?? body['contentIndex']

  return typeof part === 'number' ? part : 0
}

/** Ход начался: если его начал не человек (сам Codex), разговор узнаёт об этом здесь. */
const turnStarted = (session: CodexSession, turn: Record<string, unknown>) => {
  const { runtime } = session

  session.turnId = text(turn, 'id')
  session.proposedPlan = null
  codexOf(runtime).feed.builder.turnStarted()
  codexOf(runtime).feed.turns.add({ turnId: session.turnId, messageId: session.startingMessage })
  session.startingMessage = ''

  if (!runtime.turnActive) {
    runtime.turnActive = true
    runtime.update({ turnStartedAt: Date.now() })
    runtime.syncStatus()
  }
}

/**
 * Ход кончился: лента, свободная вкладка, исход, зов; потом очередь и сон. Ход режима плана,
 * предложивший план, кончается вопросом о нём: очередь ждёт решения человека.
 */
const turnCompleted = (session: CodexSession, turn: Record<string, unknown>) => {
  const { runtime } = session
  const { feed } = codexOf(runtime)
  const status = text(turn, 'status')
  const error = isRecord(turn['error']) ? text(turn['error'], 'message') : ''
  const interrupted = status === 'interrupted' || runtime.meta.stopRequestedAt !== null
  const isError = status === 'failed'
  const plan = !interrupted && !isError ? session.proposedPlan : null

  session.turnId = ''
  session.proposedPlan = null
  feed.builder.turnCompleted({ status, error })
  if (plan) {
    runtime.held = [...runtime.held, holdPlan(`codex-plan-${session.epoch}-${plan.itemId}`, plan)]
  }
  runtime.settleTurn({ interrupted, isError, usage: runtime.meta.usage })

  if (!interrupted) {
    runtime.host.onCall(runtime.meta.id, isError ? 'error' : plan ? 'plan' : 'turnDone')
  }

  runtime.afterTurn(!interrupted && !isError)
}

/**
 * Элемент потока - в ленту. Своё сообщение человека лента уже показала; план - только
 * готовым (начатый пуст), и в режиме плана он запоминается для вопроса в конце хода.
 */
const itemChanged = (session: CodexSession, item: CodexItem, done: boolean) => {
  if (item.type === 'userMessage' || (item.type === 'plan' && !done)) return

  codexOf(session.runtime).feed.builder.putItem(item, null, done)

  if (item.type === 'plan' && policyFor(session.runtime.meta.permissionMode).plan) {
    session.proposedPlan = { itemId: item.id, text: text(item, 'text') }
  }
}

/** Окно контекста - по последнему расходу потока. */
const tokenUsage = (session: CodexSession, usage: Record<string, unknown>) => {
  const { runtime } = session
  const last = isRecord(usage['last']) ? usage['last'] : {}
  const tokens = typeof last['totalTokens'] === 'number' ? last['totalTokens'] : 0
  const window = typeof usage['modelContextWindow'] === 'number' ? usage['modelContextWindow'] : 0

  runtime.update({
    usage: {
      contextTokens: tokens || runtime.meta.usage.contextTokens,
      contextWindow: window || runtime.meta.usage.contextWindow,
    },
  })
}

/** Имя потока от Codex - вкладке, если имя от человека его не перебивает. */
const named = (session: CodexSession, name: string) => {
  const { runtime } = session

  if (name && outranks('llm', runtime.meta.titleSource)) {
    runtime.update({ title: name, titleSource: 'llm' })
  }
}

/** Свой поток или субагент (`thread/started` с parentThreadId - пока в основную ленту). */
const isOwn = (session: CodexSession, params: Record<string, unknown>) =>
  !params['threadId'] || params['threadId'] === session.threadId

/**
 * Уведомление `codex app-server` - в ленту и в разговор (docs/plan-providers/30-codex.md):
 * ход, элементы и их куски, план, расход контекста, повтор, имя потока, снятый вопрос,
 * уровень обслуживания (быстрый режим).
 */
export const routeNotification = (session: CodexSession, method: string, params: unknown): void => {
  const body = isRecord(params) ? params : {}
  const { runtime } = session
  const { feed } = codexOf(runtime)

  if (!isOwn(session, body)) return

  switch (method) {
    case 'turn/started':
      if (isRecord(body['turn'])) turnStarted(session, body['turn'])
      break
    case 'turn/completed':
      if (isRecord(body['turn'])) turnCompleted(session, body['turn'])
      // Ход доработал: уровень, с которым он шёл, - уже ответ на просьбу быстрого режима.
      session.reportFast()

      return
    case 'thread/settings/updated':
      session.tier = tierOf(body['threadSettings'])
      session.reportFast()

      return
    case 'item/started':
    case 'item/completed':
      if (isCodexItem(body['item'])) itemChanged(session, body['item'], method === 'item/completed')
      break
    case 'item/agentMessage/delta':
      feed.builder.appendText(text(body, 'itemId'), 'assistant', text(body, 'delta'), null)
      break
    case 'item/reasoning/summaryTextDelta':
    case 'item/reasoning/textDelta':
      feed.builder.appendText(
        text(body, 'itemId'),
        'thinking',
        text(body, 'delta'),
        null,
        partOf(body),
      )
      break
    case 'turn/plan/updated':
      feed.builder.planUpdated(
        (Array.isArray(body['plan']) ? body['plan'].filter(isRecord) : []).map(
          (step): CodexPlanStep => ({ step: text(step, 'step'), status: text(step, 'status') }),
        ),
      )
      break
    case 'thread/tokenUsage/updated':
      if (isRecord(body['tokenUsage'])) tokenUsage(session, body['tokenUsage'])

      return
    case 'thread/name/updated':
      named(session, text(body, 'threadName'))

      return
    case 'error':
      if (body['willRetry'] === true && isRecord(body['error'])) {
        feed.builder.retrying(text(body['error'], 'message'))
      }
      break
    case 'serverRequest/resolved':
      withdraw(session, body['requestId'])

      return
    case 'account/rateLimits/updated':
      codexOf(runtime).host.onUsageChanged()

      return
    default:
      return
  }

  feed.schedule()
}

/** Codex сам снял вопрос (ответили в другом месте или ход кончился): карточка уходит. */
const withdraw = (session: CodexSession, rpcId: unknown) => {
  const { runtime } = session
  const requestId = `codex-${session.epoch}-${String(rpcId)}`

  runtime.held = runtime.held.filter((held) => held.pending.requestId !== requestId)
  runtime.syncStatus()
}

/** Вызов, о котором спрашивают, - из ленты по id элемента (у правки - первый файл). */
const factsOf =
  (session: CodexSession) =>
  (itemId: string): ToolFacts => {
    const items = codexOf(session.runtime).feed.builder.items
    const tool = items.find(
      (item) => item.kind === 'tool' && (item.id === itemId || item.id.startsWith(`${itemId}#`)),
    )

    return tool?.kind === 'tool'
      ? { name: tool.name, input: tool.input, action: tool.action }
      : { name: 'apply_patch', input: {}, action: { kind: 'other', target: '', path: '' } }
  }

/**
 * Вопрос сервера к человеку: держится в разговоре без таймера и зовёт человека. В режиме
 * «без вопросов» вопрос, который всё же пришёл, принимается сразу (как в amazing-codex).
 */
export const takeServerRequest = (
  session: CodexSession,
  id: RpcId,
  method: string,
  params: unknown,
): void => {
  const { runtime } = session
  const requestId = `codex-${session.epoch}-${String(id)}`
  const held = holdServerRequest(
    id,
    method,
    params,
    requestId,
    runtime.meta.permissionMode,
    factsOf(session),
  )

  if (!held) return refuseUnknown(session.server, id, method)

  if (runtime.meta.permissionMode === 'bypassPermissions' && held.pending.kind === 'permission') {
    return session.answer(held, { kind: 'permission', decision: { behavior: 'allow' } })
  }

  void runtime.hold(held)
}
