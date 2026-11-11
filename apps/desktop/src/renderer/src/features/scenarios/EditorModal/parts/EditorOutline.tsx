import clsx from 'clsx'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { GLYPH_SIZE, ICON_STROKE_WIDTH } from '../EditorModal.constants'
import styles from '../EditorModal.module.scss'
import type { EditorOutlineProps } from '../EditorModal.types'
import { OutlineProblems } from './OutlineProblems'
import { OutlineStage } from './OutlineStage'

/**
 * Оглавление слева - карта сценария: его части, этапы с карточками и находки внизу. Справа
 * открыто только то, что в нём выбрано: один столбец со всем сразу был километром полей,
 * чтобы поправить фразу в третьем этапе.
 */
export const EditorOutline = ({ draft, at, problems, onPlace, onAddStage }: EditorOutlineProps) => {
  const { t } = useTranslation()

  return (
    <nav aria-label={t('scenarios.editor.outline.label')} className={styles.outline}>
      <span className={styles.outlineLabel}>{t('scenarios.editor.outline.scenario')}</span>
      <button
        type="button"
        aria-current={at.part === 'name' || undefined}
        className={clsx(styles.outlineRow, at.part === 'name' && styles.selected)}
        onClick={() => onPlace({ part: 'name' })}>
        {t('scenarios.editor.outline.nameAndShelf')}
      </button>
      <button
        type="button"
        aria-current={at.part === 'head' || undefined}
        className={clsx(styles.outlineRow, at.part === 'head' && styles.selected)}
        onClick={() => onPlace({ part: 'head' })}>
        {t('scenarios.editor.outline.head')}
      </button>
      <button
        type="button"
        aria-current={at.part === 'inputs' || undefined}
        className={clsx(styles.outlineRow, at.part === 'inputs' && styles.selected)}
        onClick={() => onPlace({ part: 'inputs' })}>
        <span className={styles.outlineText}>{t('scenarios.editor.outline.inputs')}</span>
        <span className={styles.outlineCount}>{draft.inputs.length}</span>
      </button>
      <span className={styles.outlineLabel}>{t('scenarios.editor.outline.stages')}</span>
      {draft.stages.map((stage, index) => (
        <OutlineStage key={stage.id} stage={stage} number={index + 1} at={at} onPlace={onPlace} />
      ))}
      <button
        type="button"
        className={clsx(styles.addDashed, styles.outlineAdd)}
        onClick={onAddStage}>
        <Plus size={GLYPH_SIZE} strokeWidth={ICON_STROKE_WIDTH} aria-hidden />
        {t('scenarios.editor.outline.addStage')}
      </button>
      <OutlineProblems draft={draft} problems={problems} onPlace={onPlace} />
    </nav>
  )
}
