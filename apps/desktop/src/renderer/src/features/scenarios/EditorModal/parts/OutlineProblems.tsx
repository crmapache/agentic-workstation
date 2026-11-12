import clsx from 'clsx'
import { CircleAlert, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { isBlocking } from '@shared/scenario-rules'

import { ICON_STROKE_WIDTH, PROBLEM_ICON_SIZE } from '../EditorModal.constants'
import styles from '../EditorModal.module.scss'
import type { OutlineProblemsProps } from '../EditorModal.types'
import { problemWords } from '../EditorModal.utils'
import { placeOfProblem } from '../../scenarios-editor.utils'

/**
 * Что с сценарием не так - внизу оглавления, а не абзацем над формой: каждая находка называет
 * карточку или этап, и до них один клик в той же колонке. Мешающие запуску - красным,
 * неаккуратность (слот или пункт, который никто не пишет) - жёлтым: сценарий с ней идёт.
 */
export const OutlineProblems = ({ draft, problems, onPlace }: OutlineProblemsProps) => {
  const { t } = useTranslation()
  const isBroken = problems.some(isBlocking)

  if (problems.length === 0) return null

  return (
    <div className={styles.problems}>
      <span
        className={clsx(styles.outlineLabel, isBroken ? styles.problemsBad : styles.problemsSoft)}>
        {isBroken ? t('scenarios.editor.outline.problems') : t('scenarios.editor.outline.warnings')}
      </span>
      {problems.map((problem, index) => {
        const isBad = isBlocking(problem)
        const Icon = isBad ? CircleAlert : TriangleAlert

        return (
          <button
            key={`${problem.kind}:${problem.cardId ?? problem.stageId ?? ''}:${problem.name ?? ''}:${index}`}
            type="button"
            className={styles.problem}
            onClick={() => onPlace(placeOfProblem(draft, problem))}>
            <Icon
              className={clsx(
                styles.problemIcon,
                isBad ? styles.problemIconBad : styles.problemIconSoft,
              )}
              size={PROBLEM_ICON_SIZE}
              strokeWidth={ICON_STROKE_WIDTH}
              aria-hidden
            />
            {problemWords(t, draft, problem)}
          </button>
        )
      })}
    </div>
  )
}
