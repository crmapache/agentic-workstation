import { useRef, useMemo, useLayoutEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { useQueryClient } from '@tanstack/react-query'

import { HEAD_LOG } from '../RunScreen/RunScreen.constants'
import type { RouteOf } from '../../../lib/route.types'
import { queryKeys } from '../../../state/query-keys'
import { useRun, useWatch } from '../../../state/remote.queries'
import { useStepLog } from '../../../state/scenario.queries'
import { logView } from './StepLogScreen.utils'

/**
 * Журнал шага: страницы у IDE, вид ленты из них и место прокрутки. Первая страница встаёт
 * низом к низу экрана (конец разговора карточки); страница выше - над лентой, а то, что
 * человек читал, остаётся на месте: место держит расстояние до низа, как в разговоре.
 */
export const useStepLogScreen = (route: RouteOf<'stepLog'>) => {
  const { t } = useTranslation()
  const { agentId, projectKey, runId, stepKey } = route
  const queryClient = useQueryClient()
  const log = useStepLog(agentId, projectKey, runId, stepKey)
  const run = useRun(agentId, runId).data
  const bodyRef = useRef<HTMLDivElement>(null)
  const placed = useRef(false)
  const held = useRef<{ fromBottom: number; firstId: string } | null>(null)
  const pages = log.data?.pages
  const view = useMemo(() => (pages ? logView(stepKey, pages) : undefined), [pages, stepKey])
  const step = run?.steps.find((one) => one.key === stepKey)

  useWatch(agentId, { kind: 'run', runId })

  useLayoutEffect(() => {
    const body = bodyRef.current

    if (!body || !view) return

    const place = held.current

    if (place && view.items[0]?.id !== place.firstId) {
      body.scrollTop = body.scrollHeight - place.fromBottom
      held.current = null
    } else if (!placed.current && view.items.length > 0) {
      body.scrollTop = body.scrollHeight
      placed.current = true
    }
  }, [view])

  const handleLoadEarlier = () => {
    const body = bodyRef.current

    if (log.isFetchingPreviousPage) return
    if (body) {
      held.current = {
        fromBottom: body.scrollHeight - body.scrollTop,
        firstId: view?.items[0]?.id ?? '',
      }
    }

    void log.fetchPreviousPage()
  }

  // Свежее - снова с конца: склеивать новые страницы со старыми по месту ненадёжно.
  const handleRefresh = () => {
    placed.current = false
    held.current = null
    void queryClient.resetQueries({
      queryKey: queryKeys.stepLog(agentId, projectKey, runId, stepKey),
    })
  }

  const title =
    stepKey === HEAD_LOG
      ? t('run.headLog')
      : step
        ? step.pass > 1
          ? t('run.pass', { title: step.title, pass: step.pass })
          : step.title
        : t('stepLog.title')

  return {
    log,
    view,
    found: pages?.at(-1)?.found ?? true,
    title,
    scenarioName: run?.scenarioName,
    bodyRef,
    handleLoadEarlier,
    handleRefresh,
  }
}
