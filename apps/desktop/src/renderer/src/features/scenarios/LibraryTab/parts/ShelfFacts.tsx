import { useTranslation } from 'react-i18next'

import styles from '../LibraryTab.module.scss'
import type { ShelfFactsProps } from '../LibraryTab.types'

/**
 * Вторая строка сценария: сколько этапов и карточек, цикл, «по пункту», о чём спросит перед
 * стартом. Сломанный вместо этого говорит, что его надо чинить и сколько бед: запуск всё равно
 * откажет, а что не так, скажет редактор.
 */
export const ShelfFacts = ({ facts }: ShelfFactsProps) => {
  const { t } = useTranslation()

  if (facts.broken)
    return (
      <span className={styles.facts}>
        <span className={styles.broken}>{t('scenarios.library.broken')}</span>
        <span className={styles.broken}>
          {t('scenarios.library.problems', { count: facts.problems })}
        </span>
      </span>
    )

  return (
    <span className={styles.facts}>
      <span className={styles.fact}>{t('scenarios.library.stages', { count: facts.stages })}</span>
      <span className={styles.fact}>{t('scenarios.library.cards', { count: facts.cards })}</span>
      {facts.hasLoop && <span className={styles.chip}>{t('scenarios.library.hasLoop')}</span>}
      {facts.perItem && <span className={styles.chip}>{t('scenarios.library.perItem')}</span>}
      {facts.asks.length > 0 && (
        <span className={styles.chip}>
          {t('scenarios.library.asksFor', { names: facts.asks.join(', ') })}
        </span>
      )}
    </span>
  )
}
