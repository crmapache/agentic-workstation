import type { GitChangesInvokeContract } from '@shared/ipc/git-changes.contract'

import { readHeadFile } from '../git/git-head-file'
import type { GitStatusService } from '../git/git-status-service'
import type { WorkspaceService } from '../workspace/workspace-service'
import type { InvokeHandlers } from './handle'
import { assertString } from './validate'
import { projectRootOf } from './workspace-handlers'

/**
 * Каналы списка изменений, счёта строк и разницы файла. Список и счёт держит сервис статуса
 * (он же их и перечитывает), версия из HEAD читается напрямую: путь проверяется до git.
 */
export const createGitChangesHandlers = (
  workspace: WorkspaceService,
  gitStatus: GitStatusService,
): Pick<InvokeHandlers, keyof GitChangesInvokeContract> => ({
  'git:getChanges': ({ projectId }) =>
    gitStatus.getChanges(projectId, projectRootOf(workspace, projectId)),
  'git:getLineStats': ({ projectId }) =>
    gitStatus.getLineStats(projectId, projectRootOf(workspace, projectId)),
  'git:readHeadFile': ({ projectId, path }) => {
    assertString(path, 'path')

    return readHeadFile(projectRootOf(workspace, projectId), path)
  },
})
