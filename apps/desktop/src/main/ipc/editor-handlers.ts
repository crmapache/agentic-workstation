import { app } from 'electron'

import type { EditorInvokeContract } from '@shared/ipc/editor.contract'

import { readImageFile } from '../fs/image-file'
import { readTextFile, readOutsideTextFile } from '../fs/text-file'
import { writeTextFile, writeOutsideTextFile } from '../fs/text-write'
import type { LocalHistory } from '../history/local-history'
import { readWebImage } from '../preview/web-image'
import { fetchWebImage } from '../preview/web-image-session'
import { editorSaved, allowUnsavedQuit } from '../window/editor-save'
import type { WorkspaceService } from '../workspace/workspace-service'
import type { InvokeHandlers } from './handle'
import { assertString } from './validate'
import { projectRootOf } from './workspace-handlers'

type EditorChannels = keyof EditorInvokeContract

const assertBoolean = (value: unknown, name: string): boolean => {
  if (typeof value !== 'boolean') throw new Error(`Ожидалось да или нет в поле ${name}`)

  return value
}

const versionOrNull = (value: unknown, name: string): string | null => {
  if (value === null || value === undefined) return null

  assertString(value, name)

  return value
}

/**
 * Чей файл просит окно: проекта (путь от корня) или вне проекта (абсолютный путь). Ровно
 * одно из двух; проект - только открытый, и у файла вне проекта тоже.
 */
const fileTarget = (
  workspace: WorkspaceService,
  {
    projectId,
    relativePath,
    absolutePath,
  }: Partial<Record<'projectId' | 'relativePath' | 'absolutePath', unknown>>,
): { rootPath: string; relativePath: string } | { absolutePath: string } => {
  const rootPath = projectRootOf(workspace, projectId)

  if (absolutePath !== undefined && relativePath !== undefined) {
    throw new Error('Ожидался один путь: от корня или абсолютный')
  }

  if (absolutePath !== undefined) {
    assertString(absolutePath, 'absolutePath')

    return { absolutePath }
  }

  assertString(relativePath, 'relativePath')

  return { rootPath, relativePath }
}

/**
 * Каналы редактора: проект - только открытый, поля - нужного типа, дальше - main/fs. Файлы
 * проекта видит локальная история (ADR 0045): открытый файл она запоминает как есть, а
 * сохранение - своей правкой, а не «извне».
 */
export const createEditorHandlers = (
  workspace: WorkspaceService,
  history: LocalHistory,
): Pick<InvokeHandlers, EditorChannels> => ({
  'fs:readFile': async (request) => {
    const target = fileTarget(workspace, request)
    const known = versionOrNull(request.known, 'known')

    if ('absolutePath' in target) return readOutsideTextFile(target.absolutePath, known)

    const read = await readTextFile(target.rootPath, target.relativePath, known)

    if (read.kind !== 'missing' && read.kind !== 'unchanged') {
      history.opened(target.rootPath, target.relativePath)
    }

    return read
  },
  'fs:writeFile': async (request) => {
    const target = fileTarget(workspace, request)
    const { text, bom, expected, base, outside } = request

    assertString(text, 'text')

    const write = {
      text,
      bom: assertBoolean(bom, 'bom'),
      expected: versionOrNull(expected, 'expected'),
      base: versionOrNull(base, 'base'),
      outside: outside === undefined ? false : assertBoolean(outside, 'outside'),
    }

    if ('absolutePath' in target) return writeOutsideTextFile(target.absolutePath, write)

    const { rootPath, relativePath } = target
    const tracked = await history.beforeWrite(rootPath, relativePath, 'edit')
    const written = await writeTextFile(rootPath, relativePath, write)

    if (written.kind === 'saved' && tracked !== null) {
      void history.settle(rootPath, [tracked], 'edit')
    }

    return written
  },
  'fs:readImage': ({ projectId, relativePath, known }) => {
    assertString(relativePath, 'relativePath')

    return readImageFile(
      projectRootOf(workspace, projectId),
      relativePath,
      versionOrNull(known, 'known'),
    )
  },
  'preview:readWebImage': ({ url }) => {
    assertString(url, 'url')

    return readWebImage(url, fetchWebImage)
  },
  'editor:savedAll': ({ unsaved }) => {
    editorSaved(Number.isInteger(unsaved) && unsaved > 0 ? unsaved : 0)
  },
  'editor:allowQuit': ({ quit }) => {
    allowUnsavedQuit()

    if (assertBoolean(quit, 'quit')) app.quit()
  },
})
