import { useState } from 'react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

import { Button } from '@agentic-workstation/ui/Button'

import { COLLAPSE_AFTER, COLLAPSED_COUNT } from './ChangesList.constants'
import { useChangesList } from './ChangesList.hooks'
import styles from './ChangesList.module.scss'
import type { ChangesListProps } from './ChangesList.types'
import { turnTotals } from './ChangesList.utils'
import { ChangeRow } from './parts/ChangeRow'

/**
 * Файлы, которые поменял ход, - под ответом, перед итогом. Список из самих правок, а не
 * из того, что модель решила написать. Пока после хода ничего не написано, файлы с
 * точным диффом откатываются по одному и все разом и возвращаются той же кнопкой;
 * подвал - «Show all» слева, «Bring all back» и «Revert all» справа, обе могут стоять.
 * Над строками - весь ход разом (сколько файлов, плюс и минус), как в ACC: свёрнутый до
 * десяти строк список иначе не говорит, сколько поменялось.
 */
export const ChangesList = ({ turn }: ChangesListProps) => {
  const { t } = useTranslation()
  const list = useChangesList(turn)
  const [isUnfolded, setIsUnfolded] = useState(false)
  const { changes, revertable } = turn
  const isFoldable = changes.length > COLLAPSE_AFTER
  const shown = isFoldable && !isUnfolded ? changes.slice(0, COLLAPSED_COUNT) : changes
  const hasButtons = revertable && changes.some((change) => change.undoable)
  // Подвал стоит всегда, когда действовать есть над чем больше чем одним файлом: подвал,
  // который появляется и пропадает, двигал бы весь список на свою высоту.
  const hasFooter =
    isFoldable || (revertable && changes.filter((change) => change.undoable).length > 1)
  const totals = turnTotals(changes)

  return (
    <div className={styles.changesList}>
      {/* Шапка разложена строкой списка: её цифры стоят в столбце цифр строк. */}
      {changes.length > 1 && (
        <div className={clsx(styles.line, styles.head)}>
          <div
            className={styles.row}
            aria-label={t('claudeCode.changes.totals', totals)}
            role="group">
            <span className={styles.count}>
              {t('claudeCode.changes.files', { count: changes.length })}
            </span>
            <span className={styles.added}>{`+${totals.added}`}</span>
            <span className={styles.removed}>{`−${totals.removed}`}</span>
          </div>
          {hasButtons && <span className={styles.slot} />}
        </div>
      )}
      <ul aria-label={t('claudeCode.changes.label')} className={styles.rows}>
        {shown.map((change) => (
          <ChangeRow
            key={change.path}
            change={change}
            slot={hasButtons}
            actionable={revertable && change.undoable}
            press={list.presses.get(change.path)}
            onToggle={list.toggle}
          />
        ))}
      </ul>
      {hasFooter && (
        <div className={styles.footer}>
          {isFoldable && (
            <Button variant="ghost" size="sm" onClick={() => setIsUnfolded(!isUnfolded)}>
              {isUnfolded
                ? t('claudeCode.changes.showFewer')
                : t('claudeCode.changes.showAll', { count: changes.length })}
            </Button>
          )}
          <span className={styles.spacer} />
          {revertable && list.restoreCount > 1 && (
            <Button
              variant="ghost"
              size="sm"
              disabled={!list.canRestoreAll}
              onClick={list.restoreAll}>
              {t('claudeCode.changes.restoreAll')}
            </Button>
          )}
          {revertable && list.revertCount > 1 && (
            <Button
              variant="ghost"
              size="sm"
              disabled={!list.canRevertAll}
              onClick={list.revertAll}>
              {t('claudeCode.changes.revertAll')}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
