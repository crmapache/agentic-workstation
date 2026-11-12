import { useEffect } from 'react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type { editor } from 'monaco-editor/editor/editor.api.js'

import { showWhenCompared } from '../diff-reveal'
import { documents } from '../documents'
import { useDiffBehavior } from '../monaco-diff.hooks'
import { monaco } from '../monaco-setup'
import { clockLabel, weekdayDayLabel } from '../../../lib/dates.utils'
import { languageOfPath } from '../../../lib/syntax-languages.utils'
import type { HistoryDiffState } from './LocalHistoryView.types'
import { dayName } from './LocalHistoryView.utils'

type Diff = editor.IStandaloneDiffEditor

/** Подписи времени истории: «Today», «Yesterday» или «Tue, Nov 10»; с часами - для итога. */
export const useWhenLabels = () => {
  const { t } = useTranslation()

  const day = (at: number) => {
    const name = dayName(at, Date.now())

    return name ? t(`localHistory.${name}`) : weekdayDayLabel(at)
  }

  return { day, when: (at: number) => `${day(at)}, ${clockLabel(at)}` }
}

/**
 * Пара моделей разницы истории: слева - текст версии, справа - текст другой версии или
 * документ файла сейчас (тот же, что в редакторе: правка в нём - правка файла). Документ
 * держится, пока справа файл, - и в истории папки, где вкладки у файла нет. Пара создаётся
 * заново на каждую строку и способ сравнения.
 */
const useHistoryModels = (
  diffRef: RefObject<Diff | null>,
  { projectId, path, usesFile, state }: HistoryModelsInput,
) => {
  const ready = state.kind === 'ready' ? state : null
  const original = ready?.original ?? null
  const text = ready?.modified.kind === 'text' ? ready.modified.text : null
  const usesDocument = ready?.modified.kind === 'document'

  useEffect(
    () => (usesFile ? documents.hold(projectId, path) : undefined),
    [projectId, path, usesFile],
  )

  useEffect(() => {
    const diff = diffRef.current
    const document = usesDocument ? documents.find(projectId, path) : undefined

    if (!diff || original === null || (text === null && !document?.model)) return

    const language = languageOfPath(path) ?? 'plaintext'
    const left = monaco.editor.createModel(original, language)
    const right = document?.model ?? monaco.editor.createModel(text ?? '', language)
    const reveal = showWhenCompared(diff, diff.getContainerDomNode())

    diff.setModel({ original: left, modified: right })

    return () => {
      reveal.dispose()
      if (diff.getModel()?.original === left) diff.setModel(null)

      left.dispose()
      if (right !== document?.model) right.dispose()
    }
  }, [diffRef, projectId, path, original, text, usesDocument])
}

type HistoryModelsInput = {
  projectId: string
  path: string
  /** Справа - файл сейчас: его документ держится, пока он показан. */
  usesFile: boolean
  state: HistoryDiffState
}

/**
 * Разница локальной истории на Monaco - то же поведение, что у разницы с коммитом (вид,
 * переходы, F7, ⌘Z слева, клавиатура по просьбе вкладки), со своими моделями сторон.
 * Справа правится только файл сейчас, и только если его можно писать.
 */
export const useHistoryDiff = ({
  isActive,
  ...input
}: HistoryModelsInput & { isActive: boolean }) => {
  const diff = useDiffBehavior({
    isActive,
    readOnly: input.state.kind !== 'ready' || input.state.readOnly,
  })

  useHistoryModels(diff.diffRef, input)

  return diff
}
