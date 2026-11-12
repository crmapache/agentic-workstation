import { ArrowUp, ArrowDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import { shortcutLabel } from '../../../lib/keys'
import styles from './DiffSteps.module.scss'
import type { DiffStepsProps } from './DiffSteps.types'

/** К предыдущей и следующей правке разницы - кнопками, с подсказкой клавиш WebStorm (F7). */
export const DiffSteps = ({ hasChanges, onPrevious, onNext }: DiffStepsProps) => {
  const { t } = useTranslation()

  return (
    <span className={styles.diffSteps}>
      <IconButton
        icon={ArrowUp}
        size="sm"
        label={`${t('editor.diff.previousChange')} (${shortcutLabel('⇧F7')})`}
        disabled={!hasChanges}
        onClick={onPrevious}
      />
      <IconButton
        icon={ArrowDown}
        size="sm"
        label={`${t('editor.diff.nextChange')} (F7)`}
        disabled={!hasChanges}
        onClick={onNext}
      />
    </span>
  )
}
