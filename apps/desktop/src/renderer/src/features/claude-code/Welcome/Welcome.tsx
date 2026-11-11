import { Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@agentic-workstation/ui/EmptyState'

import styles from './Welcome.module.scss'

/**
 * Пустой разговор, как пустая лента ACC: «Ask Claude about this project» и «@ for files ·
 * / for commands». Больше ничего: идеи и клавиши поля под ним только отвлекали от поля.
 */
export const Welcome = () => {
  const { t } = useTranslation()

  return (
    <div className={styles.welcome}>
      <EmptyState
        icon={Sparkles}
        title={t('claudeCode.welcome.title')}
        description={t('claudeCode.welcome.text')}
      />
    </div>
  )
}
