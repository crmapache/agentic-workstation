import type { ScenarioQueue, ScenarioQueuesView } from '@shared/scenario-queues'
import type { RunSummary, ScenarioRun } from '@shared/scenario-runs'
import type { Scenario } from '@shared/scenarios'

import type {
  RunWire,
  QueueWire,
  QueuesSummary,
  RunSummaryWire,
  ShelfScenarioWire,
} from '@agentic-workstation/remote-protocol/wire-types'

/**
 * Сценарии - телефону: те же очереди и прогоны, что видит окно, без путей. Папка worktree,
 * папка проекта и коммит-основа остаются в IDE; телефон знает очередь по id, проект - по ключу.
 */

type KeyOf = (rootPath: string) => string

export const queueWire = (queue: ScenarioQueue, keyOf: KeyOf): QueueWire => ({
  id: queue.id,
  projectKey: keyOf(queue.projectPath),
  name: queue.name,
  createdAt: queue.createdAt,
  closedAt: queue.closedAt,
  workdir:
    queue.workdir.kind === 'worktree'
      ? { kind: 'worktree', gitBranch: queue.workdir.gitBranch, removed: queue.workdir.removed }
      : { kind: 'project' },
  items: queue.items.map((item) => ({
    id: item.id,
    scenarioId: item.scenarioId,
    scope: item.scope,
    scenarioName: item.scenarioName,
    inputs: item.inputs,
    provider: item.provider,
    afterSuccess: item.afterSuccess,
    addedAt: item.addedAt,
    runId: item.runId,
    state: item.state,
    refusal: item.refusal,
  })),
  stopAfterItemId: queue.stopAfterItemId,
  hold: queue.hold,
  acknowledgedItemId: queue.acknowledgedItemId,
})

export const runSummaryWire = (run: RunSummary, keyOf: KeyOf): RunSummaryWire => ({
  id: run.id,
  projectKey: keyOf(run.projectPath),
  provider: run.provider,
  queueId: run.queueId,
  itemId: run.itemId,
  scenarioId: run.scenarioId,
  scenarioName: run.scenarioName,
  startedAt: run.startedAt,
  finishedAt: run.finishedAt,
  state: run.state,
  total: run.total,
  done: run.done,
  failure: run.failure,
  cost: run.cost,
  stageTitle: run.stageTitle,
  at: run.at,
  asking: run.asking,
  roadmap: run.roadmap,
  limit: run.limit,
})

/** Прогон целиком: дорожка, шаги, заметки, вопрос головы. Промпты шагов остаются в IDE. */
export const runWire = (run: ScenarioRun, keyOf: KeyOf): RunWire => ({
  id: run.id,
  projectKey: keyOf(run.projectPath),
  provider: run.provider,
  queueId: run.queueId,
  itemId: run.itemId,
  scenarioId: run.scenarioId,
  scenarioName: run.scenarioName,
  startedAt: run.startedAt,
  finishedAt: run.finishedAt,
  state: run.state,
  total: run.total,
  failure: run.failure,
  cost: run.cost,
  limit: run.limit,
  stages: run.snapshot.stages.map((stage) => ({ id: stage.id, title: stage.title })),
  steps: run.steps.map((step) => ({
    key: step.key,
    stageId: step.stageId,
    pass: step.pass,
    title: step.title,
    state: step.state,
    startedAt: step.startedAt,
    finishedAt: step.finishedAt,
    said: step.said,
    summary: step.summary,
    verdict: step.verdict,
    failure: step.failure,
    error: step.error,
    cost: step.cost,
  })),
  notes: run.notes.map((note) => ({
    at: note.at,
    stepKey: note.stepKey,
    text: note.text,
    who: note.who,
  })),
  question: run.question && { ...run.question, truncated: run.question.truncated === true },
  error: run.error,
  answering: run.answering,
  inputs: run.inputs,
})

export const shelfScenarioWire = (scenario: Scenario): ShelfScenarioWire => ({
  id: scenario.id,
  scope: scenario.scope,
  name: scenario.name,
  inputs: scenario.inputs.map(({ id, name, label, placeholder, required }) => ({
    id,
    name,
    label,
    placeholder,
    required,
  })),
})

/** Очереди проекта коротко - для списка проектов на первом экране телефона. */
export const queuesSummary = (view: ScenarioQueuesView, rootPath: string): QueuesSummary => {
  const live = view.live.filter((run) => run.projectPath === rootPath)

  return {
    open: view.queues.filter((queue) => queue.projectPath === rootPath && queue.closedAt === 0)
      .length,
    running: live.length,
    asking: live.filter((run) => run.asking !== '').length,
  }
}

/** Проект прогона: идущий - из сводок, прошедший - по очереди, где лежит его элемент. */
export const runProjectPath = (view: ScenarioQueuesView, runId: string): string | null =>
  view.live.find((run) => run.id === runId)?.projectPath ??
  view.queues.find((queue) => queue.items.some((item) => item.runId === runId))?.projectPath ??
  null
