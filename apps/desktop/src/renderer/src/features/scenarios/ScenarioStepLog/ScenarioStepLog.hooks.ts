import { useRef, useEffect, useLayoutEffect } from 'react'

import type { ScenarioRun } from '@shared/scenario-runs'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { RunPlace } from '@shared/ipc/scenarios.contract'

import { invoke } from '../../../lib/ipc'
import { QUERY_KEYS } from '../../../state/query-keys'
import { LOG_BOTTOM_PX, STEP_LOG_REFRESH_MS } from './ScenarioStepLog.constants'
import { isLogLive } from './ScenarioStepLog.utils'

/**
 * Журнал шага или главного потока - страница его разговора с диска (главный процесс читает
 * транскрипт той же лентой, что панель). Пока разговор идёт, страница перечитывается по часам;
 * кончился - ещё раз напоследок, чтобы последние слова не остались за кадром. «Load earlier»
 * кладёт ответ (лента целиком) в тот же ключ кэша.
 */
export const useStepLog = (place: RunPlace, run: ScenarioRun, logKey: string) => {
  const queryClient = useQueryClient()
  const queryKey = QUERY_KEYS.scenarioStepLog(run.id, logKey)
  const isLive = isLogLive(run, logKey)
  const wasLive = useRef(isLive)
  // Страница выше уже едет: второе нажатие метки не просит её ещё раз.
  const isPaging = useRef(false)
  const query = useQuery({
    queryKey,
    queryFn: () =>
      invoke('scenarios:stepLog', { place, runId: run.id, key: logKey, earlier: false }),
    refetchInterval: isLive ? STEP_LOG_REFRESH_MS : false,
    staleTime: isLive ? 0 : Infinity,
  })

  useEffect(() => {
    if (wasLive.current && !isLive) {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.scenarioStepLog(run.id, logKey) })
    }

    wasLive.current = isLive
  }, [isLive, queryClient, run.id, logKey])

  const loadEarlier = async () => {
    if (isPaging.current) return

    isPaging.current = true

    try {
      const page = await invoke('scenarios:stepLog', {
        place,
        runId: run.id,
        key: logKey,
        earlier: true,
      })

      queryClient.setQueryData(queryKey, page)
    } catch (error) {
      console.warn('[scenarios] ранняя страница журнала не пришла:', error)
    } finally {
      isPaging.current = false
    }
  }

  return { ...query, loadEarlier }
}

/** Ближайший предок, который прокручивается: журнал стоит в теле окна прогона и листается им. */
const scrollerOf = (node: HTMLElement | null): HTMLElement | null => {
  for (let parent = node?.parentElement ?? null; parent; parent = parent.parentElement) {
    const { overflowY } = getComputedStyle(parent)

    if (overflowY === 'auto' || overflowY === 'scroll') return parent
  }

  return null
}

const isAtBottom = (box: HTMLElement) =>
  box.scrollHeight - box.scrollTop - box.clientHeight <= LOG_BOTTOM_PX

/**
 * Прокрутка журнала - как разговор из истории: открывается концом и держится у конца, пока
 * строки дорисовываются (лента провайдера подгрузилась, подсветка кода, картинки) и пока идущий
 * разговор растёт; страница выше («load earlier») встаёт над читаемым, не сдвигая его.
 */
export const useLogScroll = (items: readonly unknown[] | undefined) => {
  const rootRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const held = useRef<{ height: number; top: number } | null>(null)

  useEffect(() => {
    const root = rootRef.current
    const box = scrollerOf(root)

    if (!root || !box) return

    const handleScroll = () => {
      stick.current = isAtBottom(box)
    }
    const observer = new ResizeObserver(() => {
      if (stick.current && !held.current) box.scrollTop = box.scrollHeight
    })

    box.addEventListener('scroll', handleScroll, { passive: true })
    observer.observe(root)

    return () => {
      box.removeEventListener('scroll', handleScroll)
      observer.disconnect()
    }
  }, [])

  useLayoutEffect(() => {
    const box = scrollerOf(rootRef.current)
    const before = held.current

    if (!box) return

    if (before) {
      box.scrollTop = before.top + (box.scrollHeight - before.height)
      held.current = null
    } else if (stick.current) {
      box.scrollTop = box.scrollHeight
    }
  }, [items])

  /** Перед просьбой о странице выше: запомнить, что читают, - она встанет над этим. */
  const holdPlace = () => {
    const box = scrollerOf(rootRef.current)

    if (box) held.current = { height: box.scrollHeight, top: box.scrollTop }
  }

  return { rootRef, holdPlace }
}
