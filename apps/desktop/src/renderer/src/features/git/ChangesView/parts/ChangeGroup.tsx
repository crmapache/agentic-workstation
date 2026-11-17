import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { Disclosure } from '@agentic-workstation/ui/Disclosure'

import { ROWS_MARK } from '../ChangesView.constants'
import styles from '../ChangesView.module.scss'
import type { ChangeGroupProps } from '../ChangesView.types'
import { groupMark } from '../ChangesView.utils'
import { ChangeRow } from './ChangeRow'

/**
 * Группа списка: шапка с числом файлов сворачивает её, как узел в окне Commit WebStorm.
 * Раскрыта ли она, решает список: при появлении - по месту, дальше - человек.
 */
export const ChangeGroup = ({
  projectId,
  group,
  expanded,
  onToggle,
  onGone,
  onMenu,
}: ChangeGroupProps) => {
  const { t } = useTranslation()
  const title = t(`changes.groups.${group.id}`)
  const isExpanded = expanded ?? true

  // Файлы группы закоммитили или откатили - группа уходит, и список забывает её раскрытие.
  useEffect(() => () => onGone(group.id), [onGone, group.id])

  return (
    <section aria-label={title} {...groupMark(group.id)}>
      {/* Шапка, раскрытая только ради замера, после решения ставится заново: иначе стрелка
          свёрнутой группы повернулась бы на глазах при открытии вида. */}
      <Disclosure
        key={expanded === undefined ? 'measuring' : 'settled'}
        expanded={isExpanded}
        onClick={() => onToggle(group.id)}>
        <span className={styles.groupTitle}>{title}</span>
        <span className={styles.count}>{t('changes.files', { count: group.files.length })}</span>
      </Disclosure>
      {isExpanded && (
        <ul className={styles.rows} {...ROWS_MARK}>
          {group.files.map((change) => (
            <ChangeRow key={change.path} projectId={projectId} change={change} onMenu={onMenu} />
          ))}
        </ul>
      )}
    </section>
  )
}
