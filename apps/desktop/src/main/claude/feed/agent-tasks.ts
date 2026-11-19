import type { CliTask, ClosedReason, ToolFeedItem, CliTaskOutcome } from '@shared/conversation-feed'

import type { CliMessage } from '../cli/cli-messages'
import { isRecord, stringField } from '../cli/cli-messages'
import type { FeedStore } from '../../agents/feed/feed-store'
import {
  AGENT_CALLS,
  NOTIFIED_TASK,
  MAX_AGENT_STEPS,
  NOTIFIED_STATUS,
  LAUNCHED_TASK_ID,
  NOTIFIED_SUMMARY,
  BACKGROUND_LAUNCH,
  NOTIFIED_TOOL_USE,
  NOTIFICATION_BLOCK,
} from './agent-tasks.constants'
import { claudeToolAction } from './tool-action'
import { fleetOf } from './workflow-fleet'

const newTask = (
  taskId: string,
  kind: CliTask['kind'],
  background: boolean,
  startedAt: number,
): CliTask => ({
  taskId,
  kind,
  background,
  startedAt,
  endedAt: 0,
  activity: '',
  steps: [],
  trimmed: 0,
  fleet: null,
  outcome: null,
  summary: '',
})

const outcomeOf = (status: string): CliTaskOutcome =>
  status === 'failed'
    ? 'failed'
    : status === 'stopped' || status === 'killed'
      ? 'stopped'
      : 'completed'

const kindOfCall = (name: string): CliTask['kind'] => (name === 'Workflow' ? 'workflow' : 'agent')

/** Фоновая команда - Bash с run_in_background; долгая обычная идёт тем же каналом, но видна своей карточкой. */
const isBackgroundCommand = (call: ToolFeedItem) =>
  call.name === 'Bash' && call.input['run_in_background'] === true

const tagOf = (pattern: RegExp, text: string) => pattern.exec(text)?.[1]?.trim() ?? ''

/** Текст сообщения транскрипта: строка или текстовые блоки. */
const textOf = (content: unknown): string => {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return content
    .filter(isRecord)
    .filter((block) => block['type'] === 'text')
    .map((block) => stringField(block, 'text'))
    .join('\n')
}

/** Шаг в журнал агента: старые срезаются пределом, срезанные считаются числом. */
export const withStep = (task: CliTask, step: string): Pick<CliTask, 'steps' | 'trimmed'> => {
  const steps = [...task.steps, step]
  const over = steps.length - MAX_AGENT_STEPS

  return over > 0
    ? { steps: steps.slice(over), trimmed: task.trimmed + over }
    : { steps, trimmed: task.trimmed }
}

/**
 * Задачи CLI (события task_*): субагенты, флоты workflow, фоновые команды. Такая задача
 * приходит двумя путями (вызов в ответе модели и системные события), переживает ход,
 * который её поднял, и находится по двум именам (tool_use_id и task_id). Агента,
 * поднятого скиллом, вызова Task в потоке нет вовсе - для него заводится свой вызов.
 * Всё узнанное ложится в поле task вызова; учёт фонового - здесь.
 */
export class AgentTasks {
  /** task_id CLI → id вызова в ленте. */
  private readonly cards = new Map<string, string>()
  /** Агенты и флоты в фоне: ход их не ждёт, конец придёт уведомлением. */
  private readonly background = new Set<string>()
  /** Идущие фоновые команды: task_id → id вызова Bash. */
  private readonly commands = new Map<string, string>()

  constructor(private readonly store: FeedStore) {}

  /**
   * Не встала ли работа: идут фоновые агенты, флоты, агенты скилла. Фоновые команды не
   * в счёт: поднятый так dev-сервер не отчитывается никогда и держал бы работу открытой.
   */
  get hasWork(): boolean {
    return [...this.background].some((id) => this.tool(id)?.status === 'running')
  }

  /** Идут фоновые команды: они дети процесса CLI и умрут вместе с ним. */
  get hasCommands(): boolean {
    return this.commands.size > 0
  }

  /** Конец хода этот вызов не закрывает: он в фоне и отчитается уведомлением. */
  isBackground(id: string): boolean {
    return this.background.has(id)
  }

  /** Строка task_* CLI. true - строка разобрана здесь, сборщику дальше её не нести. */
  applySystem(message: CliMessage, at: number): boolean {
    const subtype = message.subtype ?? ''

    if (!subtype.startsWith('task_')) return false

    const taskId = stringField(message, 'task_id')

    if (subtype === 'task_started') this.started(message, taskId, at)
    else if (subtype === 'task_progress') this.progress(message, taskId)
    else if (subtype === 'task_notification') this.notified(message, taskId, at)

    return true
  }

  /**
   * Результат вызова. true - это подтверждение запуска в фон («Async agent launched»,
   * «Workflow launched in background»), а не отчёт: вызов остаётся идущим.
   */
  onToolResult(call: ToolFeedItem, text: string): boolean {
    if (!AGENT_CALLS.has(call.name) || !BACKGROUND_LAUNCH.test(text)) return false

    const launched = LAUNCHED_TASK_ID.exec(text)?.[1] ?? ''
    const task = call.task ?? newTask(launched, kindOfCall(call.name), true, call.startedAt)
    const taskId = task.taskId || launched

    this.background.add(call.id)
    if (taskId) this.cards.set(taskId, call.id)
    this.setTask(call, { ...task, taskId, background: true })

    return true
  }

  /**
   * Процесс ушёл (умер или заменён нарочно): фоновые агенты закрыты с причиной, за
   * фоновыми командами следить больше некому - они «отпущены», а не прерваны: dev-сервер
   * переживает CLI, который его поднял.
   */
  release(reason: ClosedReason, at: number): void {
    for (const id of this.background) {
      const call = this.tool(id)

      if (call?.status !== 'running') continue

      this.store.put({
        ...call,
        status: 'interrupted',
        closedReason: reason,
        endedAt: at,
        ...(call.task ? { task: { ...call.task, endedAt: at } } : {}),
      })
    }

    for (const id of this.commands.values()) {
      const call = this.tool(id)

      if (call?.task) this.setTask(call, { ...call.task, outcome: 'untracked', endedAt: at })
    }

    this.forget()
  }

  /** Забыть учёт, не трогая ленту: транскрипт прочитан, страница истории собрана. */
  forget(): void {
    this.cards.clear()
    this.background.clear()
    this.commands.clear()
  }

  /** Лента обрезана (откат, /clear): учёт отрезанных вызовов уходит с ними. */
  prune(): void {
    for (const [taskId, id] of this.cards) if (!this.tool(id)) this.cards.delete(taskId)
    for (const id of this.background) if (!this.tool(id)) this.background.delete(id)
    for (const [taskId, id] of this.commands) if (!this.tool(id)) this.commands.delete(taskId)
  }

  /**
   * Уведомление о задаче из транскрипта: живьём конец приходит своим событием, а в
   * транскрипте его хранит только сообщение, которое CLI пишет агенту от имени человека.
   * Только для replay - иначе итог лёг бы в карточку дважды.
   */
  applyReplayedNotification(content: unknown, at: number): void {
    for (const block of textOf(content).match(NOTIFICATION_BLOCK) ?? []) {
      const call = this.tool(tagOf(NOTIFIED_TOOL_USE, block))

      if (!call) continue

      const outcome = outcomeOf(tagOf(NOTIFIED_STATUS, block))
      const summary = tagOf(NOTIFIED_SUMMARY, block)

      if (AGENT_CALLS.has(call.name)) this.finish(call, outcome, summary, at)
      else if (isBackgroundCommand(call)) {
        const task = call.task ?? newTask(tagOf(NOTIFIED_TASK, block), 'command', true, 0)

        this.setTask(call, { ...task, outcome, summary, endedAt: at })
      }
    }
  }

  private started(message: CliMessage, taskId: string, at: number) {
    if (!taskId) return

    const toolUseId = stringField(message, 'tool_use_id')
    const call = this.tool(toolUseId)
    const taskType = stringField(message, 'task_type')

    if (taskType === 'local_bash') {
      if (!call || !isBackgroundCommand(call)) return

      this.commands.set(taskId, call.id)

      return this.setTask(call, newTask(taskId, 'command', true, at))
    }

    if (call && AGENT_CALLS.has(call.name)) {
      const task =
        call.task ?? newTask(taskId, kindOfCall(call.name), this.isBackground(call.id), at)

      this.cards.set(taskId, call.id)

      return this.setTask(call, { ...task, taskId, startedAt: at })
    }

    this.startOwnCall(
      message,
      taskId,
      toolUseId && !this.store.get(toolUseId) ? toolUseId : taskId,
      at,
    )
  }

  /**
   * Агент, поднятый скиллом (/code-review): вызова Task в потоке нет, есть только
   * событие запуска. Его вызов заводится здесь под tool_use_id события - строки самого
   * агента придут с ним же в parent_tool_use_id и встанут внутрь карточки.
   */
  private startOwnCall(message: CliMessage, taskId: string, id: string, at: number) {
    this.cards.set(taskId, id)

    if (this.store.get(id)) return

    const workflow = stringField(message, 'task_type') === 'local_workflow'
    const description = stringField(message, 'description')
    const subagentType = stringField(message, 'subagent_type')

    const name = workflow ? 'Workflow' : 'Agent'
    const input = {
      ...(description ? { description } : {}),
      ...(subagentType ? { subagent_type: subagentType } : {}),
    }

    this.background.add(id)
    this.store.put({
      kind: 'tool',
      id,
      parentToolUseId: stringField(message, 'parent_tool_use_id') || null,
      name,
      input,
      action: claudeToolAction(name, input),
      status: 'running',
      result: null,
      startedAt: at,
      endedAt: 0,
      closedReason: null,
      task: {
        ...newTask(taskId, workflow ? 'workflow' : 'agent', true, at),
        activity: description,
      },
    })
  }

  private progress(message: CliMessage, taskId: string) {
    const call = this.cardOf(taskId, message)
    const task = call?.task

    if (!call || !task || task.kind === 'command') return

    const activity = stringField(message, 'description') || task.activity
    const fleet = fleetOf(message['workflow_progress'])

    if (fleet) return this.setTask(call, { ...task, kind: 'workflow', fleet, activity })

    // У workflow last_tool_name - метка последнего шевельнувшегося агента флота: флот из
    // девяти писал бы девять одинаковых строк и ни слова про девять. Решает задача, а не
    // событие: между отчётами CLI шлёт голые события с одной этой меткой.
    if (task.kind === 'workflow') return this.setTask(call, { ...task, activity })

    const step = stringField(message, 'last_tool_name')

    this.setTask(call, { ...task, activity, ...(step ? withStep(task, step) : {}) })
  }

  private notified(message: CliMessage, taskId: string, at: number) {
    const outcome = outcomeOf(stringField(message, 'status'))
    const summary = stringField(message, 'summary')
    const commandId = this.commands.get(taskId)
    const call = commandId ? this.tool(commandId) : this.cardOf(taskId, message)

    if (commandId) this.commands.delete(taskId)
    if (!call) return

    if (call.task?.kind === 'command' || isBackgroundCommand(call)) {
      const task = call.task ?? newTask(taskId, 'command', true, 0)

      return this.setTask(call, { ...task, outcome, summary, endedAt: at })
    }

    if (AGENT_CALLS.has(call.name)) this.finish(call, outcome, summary, at)
  }

  /** Конец агента по уведомлению. Идущий вызов закрывается им; закрытый результатом - только итог задачи. */
  private finish(call: ToolFeedItem, outcome: CliTaskOutcome, summary: string, at: number) {
    const task = call.task ?? newTask('', kindOfCall(call.name), false, call.startedAt)
    const closing = call.status === 'running'
    const status = outcome === 'failed' ? 'error' : outcome === 'stopped' ? 'interrupted' : 'done'

    this.background.delete(call.id)
    this.store.put({
      ...call,
      ...(closing && {
        status,
        result: summary
          ? { text: summary, isError: outcome === 'failed', truncated: false }
          : call.result,
        endedAt: at,
        closedReason: outcome === 'stopped' ? ('stopped' as const) : null,
      }),
      task: { ...task, outcome, summary, endedAt: at },
    })
  }

  /** Вызов задачи: по task_id, по tool_use_id события, по самому task_id как id вызова. */
  private cardOf(taskId: string, message: CliMessage): ToolFeedItem | undefined {
    return (
      this.tool(this.cards.get(taskId) ?? '') ??
      this.tool(stringField(message, 'tool_use_id')) ??
      this.tool(taskId)
    )
  }

  private tool(id: string): ToolFeedItem | undefined {
    const item = id ? this.store.get(id) : undefined

    return item?.kind === 'tool' ? item : undefined
  }

  private setTask(call: ToolFeedItem, task: CliTask) {
    this.store.put({ ...call, task })
  }
}
