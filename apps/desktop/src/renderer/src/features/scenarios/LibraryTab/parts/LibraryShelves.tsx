import { useMemo, useState } from 'react'

import { SCENARIO_SCOPES } from '@shared/scenarios'
import type { ScenarioScope } from '@shared/scenarios'

import { useShelfArrange } from '../LibraryTab.hooks'
import styles from '../LibraryTab.module.scss'
import type { Landed, ShelfKit, LibraryShelvesProps } from '../LibraryTab.types'
import { rowKey, isMovable, arrangementOf } from '../../scenarios-shelves.utils'
import type { ShelfMove, Arrangement } from '../../scenarios-shelves.utils'
import { LiftedRow } from './LiftedRow'
import { Shelf } from './Shelf'

/**
 * Обе полки с перестановкой: строки двигаются за ручку по своей полке и на соседнюю. Файл на
 * другую полку переносит главный процесс; отпущенное рисуется сразу и держится до его ответа,
 * иначе строка прыгнула бы назад на миг, пока идёт запись. Без папки проекта полка одна.
 */
export const LibraryShelves = ({ view, loadOf, actions, onPlace }: LibraryShelvesProps) => {
  const [landed, setLanded] = useState<Landed | null>(null)
  const isLanded = landed !== null && landed.over === view.scenarios
  const shown = useMemo(
    () =>
      landed && landed.over === view.scenarios ? landed.arrangement : arrangementOf(view.scenarios),
    [landed, view.scenarios],
  )
  const byKey = useMemo(
    () => new Map(view.scenarios.map((scenario) => [rowKey(scenario), scenario])),
    [view.scenarios],
  )

  // Отказ приходит не всегда новым списком: отпущенное снимается и само.
  const handleMove = (end: Arrangement, move: ShelfMove) => {
    setLanded({ over: view.scenarios, arrangement: end })
    void onPlace(move).then((ok) => {
      if (!ok) setLanded(null)
    })
  }

  const { rootRef, carried, grip, handleDragOver, handleDrop } = useShelfArrange({
    shown,
    canShare: view.canShare,
    settled: !isLanded,
    onMove: handleMove,
  })
  const scopes: readonly ScenarioScope[] = view.canShare ? SCENARIO_SCOPES : ['user']
  const lifted = carried ? byKey.get(carried.key) : undefined
  const kit: ShelfKit = {
    view,
    loadOf,
    actions,
    grip,
    movable: (key) => isMovable(shown, key, view.canShare),
  }

  return (
    <div ref={rootRef} className={styles.shelves} onDragOver={handleDragOver} onDrop={handleDrop}>
      {scopes.map((scope) => (
        <Shelf
          key={scope}
          scope={scope}
          keys={shown[scope]}
          byKey={byKey}
          carried={carried}
          slot={carried?.place.shelf === scope ? carried.place.index : null}
          kit={kit}
        />
      ))}
      {carried && lifted && <LiftedRow carried={carried} scenario={lifted} kit={kit} />}
    </div>
  )
}
