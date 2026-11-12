import { useRef, useState, useLayoutEffect } from 'react'

import type { ScenarioRun } from '@shared/scenario-runs'

import { presentStepKey } from '../scenarios-timeline.utils'
import { RUN_ROW } from '../ScenarioRunTimeline/ScenarioRunTimeline.constants'
import { HEAD_LOG } from '../ScenarioStepLog/ScenarioStepLog.constants'
import { useScenarioQueues } from '../../../state/scenarios.queries'
import { openingOf } from './RunModal.utils'

/** Строка таймлайна по ключу - внутри страницы прогона. */
const rowOf = (root: HTMLElement | null, key: string): Element | null =>
  root && key ? root.querySelector(`[${RUN_ROW}="${CSS.escape(key)}"]`) : null

/**
 * Что открыто в окне прогона - таймлайн или журнал (шага или главного потока) - и где стоит
 * таймлайн. Открытый идущий прогон встаёт на строку, где он сейчас; возврат из журнала - к шагу,
 * чей журнал открывали, а не туда, куда журнал прокрутил общее тело окна.
 */
export const useRunPage = (run: ScenarioRun | null) => {
  const [logKey, setLogKey] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const returnTo = useRef<string | null>(null)
  const isPlaced = useRef(false)

  useLayoutEffect(() => {
    if (!run || isPlaced.current || logKey !== null) return

    isPlaced.current = true

    if (openingOf(run) === 'present') {
      rowOf(rootRef.current, presentStepKey(run))?.scrollIntoView({ block: 'center' })
    }
  }, [run, logKey])

  useLayoutEffect(() => {
    if (logKey !== null || returnTo.current === null) return

    const row = rowOf(rootRef.current, returnTo.current)

    returnTo.current = null

    if (row) row.scrollIntoView({ block: 'center' })
    else rootRef.current?.scrollIntoView({ block: 'start' })
  }, [logKey])

  const openLog = (key: string) => {
    // Главный поток своей строки в таймлайне не имеет: возврат - к строке, где прогон сейчас.
    returnTo.current = key === HEAD_LOG && run ? presentStepKey(run) : key
    setLogKey(key)
  }

  const back = () => setLogKey(null)

  return { logKey, rootRef, openLog, back }
}

/** Имя очереди прогона: по нему различаются два прогона одного сценария в разных очередях. */
export const useQueueName = (queueId: string | undefined): string => {
  const { data } = useScenarioQueues()

  return data?.queues.find((queue) => queue.id === queueId)?.name ?? ''
}
