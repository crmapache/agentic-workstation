import type { MouseEvent } from 'react'
import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'

import { SLASH_GLYPH, PAPERCLIP_GLYPH } from '../Composer.constants'
import styles from '../Composer.module.scss'
import type { WritingToolsProps } from '../Composer.types'
import { fitStepMark } from '../../composer-fit.hooks'
import type { FitStep } from '../../composer-fit.utils'

/** Нажатие кнопки не уводит фокус из поля: «/» встаёт в место каретки. */
const keepCaret = (event: MouseEvent) => event.preventDefault()

/**
 * Что делают с сообщением, в порядке ACC: группа вложений - скрепка (файлы, картинки,
 * папки) и «/», потом лупа - поиск по разговорам. На узкой панели ряд отдаёт «/» и лупу
 * (dropped); скрепка остаётся.
 */
export const WritingTools = ({
  canSlash,
  onAttach,
  onSlash,
  onSearch,
  dropped,
}: WritingToolsProps) => {
  const { t } = useTranslation()
  const isShown = (step: FitStep) => !dropped.has(step)

  return (
    <div className={styles.toolGroups}>
      <div className={styles.toolGroup}>
        <IconButton
          icon={PAPERCLIP_GLYPH}
          size="sm"
          label={t('claudeCode.composer.attach')}
          onClick={onAttach}
        />
        {isShown('slash') && (
          <IconButton
            {...fitStepMark('slash')}
            icon={SLASH_GLYPH}
            size="sm"
            label={t('claudeCode.composer.slash')}
            disabled={!canSlash}
            onMouseDown={keepCaret}
            onClick={onSlash}
          />
        )}
      </div>
      {isShown('search') && (
        <div className={styles.toolGroup}>
          <IconButton
            {...fitStepMark('search')}
            icon={Search}
            size="sm"
            label={t('claudeCode.search.button')}
            onClick={onSearch}
          />
        </div>
      )}
    </div>
  )
}
