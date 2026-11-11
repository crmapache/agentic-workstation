import { useRef, useEffect } from 'react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type { editor } from 'monaco-editor/editor/editor.api.js'

import { showWhenCompared } from '../diff-reveal'
import { putText } from '../document-model'
import { documents } from '../documents'
import { DIFF_ACTIONS } from '../editor.constants'
import { useDiffBehavior } from '../monaco-diff.hooks'
import { monaco } from '../monaco-setup'
import { languageOfPath } from '../../../lib/syntax-languages.utils'
import { useSelectionStore } from '../../../state/selection.store'
import type { DiffState, DiffActions } from './DiffEditor.types'

type Diff = editor.IStandaloneDiffEditor

/**
 * Пара моделей в разнице: слева - текст из коммита, справа - документ файла или пустота у
 * удалённого. Документ запрашивается сразу, пока коммит ещё читается; держит его вкладка
 * разницы. Пара создаётся на файл: новый текст коммита того же файла (коммит в терминале)
 * встаёт в левую модель, и разница пересчитывается на месте, как при наборе справа.
 */
const useDiffModels = (
  diffRef: RefObject<Diff | null>,
  { projectId, path, needsDocument, state }: DiffModelsInput,
) => {
  const original = state.kind === 'ready' ? state.original : null
  const modified = state.kind === 'ready' ? state.modified : null
  const originalText = useRef(original)
  const originalModel = useRef<editor.ITextModel | null>(null)

  useEffect(() => {
    if (needsDocument) documents.get(projectId, path)
  }, [projectId, path, needsDocument])

  // Только середина, а не весь текст: целиком Monaco потерял бы метки свёрнутого и развернул
  // файл; так он сдвигает их с текстом, и что было на виду, на виду и остаётся.
  useEffect(() => {
    originalText.current = original
    if (original !== null && originalModel.current) putText(originalModel.current, original)
  }, [original])

  useEffect(() => {
    const diff = diffRef.current
    const text = originalText.current

    if (!diff || text === null || modified === null) return

    const language = languageOfPath(path) ?? 'plaintext'
    const document = modified === 'document' ? documents.find(projectId, path) : undefined
    const left = monaco.editor.createModel(text, language)
    const right = document?.model ?? monaco.editor.createModel('', language)
    const reveal = showWhenCompared(diff, diff.getContainerDomNode())

    diff.setModel({ original: left, modified: right })
    originalModel.current = left

    return () => {
      reveal.dispose()
      originalModel.current = null
      // Разницу уже убрали вместе с компонентом - она отпустила пару сама.
      if (diff.getModel()?.original === left) diff.setModel(null)

      left.dispose()
      if (right !== document?.model) right.dispose()
    }
  }, [diffRef, projectId, path, modified])
}

type DiffModelsInput = { projectId: string; path: string; needsDocument: boolean; state: DiffState }

/**
 * Переходы по правкам (из общего поведения разницы) и к самому файлу - кнопкой панели и
 * клавишей WebStorm F4 с любой стороны. Файл открывается на строке, где стоит курсор справа.
 */
const useDiffActions = (
  { originalRef, modifiedRef, goTo }: ReturnType<typeof useDiffBehavior>,
  { projectId, path, canOpen }: { projectId: string; path: string; canOpen: boolean },
): DiffActions => {
  const { t } = useTranslation()
  const selectFile = useSelectionStore((state) => state.selectFile)

  const actions: DiffActions = {
    previousChange: () => goTo('previous'),
    nextChange: () => goTo('next'),
    openFile: canOpen
      ? () => {
          const line = modifiedRef.current?.getPosition()?.lineNumber

          selectFile(projectId, path, line === undefined ? undefined : { line })
        }
      : null,
  }
  const latest = useRef(actions)

  useEffect(() => {
    latest.current = actions
  })

  useEffect(() => {
    const registrations = [originalRef.current, modifiedRef.current].flatMap((instance) =>
      instance
        ? [
            instance.addAction({
              id: DIFF_ACTIONS.openFile,
              label: t('editor.diff.openFile'),
              keybindings: [monaco.KeyCode.F4],
              run: () => latest.current.openFile?.(),
            }),
          ]
        : [],
    )

    return () => {
      for (const registration of registrations) registration.dispose()
    }
  }, [originalRef, modifiedRef, t])

  return actions
}

/**
 * Разница файла с последним коммитом на Monaco: общее поведение разницы, модели сторон и
 * переход к самому файлу.
 */
export const useDiffEditor = ({
  projectId,
  path,
  isActive,
  needsDocument,
  state,
  canOpen,
}: DiffModelsInput & { isActive: boolean; canOpen: boolean }) => {
  const diff = useDiffBehavior({ isActive, readOnly: state.kind === 'ready' && state.readOnly })

  useDiffModels(diff.diffRef, { projectId, path, needsDocument, state })

  const actions = useDiffActions(diff, { projectId, path, canOpen })

  return { ...diff, actions }
}
