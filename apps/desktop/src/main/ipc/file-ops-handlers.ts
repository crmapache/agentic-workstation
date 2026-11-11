import type { FileMove, EntryKind } from '@shared/file-ops'
import type { FileOpsInvokeContract } from '@shared/ipc/file-ops.contract'

import type { FileOpsService } from '../fs/file-ops-service'
import type { WorkspaceService } from '../workspace/workspace-service'
import type { InvokeHandlers } from './handle'
import { assertString } from './validate'
import { projectRootOf } from './workspace-handlers'

type FileOpsChannels = keyof FileOpsInvokeContract

const assertKind = (kind: unknown): EntryKind => {
  if (kind !== 'file' && kind !== 'directory') throw new Error('Ожидалось file или directory')

  return kind
}

const assertMove = (move: unknown): FileMove => {
  const { from, to } = (typeof move === 'object' && move !== null ? move : {}) as Partial<FileMove>

  assertString(from, 'move.from')
  assertString(to, 'move.to')

  return { from, to }
}

const assertFlag = (value: unknown, name: string): boolean => {
  if (typeof value !== 'boolean') throw new Error(`Ожидалось да или нет в поле ${name}`)

  return value
}

/**
 * Каналы действий с файлами из дерева: проект - только открытый, поля - строки. Пути внутри
 * проекта проверяет сам модуль (resolveInsideRoot): там же, где по ним ходят.
 */
export const createFileOpsHandlers = (
  workspace: WorkspaceService,
  files: FileOpsService,
): Pick<InvokeHandlers, FileOpsChannels> => ({
  'files:create': ({ projectId, parent, name, kind }) => {
    assertString(parent, 'parent')
    assertString(name, 'name')

    return files.create(projectRootOf(workspace, projectId), parent, name, assertKind(kind))
  },
  'files:references': ({ projectId, move }) =>
    files.references(projectRootOf(workspace, projectId), assertMove(move)),
  'files:move': ({ projectId, move, updateReferences }) =>
    files.move(
      projectRootOf(workspace, projectId),
      assertMove(move),
      assertFlag(updateReferences, 'updateReferences'),
    ),
  'files:copy': ({ projectId, from, toDirectory }) => {
    assertString(from, 'from')
    assertString(toDirectory, 'toDirectory')

    return files.copy(projectRootOf(workspace, projectId), from, toDirectory)
  },
  'files:trash': ({ projectId, path }) => {
    assertString(path, 'path')

    return files.trash(projectRootOf(workspace, projectId), path)
  },
})
