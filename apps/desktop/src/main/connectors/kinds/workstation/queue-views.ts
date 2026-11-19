import type { ScenarioQueue } from '@shared/scenario-queues'
import type { RunSummary, ScenarioRun } from '@shared/scenario-runs'

import type { NativeCall } from '../native-tools'
import type { WorkstationPorts } from '../../../workstation/workstation-link'
import { timeOf, hoursView, projectOf } from './workstation-args'

/** Потолок текста шага и вопроса в ответе: модель видит суть, целиком - журнал в IDE. */
const TEXT_MAX = 1500

const short = (text: string, max = TEXT_MAX): string =>
  text.length > max ? `${text.slice(0, max)}…` : text

/** Идущий прогон очереди коротко: где он и о чём спрашивает. */
const liveView = (run: RunSummary) => ({
  runId: run.id,
  state: run.state,
  done: run.done,
  total: run.total,
  stage: run.stageTitle,
  at: run.at,
  ...(run.asking && { asking: run.asking }),
  ...(run.limit && { waitsForLimitUntil: timeOf(run.limit.until) }),
})

/** Очередь для модели: элементы по порядку, остановки, часы и идущий прогон. */
export const queueView = (queue: ScenarioQueue, live: readonly RunSummary[]) => {
  const running = live.find((run) => run.queueId === queue.id)

  return {
    id: queue.id,
    name: queue.name,
    project: queue.projectPath,
    closed: queue.closedAt > 0,
    folder:
      queue.workdir.kind === 'project'
        ? 'project'
        : {
            worktree: queue.workdir.path,
            branch: queue.workdir.gitBranch,
            removed: queue.workdir.removed,
          },
    stopAfterItemId: queue.stopAfterItemId || null,
    hold: queue.hold && {
      reason: queue.hold.reason,
      itemId: queue.hold.itemId,
      since: timeOf(queue.hold.at),
    },
    hours: hoursView(queue.hours),
    sleepingUntil: queue.nap ? timeOf(queue.nap.until) : null,
    items: queue.items.map((item) => ({
      id: item.id,
      scenario: item.scenarioName,
      scenarioId: item.scenarioId,
      scope: item.scope,
      inputs: item.inputs,
      provider: item.provider,
      state: item.state,
      runId: item.runId || null,
      ...(item.refusal && { refusal: item.refusal }),
      ...(item.doneByHand && { doneByHand: true }),
    })),
    running: running ? liveView(running) : null,
  }
}

/** Прогон сценария для модели: шаги, вопрос, на котором он стоит, и последние слова. */
export const runView = (run: ScenarioRun) => ({
  runId: run.id,
  scenario: run.scenarioName,
  scenarioId: run.scenarioId,
  project: run.projectPath,
  folder: run.cwd,
  provider: run.provider,
  queueId: run.queueId || null,
  state: run.state,
  started: timeOf(run.startedAt),
  finished: timeOf(run.finishedAt),
  inputs: run.inputs,
  ...(run.failure && { failure: run.failure }),
  ...(run.error && { error: short(run.error) }),
  costUsd: run.cost,
  steps: run.steps.map((step) => ({
    key: step.key,
    title: step.title,
    state: step.state,
    ...(step.verdict && { verdict: step.verdict }),
    ...((step.summary || step.said) && { said: short(step.summary || step.said, 600) }),
  })),
  question: run.question && {
    title: run.question.title,
    tool: run.question.tool,
    detail: short(run.question.detail),
    options: run.question.options,
  },
  notes: run.notes.slice(-5).map((note) => ({
    at: timeOf(note.at),
    who: note.who || 'head',
    text: short(note.text, 600),
  })),
})

/**
 * Проект прогона: IDE знает его по очереди или идущему прогону; прогон из истории - в проекте,
 * который назвала модель, иначе в проекте разговора.
 */
export const runProjectOf = (
  ports: WorkstationPorts,
  runId: string,
  args: Record<string, unknown>,
  call: NativeCall,
): string => {
  const view = ports.scenarios.queuesView()
  const live = view.live.find((run) => run.id === runId)
  const queued = view.queues.find((queue) => queue.items.some((item) => item.runId === runId))

  return live?.projectPath ?? queued?.projectPath ?? projectOf(args, call, ports.projects)
}
