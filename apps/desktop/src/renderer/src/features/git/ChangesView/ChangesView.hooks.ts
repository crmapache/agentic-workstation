import { useState, useCallback } from 'react'
import { flushSync } from 'react-dom'

import { CHANGE_GROUP_IDS } from './ChangesView.constants'
import type { ChangeGroupId, MeasuredGroup, GroupExpansion } from './ChangesView.types'
import { fitExpansion } from './ChangesView.utils'

/**
 * Замер списка, каким он стоит: строки каждой группы (метки - groupMark и ROWS_MARK) и
 * сколько места останется, если свернуть все. Свёрнутая группа строк не рисует - у неё ноль.
 */
const measureList = (list: HTMLElement): { free: number; groups: MeasuredGroup[] } => {
  const groups = Array.from(list.querySelectorAll<HTMLElement>('[data-change-group]')).flatMap(
    (section) => {
      const id = CHANGE_GROUP_IDS.find((groupId) => groupId === section.dataset.changeGroup)
      const rows = section.querySelector<HTMLElement>('[data-change-rows]')

      return id ? [{ id, rowsHeight: rows?.offsetHeight ?? 0 }] : []
    },
  )
  const rowsHeight = groups.reduce((sum, group) => sum + group.rowsHeight, 0)

  return { free: list.clientHeight - (list.scrollHeight - rowsHeight), groups }
}

/**
 * Раскрытие групп списка изменений. Группа, которая только появилась (вид открыли, сменили
 * проект, появились новые файлы), раскрыта, если её строки помещаются без прокрутки, иначе
 * свёрнута; дальше её раскрывает и сворачивает человек. Ушедшая группа забывается: вернётся -
 * решится заново. listRef - на прокручиваемый список, пока есть нерешённые группы;
 * expansion - решённое, нерешённой группы в нём нет.
 */
export const useGroupExpansion = (groupIds: readonly ChangeGroupId[]) => {
  const [expansion, setExpansion] = useState<GroupExpansion>({})
  const isPending = groupIds.some((id) => expansion[id] === undefined)

  // Нерешённая группа стоит раскрытой, и её меряют, какой она встала, - до кадра: из
  // наблюдателя сразу (flushSync), иначе большой список мелькнул бы раскрытым. У спрятанного
  // вида (открыт другой) высоты нет - замер ждёт, пока его покажут.
  const measureRef = useCallback((list: HTMLElement | null) => {
    if (!list) return

    const observer = new ResizeObserver(() => {
      if (list.clientHeight === 0) return

      const { free, groups } = measureList(list)

      observer.disconnect()
      flushSync(() => setExpansion((current) => fitExpansion(free, groups, current)))
    })

    observer.observe(list)

    return () => observer.disconnect()
  }, [])

  const forget = useCallback(
    (id: ChangeGroupId) =>
      setExpansion((current) => {
        if (current[id] === undefined) return current

        const { [id]: _gone, ...rest } = current

        return rest
      }),
    [],
  )

  const toggle = (id: ChangeGroupId) =>
    setExpansion((current) => ({ ...current, [id]: !(current[id] ?? true) }))

  return { listRef: isPending ? measureRef : undefined, expansion, toggle, forget }
}
