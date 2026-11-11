import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import { SHELF_WORDS } from '../LibraryTab.constants'
import styles from '../LibraryTab.module.scss'
import type { EmptyShelfProps } from '../LibraryTab.types'

/**
 * Пустая полка ростом со строку: что на ней нет ничего, и «New scenario» сразу на эту полку.
 * Полка, которая опустела (удалили последний, перенесли на соседнюю), не двигает то, что под ней.
 */
export const EmptyShelf = ({ scope, onCreate }: EmptyShelfProps) => {
  const { t } = useTranslation()

  return (
    <div className={styles.empty}>
      <span className={styles.emptyTitle}>{t(SHELF_WORDS[scope].empty)}</span>
      <Button size="sm" onClick={() => onCreate(scope)}>
        {t('scenarios.library.create')}
      </Button>
    </div>
  )
}
