import type { LocalHistoryInvokeContract } from '@shared/ipc/local-history.contract'

import type { LocalHistory } from '../history/local-history'
import type { WorkspaceService } from '../workspace/workspace-service'
import type { InvokeHandlers } from './handle'
import { assertString } from './validate'
import { projectRootOf } from './workspace-handlers'

type LocalHistoryChannels = keyof LocalHistoryInvokeContract

/**
 * Каналы локальной истории (ADR 0045): проект - только открытый, поля - строки. Пути и ключи
 * проверяет сама история: путь - внутри проекта и в виде дерева, ключ - из истории проекта.
 */
export const createLocalHistoryHandlers = (
  workspace: WorkspaceService,
  history: LocalHistory,
): Pick<InvokeHandlers, LocalHistoryChannels> => ({
  'history:list': ({ projectId, path }) => {
    assertString(path, 'path')

    return history.list(projectRootOf(workspace, projectId), path)
  },
  'history:content': ({ projectId, key }) => {
    assertString(key, 'key')

    return history.content(projectRootOf(workspace, projectId), key)
  },
  'history:restore': ({ projectId, path, key }) => {
    assertString(path, 'path')
    assertString(key, 'key')

    return history.restore(projectRootOf(workspace, projectId), path, key)
  },
})
