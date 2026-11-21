import type { TrackerInvokeContract } from '@shared/ipc/tracker.contract'

import type { CloudService } from '../cloud/cloud-service'
import type { TrackerRuns } from '../tracker/tracker-runs'
import type { TrackerService } from '../tracker/tracker-service'
import type { TrackerPlace } from '../tracker/tracker-spaces'
import type { WorkspaceService } from '../workspace/workspace-service'
import type { InvokeHandlers } from './handle'
import { parseTrackerOp, parseSendRequest } from './tracker-validate'
import { assertString } from './validate'

type TrackerChannels = keyof TrackerInvokeContract

/** Открытый проект окна как место доски: путь, имя и отметка дома. */
export const trackerPlaceOf = (workspace: WorkspaceService, projectId: unknown): TrackerPlace => {
  assertString(projectId, 'projectId')

  const project = workspace.findProject(projectId)

  if (!project) throw new Error(`Проект ${projectId} не открыт`)

  return { rootPath: project.rootPath, name: project.name, home: project.home === true }
}

/** Каналы трекера (ADR 0101) и облака (ADR 0102): проверить запрос и позвать сервис. */
export const createTrackerHandlers = (
  workspace: WorkspaceService,
  tracker: TrackerService,
  runs: TrackerRuns,
  cloud: CloudService,
): Pick<InvokeHandlers, TrackerChannels> => {
  const place = (projectId: unknown) => trackerPlaceOf(workspace, projectId)

  return {
    'tracker:board': ({ projectId }) => tracker.board(place(projectId)),
    'tracker:apply': ({ projectId, op }) => tracker.apply(place(projectId), parseTrackerOp(op)),
    'tracker:send': (request) => runs.send(place(request.projectId), parseSendRequest(request)),
    'cloud:state': () => cloud.state(),
    'cloud:copyKey': () => cloud.copyKey(),
    'cloud:useKey': ({ key }) => {
      assertString(key, 'key')

      return cloud.useKey(key)
    },
    'cloud:setEnabled': ({ enabled }) => cloud.setEnabled(enabled === true),
  }
}
