import type { TFunction } from 'i18next'

import type { Conversation } from '@shared/conversation'
import type { CliTask, FeedItem, FleetAgent, ToolFeedItem } from '@shared/conversation-feed'

import { MAX_JOURNAL_STEPS, COMMAND_OUTCOME_KEYS } from './agents.constants'
import { toolKind } from './feed-rows.utils'
import { formatTokens, formatDuration } from './panel.utils'
import type { SelectedStream, StreamSelection } from './streams.types'
import type { DotState } from './StatusDot/StatusDot.types'
import { worksOnItsOwn } from './StatusDot/StatusDot.utils'

/** Вызов субагента или флота - по виду действия - или агент, поднятый скиллом. */
export const isAgentCall = (item: FeedItem): item is ToolFeedItem =>
  item.kind === 'tool' &&
  (item.action.kind === 'agent' || item.task?.kind === 'agent' || item.task?.kind === 'workflow')

/** Флот workflow, а не один агент: отчёт флота мог ещё не прийти, вид вызова - уже есть. */
export const isWorkflow = (tool: ToolFeedItem): boolean =>
  (tool.action.kind === 'agent' && tool.action.workflow) || tool.task?.kind === 'workflow'

/** Агент верхнего уровня разговора, который ещё работает. */
const isLiveAgent = (item: FeedItem): boolean =>
  item.parentToolUseId === null && isAgentCall(item) && item.status === 'running'

/**
 * Сколько субагентов ещё работает - для «Waiting for N subagents» и «работа встала».
 * Фоновые команды не в счёт: dev-сервер не отчитывается никогда и держал бы строку вечно.
 */
export const pendingAgents = (items: readonly FeedItem[]): number =>
  items.filter(isLiveAgent).length

/** Агенты для чипов потоков: идущие и тот, что сейчас открыт (даже кончившийся). */
export const streamAgents = (items: readonly FeedItem[], selected: string | null): ToolFeedItem[] =>
  items.filter(
    (item): item is ToolFeedItem =>
      isAgentCall(item) && (isLiveAgent(item) || item.id === selected),
  )

/**
 * Фоновые команды Bash и наблюдатели Monitor, которые ещё идут: чип с крестиком, пока процесс
 * жив. Наблюдатель - та же команда в фоне, только каждая её строка будит агента.
 */
export const runningCommands = (items: readonly FeedItem[]): ToolFeedItem[] =>
  items.filter(
    (item): item is ToolFeedItem =>
      item.kind === 'tool' &&
      (item.task?.kind === 'command' || item.task?.kind === 'monitor') &&
      item.task.outcome === null,
  )

/** Будильники агента, которые ещё не сработали: чип со временем, пока их держит процесс. */
export const pendingWakeups = (items: readonly FeedItem[]): ToolFeedItem[] =>
  items.filter(
    (item): item is ToolFeedItem =>
      item.kind === 'tool' && item.task?.kind === 'wakeup' && item.task.outcome === null,
  )

/**
 * Идёт ли в разговоре хоть что-то: модель работает сама (ход, фоновые агенты) или жива
 * фоновая команда, о конце которой CLI её разбудит, или наблюдатель, чьи события её будят
 * (агент кончил ход и ждёт их). Нет - всё стоит до слова человека.
 */
export const isAnythingRunning = (conversation: Conversation, items: readonly FeedItem[]) =>
  worksOnItsOwn(conversation) || runningCommands(items).length > 0

/** Как назвать агента: тип субагента; у флота subagent_type нет вовсе. */
export const agentType = (tool: ToolFeedItem, t: TFunction): string =>
  isWorkflow(tool)
    ? t('agentPanel.agents.workflow')
    : (tool.action.kind === 'agent' && tool.action.agent) || t('agentPanel.agents.agent')

/** Чем занят агент: описание из вызова, иначе из события CLI. */
export const agentDescription = (tool: ToolFeedItem): string =>
  (tool.action.kind === 'agent' && tool.action.description) || tool.task?.activity || ''

/** Сколько шёл вызов к моменту now: до конца или, пока идёт, до сейчас. 0 - неизвестно. */
export const elapsedMs = (tool: ToolFeedItem, now: number): number => {
  if (!tool.startedAt) return 0
  if (tool.endedAt) return Math.max(0, tool.endedAt - tool.startedAt)

  return tool.status === 'running' ? Math.max(0, now - tool.startedAt) : 0
}

/** Доля законченных агентов флота, проценты; у обычного агента её нет - null. */
export const fleetPercent = (tool: ToolFeedItem): number | null => {
  const fleet = tool.task?.fleet

  return fleet && fleet.total > 0 ? Math.round((fleet.done / fleet.total) * 100) : null
}

/**
 * Шаги агента для журнала: его вызовы, мысли и реплики, без служебных вызовов. Срезаны
 * до последних MAX_JOURNAL_STEPS - сколько срезано, говорится строкой сверху.
 */
export const journalSteps = (children: readonly FeedItem[]) => {
  const steps = children.filter(
    (step) =>
      (step.kind === 'tool' && toolKind(step.action) !== 'hidden') ||
      step.kind === 'thinking' ||
      step.kind === 'assistant',
  )
  const trimmed = Math.max(0, steps.length - MAX_JOURNAL_STEPS)

  return { steps: trimmed > 0 ? steps.slice(trimmed) : steps, trimmed }
}

/** Агент флота по месту (карточка и номер) - заново из ленты: прогон продолжает отчитываться. */
export const fleetAgentOf = (
  items: readonly FeedItem[],
  itemId: string,
  index: number,
): { agent: FleetAgent; live: boolean } | null => {
  const card = items.find(
    (item): item is ToolFeedItem => item.kind === 'tool' && item.id === itemId,
  )
  const agent = card?.task?.fleet?.phases
    .flatMap((phase) => phase.agents)
    .find((one) => one.index === index)

  return card && agent ? { agent, live: card.status === 'running' } : null
}

/**
 * Оборван: прогон кончился, а последний отчёт всё ещё зовёт агента идущим или ждущим -
 * процесс ушёл, не попрощавшись. Такой не тикает и не светится работой.
 */
export const isDropped = (agent: FleetAgent, live: boolean): boolean =>
  !live && (agent.state === 'running' || agent.state === 'queued')

/**
 * Факты агента флота справа в строке и в шапке его окна: попытка, кэш, время, токены,
 * вызовы, необычное. withError - причина падения (в окне она в теле, второй раз не нужна).
 */
export const fleetAgentFacts = (
  t: TFunction,
  agent: FleetAgent,
  now: number,
  options: { dropped: boolean; withError: boolean },
): string => {
  const parts: string[] = []

  if (agent.attempt > 0) parts.push(t('agentPanel.agents.fleet.attempt', { count: agent.attempt }))
  if (agent.cached) parts.push(t('agentPanel.agents.fleet.cached'))
  if (agent.durationMs !== null) parts.push(formatDuration(agent.durationMs))
  else if (agent.startedAt !== null && !options.dropped) {
    parts.push(formatDuration(Math.max(0, now - agent.startedAt)))
  }

  if (agent.tokens > 0) parts.push(formatTokens(agent.tokens))
  if (agent.toolCalls > 0)
    parts.push(t('agentPanel.agents.fleet.tools', { count: agent.toolCalls }))
  if (options.dropped) parts.push(t('agentPanel.agents.fleet.dropped'))
  else if (agent.state === 'queued') parts.push(t('agentPanel.agents.fleet.queued'))
  if (agent.state === 'skipped') parts.push(t('agentPanel.agents.fleet.skipped'))
  if (agent.error && options.withError) parts.push(agent.error)

  return parts.join(' · ')
}

/**
 * Чем кончилась фоновая команда - строкой для её карточки: «Background command failed
 * after 5m 02s.» Ещё идёт - null.
 */
export const commandEndText = (t: TFunction, task: CliTask): string | null => {
  if (task.kind !== 'command' || task.outcome === null) return null

  const outcome = t(COMMAND_OUTCOME_KEYS[task.outcome])
  const ran = task.startedAt && task.endedAt ? task.endedAt - task.startedAt : 0

  return ran > 0
    ? t('agentPanel.agents.commandEnded', { outcome, duration: formatDuration(ran) })
    : t('agentPanel.agents.commandEndedNoTime', { outcome })
}

/**
 * Что показывать вместо ленты по выбору и ленте как она есть: окно агента флота важнее
 * потока под ним. Вызов пропал (откат, /clear) - выбор не в счёт, видна лента.
 */
export const selectedStreamOf = (
  selection: StreamSelection | undefined,
  items: readonly FeedItem[],
): SelectedStream | null => {
  const has = (id: string) => items.some((item) => item.id === id && isAgentCall(item))
  const fleet = selection?.fleet

  if (fleet && fleetAgentOf(items, fleet.itemId, fleet.index)) {
    return { kind: 'fleetAgent', itemId: fleet.itemId, index: fleet.index }
  }

  const stream = selection?.stream

  return stream && has(stream) ? { kind: 'agent', itemId: stream } : null
}

/** Точка агента флота: работает, готов, упал; ждущий, снятый и оборванный - серые. */
export const fleetDotState = (agent: FleetAgent, dropped: boolean): DotState => {
  if (dropped) return 'idle'
  if (agent.state === 'running') return 'running'
  if (agent.state === 'done') return 'done'

  return agent.state === 'failed' ? 'crashed' : 'idle'
}

/** Точка агента на чипе: идёт, готов, упал; прерванный и отказанный - серые. */
export const agentDotState = (tool: ToolFeedItem): DotState => {
  if (tool.status === 'running') return 'running'
  if (tool.status === 'done') return 'done'

  return tool.status === 'error' ? 'crashed' : 'idle'
}
