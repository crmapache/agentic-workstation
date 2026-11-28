import { useState, useEffect } from 'react'

import type { WalkthroughPen, WalkthroughPanelView } from '@shared/walkthrough'

import { invoke } from '../../../lib/ipc'
import { useIpcEvent } from '../../../lib/ipc.hooks'

const NONE: WalkthroughPanelView = { pen: null, hasStrokes: false }

/**
 * Панель инструментов человека (ADR 0135): что у него в руке и есть ли пометки - из главного
 * процесса, когда страница открылась, и дальше каждая перемена. Отдельная страница без кэша
 * запросов, как окно меток: данные живут в главном процессе, здесь - только что показать сейчас.
 */
export const usePanel = () => {
  const [view, setView] = useState(NONE)

  useIpcEvent('walkthrough:panelChanged', setView)

  useEffect(() => {
    let isLive = true

    void invoke('walkthrough:panel').then((current) => {
      if (isLive) setView((shown) => (shown === NONE ? current : shown))
    })

    return () => {
      isLive = false
    }
  }, [])

  const pick = (pen: WalkthroughPen) => void invoke('walkthrough:pick', { pen }).then(setView)

  const erase = () => void invoke('walkthrough:erase').then(setView)

  return { view, pick, erase }
}
