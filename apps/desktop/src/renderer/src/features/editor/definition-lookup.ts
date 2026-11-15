import type { editor } from 'monaco-editor/editor/editor.api.js'

import type { DefinitionAnswer, DefinitionTarget } from '@shared/definitions'

import { invoke } from '../../lib/ipc'
import { useSelectionStore } from '../../state/selection.store'
import { fileRequest } from './documents.utils'

/** Чей текст в редакторе: проект и файл (путь от корня или абсолютный, вне проекта). */
export type DefinitionOwner = { projectId: string; path: string }

const NONE: DefinitionAnswer = { kind: 'none' }

/** Версия текста для главного процесса: модель (у каждого открытия файла своя) и её правка. */
export const textVersion = (model: editor.ITextModel): string =>
  `${model.id}:${model.getVersionId()}`

/** Версия, текст которой главный процесс уже получил: второй раз он не едет. */
let sentVersion: string | null = null

const ask = (request: Parameters<typeof invoke<'editor:definition'>>[1]) =>
  invoke('editor:definition', request).catch(() => NONE)

/**
 * Где определено имя, которое начинается на offset (ADR 0061). Текст файла едет один раз на
 * версию: дальше главный процесс помнит его сам, а забыл (процесс определений завершён после
 * простоя) - отвечает needText, и текст едет снова.
 */
export const askDefinition = async (
  owner: DefinitionOwner,
  model: editor.ITextModel,
  offset: number,
): Promise<DefinitionAnswer> => {
  const version = textVersion(model)
  const request = { ...fileRequest(owner.projectId, owner.path), offset, version }
  const withText = () => {
    sentVersion = version

    return ask({ ...request, text: model.getValue() })
  }
  const first = await (sentVersion === version ? ask(request) : withText())

  if (first.kind !== 'needText') return first

  const second = await withText()

  return second.kind === 'needText' ? NONE : second
}

/**
 * Перейти к определению, как в WebStorm: другой файл открывается вкладкой, а в том же файле
 * каретка просто встаёт к имени. Место ставит редактор файла (CodeEditor), как для ссылок из
 * поиска и ленты.
 */
export const goToDefinition = (owner: DefinitionOwner, target: DefinitionTarget) =>
  useSelectionStore
    .getState()
    .selectFile(owner.projectId, target.path, { line: target.line, column: target.column })
