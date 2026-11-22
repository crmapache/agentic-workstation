import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import { useRowScroll } from '../FlowSection.hooks'
import styles from '../FlowSection.module.scss'
import type { GroupsRowProps } from '../FlowSection.types'
import { rowStartOf } from '../FlowSection.utils'
import { useTrackerActions } from '../../tracker.actions'
import { GroupColumn } from '../../GroupColumn/GroupColumn'
import { QuickAdd } from '../../QuickAdd/QuickAdd'

/**
 * Ряд групп потока: колонки слева направо в порядке работы и «New group» в конце. Листается вбок
 * своей полосой у низа экрана; при открытии встаёт к первой колонке с невыполненным.
 */
export const GroupsRow = ({ flow }: GroupsRowProps) => {
  const { t } = useTranslation()
  const { apply } = useTrackerActions()
  const [adding, setAdding] = useState(false)
  const { row, track, bar, size, overflows, handleRowScroll, handleBarScroll } = useRowScroll(
    rowStartOf(flow),
  )

  const handleAddGroup = async (title: string) => {
    const { ok } = await apply({ kind: 'group.create', flowId: flow.id, title })

    if (ok) setAdding(false)

    return ok
  }

  return (
    <div className={styles.rowArea}>
      <div ref={row} className={styles.groups} data-flow-row={flow.id} onScroll={handleRowScroll}>
        <div ref={track} className={styles.track} data-flow-track="">
          {flow.groups.map((group) => (
            <GroupColumn key={group.id} group={group} flowId={flow.id} />
          ))}
          <div className={styles.rowEnd} data-row-end="">
            {adding ? (
              <QuickAdd
                placeholder={t('tracker.group.titlePlaceholder')}
                onAdd={handleAddGroup}
                onClose={() => setAdding(false)}
              />
            ) : (
              <Button variant="dashed" size="sm" icon={Plus} onClick={() => setAdding(true)}>
                {t('tracker.group.new')}
              </Button>
            )}
          </div>
        </div>
      </div>
      {overflows && (
        <div ref={bar} className={styles.bar} aria-hidden onScroll={handleBarScroll}>
          {/* eslint-disable-next-line no-restricted-syntax -- длина полосы - ширина ряда, меняется с колонками */}
          <div className={styles.barLength} style={{ width: size.content }} />
        </div>
      )}
    </div>
  )
}
