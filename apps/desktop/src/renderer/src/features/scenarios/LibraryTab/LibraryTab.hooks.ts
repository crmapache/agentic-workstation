import type { DragEvent, KeyboardEvent } from 'react'
import { useRef, useState, useEffect, useLayoutEffect } from 'react'

import type { ScenarioScope } from '@shared/scenarios'

import {
  placed,
  landing,
  stepped,
  placement,
  placeOfRow,
  shelvesOpen,
} from '../scenarios-shelves.utils'
import { useScenarioActions } from '../scenarios.actions'
import { useScenariosStore } from '../scenarios.store'
import { useAuthorStore } from '../AuthorModal/AuthorModal.store'
import type { ScenariosProject } from '../ScenariosView/ScenariosView.types'
import { invoke } from '../../../lib/ipc'
import { DRAG_TYPE, BLANK_DRAG_IMAGE } from './LibraryTab.constants'
import type {
  Carried,
  DragPoint,
  GripHandlers,
  ShelfActions,
  ArrangeOptions,
} from './LibraryTab.types'
import { measureFrame } from './LibraryTab.utils'

/**
 * Перестановка строк полок (Shelves.tsx в ACC, но на HTML5 DnD): строку берут за ручку, она
 * прячется, а её место - рамка её же роста - едет туда, куда она легла бы. Решение читается по
 * раскладке, снятой в начале жеста: соседи, уступившие место, его не двигают, и строка не
 * мечется между полками при неподвижной руке. Option+стрелка - то же с клавиатуры.
 */
export const useShelfArrange = ({ shown, canShare, settled, onMove }: ArrangeOptions) => {
  const rootRef = useRef<HTMLDivElement>(null)
  const carriedRef = useRef<Carried | null>(null)
  const timer = useRef(0)
  const focusAfter = useRef<string | null>(null)
  const [carried, setCarried] = useState<Carried | null>(null)
  // Картинка переноса - заранее: не загруженную к началу жеста Chromium заменил бы снимком.
  const [blankImage] = useState(() => Object.assign(new Image(), { src: BLANK_DRAG_IMAGE }))

  // Переставленная стрелкой строка уходит из DOM и возвращается (своя полка - переносом,
  // чужая - новым ключом после ответа), фокус с ней пропадает - его возвращают ручке. Пришёл
  // ответ (или отказ) - ждать больше нечего: ручку не ищут, чтобы не украсть фокус потом.
  useLayoutEffect(() => {
    const target = focusAfter.current

    if (!target) return

    const grip = rootRef.current?.querySelector<HTMLElement>(`[data-grip="${CSS.escape(target)}"]`)

    if (grip && grip !== document.activeElement) grip.focus()
    if (settled) focusAfter.current = null
  })

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const finish = (dropped: boolean) => {
    const state = carriedRef.current

    window.clearTimeout(timer.current)
    carriedRef.current = null
    setCarried(null)

    if (!state || !dropped) return

    const end = placed(state.start, state.key, state.place)
    const move = placement(state.start, end, state.key)

    if (move) onMove(end, move)
  }

  const handleDragStart = (event: DragEvent<HTMLElement>, key: string) => {
    const root = rootRef.current
    const row = event.currentTarget.closest<HTMLElement>('[data-shelf-row]')
    const start = placeOfRow(shown, key)

    if (!root || !row || !start) return

    const rect = row.getBoundingClientRect()

    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(DRAG_TYPE, key)
    // Системный снимок строки прячется: за рукой едет своя копия.
    event.dataTransfer.setDragImage(blankImage, 0, 0)
    carriedRef.current = {
      key,
      from: start.shelf,
      height: rect.height,
      width: rect.width,
      grab: event.clientY - rect.top,
      grabX: event.clientX - rect.left,
      at: { x: event.clientX, y: event.clientY },
      start: shown,
      place: start,
      frame: measureFrame(root, key),
    }
    // Спрятать строку прямо в dragstart - оборвать жест (Chromium): прячется следующим тиком.
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCarried(carriedRef.current), 0)
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    const state = carriedRef.current
    const root = rootRef.current

    if (!state || !root) return

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'

    const top = event.clientY - root.getBoundingClientRect().top - state.grab
    const place = landing({
      key: state.key,
      from: state.from,
      top,
      bottom: top + state.height,
      origin: state.frame.origin,
      rows: state.frame.rows,
      boundary: state.frame.boundary,
      open: shelvesOpen(state.start, state.key, canShare),
    })

    if (place.shelf === state.place.shelf && place.index === state.place.index) return

    carriedRef.current = { ...state, place }
    setCarried(carriedRef.current)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!carriedRef.current) return

    event.preventDefault()
    finish(true)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>, key: string) => {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return

    event.preventDefault()

    const at = placeOfRow(shown, key)

    if (!at) return

    const open = shelvesOpen(shown, key, canShare)
    const end = placed(shown, key, stepped(shown, key, at, event.key === 'ArrowDown', open))
    const move = placement(shown, end, key)

    if (!move) return

    focusAfter.current = `${move.to}:${move.id}`
    onMove(end, move)
  }

  const grip: GripHandlers = {
    onDragStart: handleDragStart,
    onDragEnd: () => finish(false),
    onKeyDown: handleKeyDown,
  }

  return { rootRef, carried, grip, handleDragOver, handleDrop }
}

/**
 * Где рука, пока несут строку (для копии за рукой): со всего окна, а не только над полками -
 * копия не должна замирать у края вида. Свой слушатель у копии: перерисовывается только она.
 */
export const useDragPoint = (start: DragPoint): DragPoint => {
  const [point, setPoint] = useState(start)

  useEffect(() => {
    const handleDragOver = (event: globalThis.DragEvent) => {
      // Уход за окно Chromium отмечает dragover с нулями - копия остаётся, где была.
      if (event.clientX === 0 && event.clientY === 0) return

      setPoint({ x: event.clientX, y: event.clientY })
    }

    document.addEventListener('dragover', handleDragOver)

    return () => document.removeEventListener('dragover', handleDragOver)
  }, [])

  return point
}

/**
 * Что строка делает со сценарием: Run, час и новый сценарий - окнами поверх вида, копия -
 * сразу, удаление - после вопроса. Редактор получает сценарий, прочитанный с диска в момент
 * нажатия: полка в кэше могла отстать от файла, поправленного рядом (ACC читает те же полки).
 */
export const useLibraryActions = (project: ScenariosProject) => {
  const actions = useScenarioActions()
  const open = useScenariosStore((store) => store.open)
  const fail = useScenariosStore((store) => store.fail)
  const [doomed, setDoomed] = useState<Parameters<ShelfActions['remove']>[0] | null>(null)

  const edit: ShelfActions['edit'] = (scenario) => {
    void invoke('scenarios:fetch', {
      projectId: project.id,
      id: scenario.id,
      scope: scenario.scope,
    })
      .then((fresh) =>
        fresh
          ? open({ kind: 'editor', scenario: fresh, scope: fresh.scope })
          : fail('scenarioGone'),
      )
      // Файл не прочитался - для человека это тот же «сценария нет на полке».
      .catch(() => fail('scenarioGone'))
  }

  const create = (scope: ScenarioScope) => {
    useAuthorStore.getState().update({ scope })
    open({ kind: 'author' })
  }

  const confirmRemove = () => {
    if (doomed) void actions.remove(project.id, doomed.id, doomed.scope)

    setDoomed(null)
  }

  const shelf: ShelfActions = {
    edit,
    run: (scenario) => open({ kind: 'launch', scenarioId: scenario.id, scope: scenario.scope }),
    schedule: (scenario) =>
      open({ kind: 'schedule', scenarioId: scenario.id, scope: scenario.scope }),
    duplicate: (scenario) => void actions.duplicate(project.id, scenario.id, scenario.scope),
    remove: setDoomed,
    create,
  }

  return {
    shelf,
    doomed,
    confirmRemove,
    cancelRemove: () => setDoomed(null),
    place: actions.place,
  }
}
