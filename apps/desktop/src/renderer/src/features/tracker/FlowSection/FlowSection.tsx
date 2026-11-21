import { useState } from 'react'
import { clsx } from 'clsx'
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import { useTrackerActions } from '../tracker.actions'
import { useTrackerStore } from '../tracker.store'
import { ActionsMenu } from '../ActionsMenu/ActionsMenu'
import type { ActionItem } from '../ActionsMenu/ActionsMenu.types'
import { useBoard } from '../Board/Board.context'
import { GroupColumn } from '../GroupColumn/GroupColumn'
import { QuickAdd } from '../QuickAdd/QuickAdd'
import styles from './FlowSection.module.scss'
import type { FlowSectionProps } from './FlowSection.types'

/**
 * Поток - шапка во всю ширину и ряд групп под ней, который листается вбок. Нажатие на шапку
 * сворачивает и разворачивает поток (это помнится между запусками), за неё же поток тянут.
 */
export const FlowSection = ({ flow, projectId }: FlowSectionProps) => {
  const { t } = useTranslation()
  const { press, draggingId, moveBy } = useBoard()
  const { apply } = useTrackerActions()
  const collapsed = useTrackerStore((state) => state.collapsed[flow.id] === true)
  const toggleFlow = useTrackerStore((state) => state.toggleFlow)
  const edit = useTrackerStore((state) => state.edit)
  const [adding, setAdding] = useState(false)
  const source = { kind: 'flow' as const, id: flow.id }
  const tasks = flow.groups.reduce(
    (sum, group) => sum + group.tasks.reduce((cards, task) => cards + 1 + task.followUps.length, 0),
    0,
  )
  const items: ActionItem[] = [
    {
      key: 'edit',
      icon: Pencil,
      label: t('tracker.flow.edit'),
      onSelect: () => edit({ kind: 'flow', id: flow.id, projectId }),
    },
    {
      key: 'up',
      icon: ArrowUp,
      label: t('tracker.flow.moveUp'),
      onSelect: () => moveBy(source, -1),
    },
    {
      key: 'down',
      icon: ArrowDown,
      label: t('tracker.flow.moveDown'),
      onSelect: () => moveBy(source, 1),
    },
    {
      key: 'delete',
      icon: Trash2,
      label: t('tracker.flow.delete'),
      danger: true,
      onSelect: () => void apply({ kind: 'flow.delete', id: flow.id }),
    },
  ]

  const handleAddGroup = async (title: string) => {
    const { ok } = await apply({ kind: 'group.create', flowId: flow.id, title })

    if (ok) setAdding(false)

    return ok
  }

  return (
    <section
      className={clsx(styles.flow, draggingId === flow.id && styles.dragging)}
      data-flow={flow.id}
      aria-label={flow.title}>
      <header className={styles.header} onMouseDown={(event) => press(event, source)}>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={!collapsed}
          aria-label={
            collapsed
              ? t('tracker.flow.expand', { title: flow.title })
              : t('tracker.flow.collapse', { title: flow.title })
          }
          onClick={() => toggleFlow(flow.id)}>
          <ChevronRight className={clsx(styles.chevron, !collapsed && styles.open)} aria-hidden />
          <span className={styles.titles}>
            <span className={styles.title}>{flow.title}</span>
            {flow.subtitle && <span className={styles.subtitle}>{flow.subtitle}</span>}
          </span>
          <span className={styles.count}>
            {t('tracker.flow.summary', {
              groups: t('tracker.flow.groups', { count: flow.groups.length }),
              tasks: t('tracker.flow.tasks', { count: tasks }),
            })}
          </span>
        </button>
        <span className={styles.tools} onMouseDown={(event) => event.stopPropagation()}>
          <ActionsMenu label={t('tracker.flow.menu')} items={items} />
        </span>
      </header>
      {!collapsed && (
        <div className={styles.groups} data-flow-row={flow.id}>
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
      )}
    </section>
  )
}
