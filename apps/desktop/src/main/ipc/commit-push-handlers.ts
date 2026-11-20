import type { CommitPushInvokeContract } from '@shared/ipc/commit-push.contract'

import type { WorkspaceService } from '../workspace/workspace-service'
import type { CommitPushDesk } from '../git/commit-push/commit-push'
import type { InvokeHandlers } from './handle'
import { projectRootOf } from './workspace-handlers'

type CommitPushChannels = keyof CommitPushInvokeContract

/** Кнопка Commit and push в шапке: проект по id, остальное - CommitPushDesk. */
export const createCommitPushHandlers = (
  workspace: WorkspaceService,
  desk: CommitPushDesk,
): Pick<InvokeHandlers, CommitPushChannels> => ({
  'git:commitAndPush': ({ projectId }) => desk.run(projectRootOf(workspace, projectId)),
})
