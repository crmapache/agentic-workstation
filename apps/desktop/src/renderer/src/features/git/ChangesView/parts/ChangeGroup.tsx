import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Disclosure } from '@agentic-workstation/ui/Disclosure'

import styles from '../ChangesView.module.scss'
import type { ChangeGroupProps } from '../ChangesView.types'
import { ChangeRow } from './ChangeRow'

/** Группа списка: шапка с числом файлов сворачивает её, как узел в окне Commit WebStorm. */
export const ChangeGroup = ({ projectId, group, onMenu }: ChangeGroupProps) => {
  const { t } = useTranslation()
  const [isExpanded, setIsExpanded] = useState(true)
  const title = t(`changes.groups.${group.id}`)

  return (
    <section aria-label={title}>
      <Disclosure expanded={isExpanded} onClick={() => setIsExpanded(!isExpanded)}>
        <span className={styles.groupTitle}>{title}</span>
        <span className={styles.count}>{t('changes.files', { count: group.files.length })}</span>
      </Disclosure>
      {isExpanded && (
        <ul className={styles.rows}>
          {group.files.map((change) => (
            <ChangeRow key={change.path} projectId={projectId} change={change} onMenu={onMenu} />
          ))}
        </ul>
      )}
    </section>
  )
}
