import type { ScenarioCode, ScenarioOutcome } from '@shared/scenarios'
import type { RunPlace, ScenariosInvokeContract } from '@shared/ipc/scenarios.contract'

import type { ClaudeService } from '../claude/claude-service'
import { listProviders } from '../providers/provider-registry'
import type { ScenarioService } from '../scenarios/scenario-service'
import type { WorkspaceService } from '../workspace/workspace-service'
import { parseOutgoing } from './claude-validate'
import type { InvokeHandlers } from './handle'
import {
  assertId,
  parseHour,
  parseInputs,
  parseTarget,
  parseControl,
  parseProvider,
  parseRunPlace,
  parseQueueAction,
  parseWorktreeAction,
} from './scenarios-validate'
import { assertString } from './validate'
import { projectRootOf } from './workspace-handlers'

type ScenariosChannels = keyof ScenariosInvokeContract

const outcome = (code: ScenarioCode | null): ScenarioOutcome =>
  code ? { ok: false, code } : { ok: true }

/** Каналы сценариев (ADR 0039): проверить запрос и позвать сервис. */
export const createScenariosHandlers = (
  workspace: WorkspaceService,
  claude: ClaudeService,
  scenarios: ScenarioService,
): Pick<InvokeHandlers, ScenariosChannels> => {
  const root = (projectId: unknown) => projectRootOf(workspace, projectId)
  /** Проект прогона: по очереди (её проект может быть и не текущим) или открытый проект. */
  const placeRoot = (value: unknown): string => {
    const place: RunPlace = parseRunPlace(value)

    if ('projectId' in place) return root(place.projectId)

    const queue = scenarios.queuesView().queues.find((one) => one.id === place.queueId)

    if (!queue) throw new Error('Очередь не найдена')

    return queue.projectPath
  }
  const text = (value: unknown, name: string) => {
    assertString(value, name)

    return value
  }

  return {
    'providers:list': () => listProviders(claude),
    'scenarios:shelves': ({ projectId }) => scenarios.shelves.view(root(projectId)),
    'scenarios:fetch': ({ projectId, id, scope }) =>
      scenarios.shelves.fetch(root(projectId), text(id, 'id'), text(scope, 'scope')),
    'scenarios:save': ({ projectId, scenario, scope }) =>
      scenarios.shelves.save(root(projectId), scenario, text(scope, 'scope')),
    'scenarios:delete': async ({ projectId, id, scope }) =>
      outcome(
        await scenarios.shelves.delete(root(projectId), text(id, 'id'), text(scope, 'scope')),
      ),
    'scenarios:duplicate': async ({ projectId, id, scope }) =>
      outcome(
        await scenarios.shelves.duplicate(root(projectId), text(id, 'id'), text(scope, 'scope')),
      ),
    'scenarios:place': async ({ projectId, id, from, to, before }) =>
      outcome(
        await scenarios.shelves.place(
          root(projectId),
          text(id, 'id'),
          text(from, 'from'),
          text(to, 'to'),
          text(before, 'before'),
        ),
      ),
    'scenarios:draft': ({ projectId, draftId, description, scope }) =>
      scenarios.shelves.draft(
        root(projectId),
        assertId(draftId, 'draftId'),
        text(description, 'description').slice(0, 20_000),
        text(scope, 'scope'),
      ),
    'scenarios:cancelDraft': ({ draftId }) =>
      scenarios.shelves.cancelDraft(assertId(draftId, 'draftId')),
    'scenarios:queues': () => scenarios.queuesView(),
    'scenarios:start': (request) =>
      scenarios.start({
        projectPath: root(request.projectId),
        scenarioId: text(request.scenarioId, 'scenarioId'),
        scope: text(request.scope, 'scope'),
        inputs: parseInputs(request.inputs),
        provider: parseProvider(request.provider),
        target: parseTarget(request.target),
        afterSuccess: request.afterSuccess === true,
      }),
    'scenarios:queue': async ({ queueId, action }) =>
      outcome(await scenarios.act(assertId(queueId, 'queueId'), parseQueueAction(action))),
    'scenarios:worktreeFacts': ({ queueId }) =>
      scenarios.worktreeFacts(assertId(queueId, 'queueId')),
    'scenarios:worktree': async ({ queueId, action }) =>
      outcome(await scenarios.worktree(assertId(queueId, 'queueId'), parseWorktreeAction(action))),
    'scenarios:run': ({ place, runId }) =>
      scenarios.run(placeRoot(place), assertId(runId, 'runId')),
    'scenarios:control': ({ place, runId, action }) =>
      scenarios.control(placeRoot(place), assertId(runId, 'runId'), parseControl(action)),
    'scenarios:carryOn': async ({ runId }) =>
      outcome(await scenarios.carryOn(assertId(runId, 'runId'))),
    'scenarios:answer': ({ place, runId, allow, text: words }) =>
      scenarios.answer(
        placeRoot(place),
        assertId(runId, 'runId'),
        allow === true,
        text(words, 'text'),
      ),
    'scenarios:tell': ({ place, runId, text: words, images }) => {
      const message = parseOutgoing({ text: words, images })
      const told = scenarios.tell(
        placeRoot(place),
        assertId(runId, 'runId'),
        message.text,
        message.images,
      )

      return outcome(told ? null : 'runOver')
    },
    'scenarios:stepLog': ({ place, runId, key, earlier }) =>
      scenarios.log(placeRoot(place), assertId(runId, 'runId'), text(key, 'key'), earlier === true),
    'scenarios:deleteRun': async ({ projectId, runId }) =>
      outcome(await scenarios.shelves.deleteRun(root(projectId), assertId(runId, 'runId'))),
    'scenarios:starRun': async ({ projectId, runId, starred }) =>
      outcome(
        await scenarios.shelves.starRun(
          root(projectId),
          assertId(runId, 'runId'),
          starred === true,
        ),
      ),
    'scenarios:schedule': async ({ projectId, hour }) =>
      outcome(await scenarios.schedule(root(projectId), parseHour(hour))),
    'scenarios:unschedule': async ({ projectId, scheduleId }) =>
      outcome(await scenarios.unschedule(root(projectId), text(scheduleId, 'scheduleId'))),
  }
}
