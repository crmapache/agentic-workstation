import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { GitChange } from '@shared/git'

import { useGroupExpansion } from '../ChangesView.hooks'
import styles from '../ChangesView.module.scss'
import type { ChangeListProps, ChangeMenuTarget } from '../ChangesView.types'
import { groupChanges } from '../ChangesView.utils'
import { ChangeGroup } from './ChangeGroup'
import { ChangeMenu } from './ChangeMenu'

/**
 * Непустой список изменений по группам, прокручивается под шапкой вида. Стоит, только пока
 * изменения есть: всё закоммитили - он уходит, а новые изменения раскладывает заново - что
 * помещается без прокрутки, раскрыто. Больше предела - строка о том, что список не весь.
 */
export const ChangeList = ({ projectId, changes }: ChangeListProps) => {
  const { t } = useTranslation()
  const [menu, setMenu] = useState<ChangeMenuTarget>(null)
  const groups = groupChanges(changes.files)
  const { listRef, expansion, toggle, forget } = useGroupExpansion(groups.map((group) => group.id))

  // Файл ушёл из списка, пока меню было открыто (откатили, закоммитили), - меню уходит с ним.
  const target = menu && changes.files.includes(menu.change) ? menu : null

  const handleMenu = (change: GitChange, anchor: HTMLElement) => setMenu({ change, anchor })

  const handleMenuClosed = () => setMenu(null)

  return (
    <div ref={listRef} className={styles.changes}>
      {groups.map((group) => (
        <ChangeGroup
          key={group.id}
          projectId={projectId}
          group={group}
          expanded={expansion[group.id]}
          onToggle={toggle}
          onGone={forget}
          onMenu={handleMenu}
        />
      ))}
      {changes.truncated && (
        <p className={styles.truncated}>
          {t('changes.truncated', { count: changes.files.length })}
        </p>
      )}
      <ChangeMenu projectId={projectId} target={target} onClose={handleMenuClosed} />
    </div>
  )
}
