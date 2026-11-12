import type { KeyboardEvent } from 'react'
import { Search, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'
import { Spinner } from '@agentic-workstation/ui/Spinner'
import { TextField } from '@agentic-workstation/ui/TextField'

import { MAX_QUERY_CHARS } from '../SearchScreen.constants'
import type { useSearchScreen } from '../SearchScreen.hooks'
import styles from '../SearchScreen.module.scss'
import { useNow } from '../../../../lib/now.hooks'
import { durationText } from '../../../../lib/time.utils'

/** Модель ищет: сколько уже и «отменить» - на месте кнопок поиска. */
const AiProgress = ({ screen }: { screen: ReturnType<typeof useSearchScreen> }) => {
  const { t } = useTranslation()
  const now = useNow(1000)

  return (
    <div className={styles.progress}>
      <Spinner size="sm" tone="accent" />
      <span className={styles.progressText}>
        {t('search.reading', { time: durationText(t, now - (screen.aiRun?.startedAt ?? now)) })}
      </span>
      <Button
        size="touch"
        variant="ghost"
        disabled={screen.isCancelling}
        onClick={screen.handleCancel}>
        {t('common.cancel')}
      </Button>
    </div>
  )
}

/**
 * Низ поиска под пальцем: поле и две дороги - найти набранные слова или попросить модель найти
 * по описанию. Enter в поле - поиск словами.
 */
export const SearchFooter = ({ screen }: { screen: ReturnType<typeof useSearchScreen> }) => {
  const { t } = useTranslation()

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return

    event.preventDefault()
    void screen.handleSearch()
  }

  return (
    <div className={styles.footer}>
      <TextField
        size="touch"
        label={t('search.field')}
        hideLabel
        placeholder={t('search.placeholder')}
        value={screen.query}
        maxLength={MAX_QUERY_CHARS}
        enterKeyHint="search"
        onKeyDown={handleKeyDown}
        onChange={screen.setQuery}
      />
      {screen.aiRun ? (
        <AiProgress screen={screen} />
      ) : (
        <div className={styles.buttons}>
          <Button
            size="touch"
            variant="primary"
            icon={Search}
            disabled={!screen.canSearch}
            onClick={() => void screen.handleSearch()}>
            {t('search.find')}
          </Button>
          <Button
            size="touch"
            icon={Sparkles}
            disabled={!screen.canSearch}
            onClick={() => void screen.handleAsk()}>
            {t('search.ask')}
          </Button>
        </div>
      )}
    </div>
  )
}
