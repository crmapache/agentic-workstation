import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { IconButton } from '@agentic-workstation/ui/IconButton'

import styles from '../SearchWindow.module.scss'
import type { AskFieldProps } from '../SearchWindow.types'
import { keepFocus } from '../SearchWindow.utils'
import { SteadyWord } from './SteadyWord'

/**
 * Вкладка «Ask Claude»: описание словами (растёт от двух строк до шести), явная кнопка
 * Find и под полем - что она делает и во что обходится. Find и Cancel - одно нажатие в
 * двух состояниях и одной ширины: невидимое второе слово держит место.
 */
export const AskField = ({
  areaRef,
  query,
  isRunning,
  onQuery,
  onRun,
  onCancel,
}: AskFieldProps) => {
  const { t } = useTranslation()
  const find = t('claudeCode.search.find')
  const cancel = t('claudeCode.search.cancel')

  const handleClear = () => {
    onQuery('')
    areaRef.current?.focus()
  }

  return (
    <div className={styles.ask}>
      <div className={styles.askField}>
        <textarea
          ref={areaRef}
          className={styles.area}
          value={query}
          placeholder={t('claudeCode.search.aiPlaceholder')}
          aria-label={t('claudeCode.search.tabs.ai')}
          readOnly={isRunning}
          onChange={(event) => onQuery(event.target.value)}
        />
        <span className={styles.askTools}>
          {query && !isRunning && (
            <IconButton
              icon={X}
              size="sm"
              label={t('claudeCode.search.clear')}
              onMouseDown={keepFocus}
              onClick={handleClear}
            />
          )}
          {isRunning ? (
            <Button variant="secondary" size="sm" onClick={onCancel}>
              <SteadyWord word={cancel} other={find} />
            </Button>
          ) : (
            <Button variant="primary" size="sm" disabled={!query.trim()} onClick={onRun}>
              <SteadyWord word={find} other={cancel} />
            </Button>
          )}
        </span>
      </div>
      {!isRunning && <span className={styles.askNote}>{t('claudeCode.search.aiNote')}</span>}
    </div>
  )
}
