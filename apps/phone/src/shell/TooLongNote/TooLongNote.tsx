import { useTranslation } from 'react-i18next'

import styles from './TooLongNote.module.scss'

/**
 * Вопрос пришёл урезанным (truncated) или карточкой: одобрить то, чего не видно целиком, телефон
 * не даёт - только отказ, а решить по-настоящему - за Mac.
 */
export const TooLongNote = () => {
  const { t } = useTranslation()

  return (
    <p role="note" className={styles.note}>
      {t('pending.tooLong')}
    </p>
  )
}
