import type { MouseEvent } from 'react'
import clsx from 'clsx'

import { OWN_PRESS } from '../LibraryTab.constants'
import styles from '../LibraryTab.module.scss'
import type { ShelfRowProps } from '../LibraryTab.types'
import { schedulesOf } from '../../scenarios-hours.utils'
import { factsOf } from '../../scenarios-shelves-facts.utils'
import { idOfRow } from '../../scenarios-shelves.utils'
import { ShelfFacts } from './ShelfFacts'
import { ShelfGrip } from './ShelfGrip'
import { ShelfHours } from './ShelfHours'
import { ShelfLoad } from './ShelfLoad'
import { ShelfRowActions } from './ShelfRowActions'

/**
 * Строка сценария (ShelfRow в ACC): слева что это за сценарий и идёт ли он сейчас, справа его
 * часы и всё, что с ним делают, - глаз идёт по колонке, а не поперёк строки. Вся строка
 * открывает редактор: середина, которая ничего не делает, читается как поломка.
 */
export const ShelfRow = ({ scenario, rowKey, shelf, hidden, kit }: ShelfRowProps) => {
  const facts = factsOf(scenario)
  const hours = schedulesOf(kit.view.schedules, scenario)
  const load = kit.loadOf(scenario)

  const handleEdit = () => kit.actions.edit(scenario)

  const handlePress = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest(OWN_PRESS)) return

    handleEdit()
  }

  return (
    <div
      data-shelf-row={rowKey}
      data-shelf={shelf}
      className={clsx(styles.row, hidden && styles.carried)}
      role="presentation"
      onClick={handlePress}>
      <ShelfGrip rowKey={rowKey} shelf={shelf} id={idOfRow(rowKey)} kit={kit} />
      <button type="button" className={styles.rowText} onClick={handleEdit}>
        <span className={styles.rowHead}>
          <span className={styles.rowName}>{scenario.name}</span>
          <ShelfLoad load={load} />
        </span>
        <ShelfFacts facts={facts} />
      </button>
      {!facts.broken && <ShelfHours hours={hours} />}
      <ShelfRowActions scenario={scenario} facts={facts} hours={hours} actions={kit.actions} />
    </div>
  )
}
