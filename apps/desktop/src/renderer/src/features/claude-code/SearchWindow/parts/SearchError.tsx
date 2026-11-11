import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import styles from '../SearchWindow.module.scss'
import type { SearchErrorProps } from '../SearchWindow.types'

/**
 * Полоса над списком, когда поиск упал: метка словом (FAILED), рядом - фраза, иногда
 * словами самого CLI (вход, лимит), и повтор.
 */
export const SearchError = ({ text, onRetry }: SearchErrorProps) => {
  const { t } = useTranslation()

  return (
    <div className={styles.error} role="alert">
      <span className={styles.errorLabel}>{t('claudeCode.search.failedLabel')}</span>
      <span className={styles.errorText}>{text}</span>
      <Button variant="ghost" size="sm" onClick={onRetry}>
        {t('claudeCode.search.retry')}
      </Button>
    </div>
  )
}
