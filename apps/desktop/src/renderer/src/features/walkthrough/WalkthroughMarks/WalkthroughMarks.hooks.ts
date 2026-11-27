import { useState, useEffect } from 'react'

import type { WalkthroughMarksView } from '@shared/walkthrough'

import { invoke } from '../../../lib/ipc'
import { useIpcEvent } from '../../../lib/ipc.hooks'

const NOTHING: WalkthroughMarksView = { width: 0, height: 0, marks: [] }

/**
 * Что рисует окно меток (ADR 0134): спросить у главного процесса, когда страница открылась, и
 * дальше брать каждую перемену. Окно меток - отдельная страница без кэша запросов, как стрелка ИИ:
 * данные живут в главном процессе, здесь - только то, что нарисовать сейчас.
 */
export const useMarksView = (): WalkthroughMarksView => {
  const [view, setView] = useState(NOTHING)

  useIpcEvent('walkthrough:marks', setView)

  useEffect(() => {
    let isLive = true

    void invoke('walkthrough:view').then((current) => {
      if (isLive) setView((shown) => (shown === NOTHING ? current : shown))
    })

    return () => {
      isLive = false
    }
  }, [])

  return view
}
