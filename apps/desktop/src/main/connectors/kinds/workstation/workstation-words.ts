import type { ScenarioCode } from '@shared/scenarios'
import type { TaskCode } from '@shared/tasks'

import { ArgumentError } from '../native-tools'

/** Отказы сценариев словами для модели: окно говорит их человеку своим текстом. */
const SCENARIO_WORDS: Record<ScenarioCode, string> = {
  scenarioGone: 'There is no such scenario on that shelf.',
  scenarioBroken: 'The scenario cannot run as it is: it has no cards or comes from a newer IDE.',
  scenarioMissingInput: 'A required input of the scenario has no answer.',
  scenarioNotWritten: 'The scenario file was not written.',
  scenarioNotDeleted: 'The scenario file was not deleted.',
  scenarioOnBothShelves: 'A scenario with this id is on both shelves.',
  scenarioNotMoved: 'The scenario was not moved.',
  orderNotWritten: 'The order of scenarios was not written.',
  schedulesNotWritten: 'The schedule file was not written.',
  queueGone: 'There is no such queue in that project.',
  queueBusy: 'The queue is busy right now (a scenario runs or its worktree is being removed).',
  queueClosed: 'The queue is closed.',
  itemGone: 'There is no such item in the queue.',
  notARepo: 'The project is not a git repository: a worktree needs one.',
  noCommits: 'The repository has no commits yet: a worktree needs one.',
  worktreeFailed: 'The worktree could not be made or is gone.',
  worktreeDirty: 'The worktree has uncommitted changes.',
  providerMissing: 'That provider is not in the IDE.',
  chatOnly:
    'antigravity works only in its own chat, typed by the person: Google does not allow it to run unattended.',
  noClaude: 'Claude Code CLI is not found on this computer.',
  noCli: 'The CLI of that provider is not found on this computer.',
  untrusted:
    'The person has not trusted this project folder yet: they trust it in the IDE before anything runs there.',
  runBusy: 'The run is busy.',
  runGone: 'There is no such run.',
  runNotResumable:
    'Only the last finished item of a queue, with nothing after it, can be continued.',
  runOver: 'The run is not going.',
  runForeign: 'The run belongs to the Amazing Claude Code plugin: it is read-only here.',
}

const TASK_WORDS: Record<TaskCode, string> = {
  chatOnly:
    'antigravity works only in its own chat, typed by the person: Google does not allow it to run unattended.',
  taskGone: 'There is no such task.',
  runGone: 'There is no such run.',
  runBusy: 'The run is busy: wait until it finishes.',
  moveBusy: 'A task moves to another project only while no run of it is going or asleep.',
  runIdle: 'The run is not going.',
  noName: 'The task needs a name.',
  noPrompt: 'The task needs a prompt.',
  badFolder: 'The folder is not a project the IDE knows.',
  badSchedule: 'A one-time run must be in the future.',
  notWritten: 'The task was not written to disk.',
  noTranscript: 'The conversation of the run is gone.',
  noClaude: 'Claude Code CLI is not found on this computer.',
  noCli: 'The CLI of the task provider is not found on this computer.',
  untrusted: 'The person has not trusted the project folder yet.',
  folderMissing: 'The project folder is gone.',
  startFailed: 'The run did not start.',
  crashed: 'The run crashed.',
  turnError: 'The turn ended with an error.',
  tooLong: 'The run went on too long.',
  ideClosed: 'The IDE was closed during the run.',
  overBudget: 'The goal is over its budget.',
  wakeLimit: 'The goal woke up too many times.',
  expired: 'The goal ran out of days.',
  gaveUp: 'The goal gave up.',
}

/** Отказ сценариев - ошибкой, которую модель прочитает; null - всё прошло. */
export const checkScenario = (code: ScenarioCode | null): void => {
  if (code) throw new ArgumentError(SCENARIO_WORDS[code])
}

export const scenarioError = (code: ScenarioCode, detail?: string): ArgumentError =>
  new ArgumentError(detail ? `${SCENARIO_WORDS[code]} ${detail}` : SCENARIO_WORDS[code])

export const taskError = (code: TaskCode): ArgumentError => new ArgumentError(TASK_WORDS[code])
