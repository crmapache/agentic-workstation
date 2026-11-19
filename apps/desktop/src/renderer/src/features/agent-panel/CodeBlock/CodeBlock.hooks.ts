import { useMemo } from 'react'

import { useKnownFiles } from '../paths.hooks'
import { useHighlightedLines } from '../../../lib/highlighter.hooks'
import styles from './CodeBlock.module.scss'
import type { CodeRun } from './CodeBlock.types'
import { plainRuns, findCodePaths, highlightedRuns } from './CodeBlock.utils'

/**
 * Код к отрисовке по строкам: строки подсветки, разрезанные по путям к файлам, - путь в
 * блоке кода открывается так же, как в тексте. Пока подсветки нет (или язык неизвестен),
 * весь код - одна «строка» ровного цвета, тоже с путями.
 */
export const useCodeRuns = (code: string, language: string): CodeRun[][] => {
  const known = useKnownFiles()
  const lines = useHighlightedLines(code, language)
  const paths = useMemo(() => findCodePaths(code, known), [code, known])

  return useMemo(
    () => (lines ? highlightedRuns(lines, paths, styles) : [plainRuns(code, paths)]),
    [code, lines, paths],
  )
}
