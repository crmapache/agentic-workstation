import clsx from 'clsx'
import { X, Search, WholeWord, CaseSensitive } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Spinner } from '@agentic-workstation/ui/Spinner'

import styles from '../SearchWindow.module.scss'
import type { SearchFieldProps } from '../SearchWindow.types'
import { keepFocus } from '../SearchWindow.utils'
import { SEARCH_KEYS, SEARCH_ICON_SIZE, SEARCH_ICON_STROKE } from '../../search.constants'

/**
 * Поле набранного запроса: лупа, текст, кольцо запроса в пути, крестик (пока есть что
 * стирать) и два переключателя Find in Files - регистр и целое слово. Переключатели стоят
 * в конце, крестик и кольцо их не двигают.
 */
export const SearchField = ({
  inputRef,
  query,
  isLoading,
  matchCase,
  wholeWords,
  onQuery,
  onMatchCase,
  onWholeWords,
}: SearchFieldProps) => {
  const { t } = useTranslation()

  const handleClear = () => {
    onQuery('')
    inputRef.current?.focus()
  }

  return (
    <div className={clsx(styles.field, query.trim() && styles.fieldLive)}>
      <Search
        className={styles.fieldIcon}
        size={SEARCH_ICON_SIZE}
        strokeWidth={SEARCH_ICON_STROKE}
        aria-hidden
      />
      <input
        ref={inputRef}
        className={styles.input}
        value={query}
        placeholder={t('claudeCode.search.placeholder')}
        aria-label={t('claudeCode.search.title')}
        spellCheck={false}
        onChange={(event) => onQuery(event.target.value)}
      />
      <span className={styles.fieldTools}>
        {isLoading && <Spinner tone="neutral" />}
        {query && (
          <IconButton
            icon={X}
            size="sm"
            label={t('claudeCode.search.clear')}
            onMouseDown={keepFocus}
            onClick={handleClear}
          />
        )}
        <IconButton
          icon={CaseSensitive}
          size="sm"
          label={t('claudeCode.search.withKey', {
            label: t('claudeCode.search.matchCase'),
            keys: SEARCH_KEYS.matchCase.join(''),
          })}
          active={matchCase}
          onMouseDown={keepFocus}
          onClick={onMatchCase}
        />
        <IconButton
          icon={WholeWord}
          size="sm"
          label={t('claudeCode.search.withKey', {
            label: t('claudeCode.search.wholeWords'),
            keys: SEARCH_KEYS.wholeWords.join(''),
          })}
          active={wholeWords}
          onMouseDown={keepFocus}
          onClick={onWholeWords}
        />
      </span>
    </div>
  )
}
