import { useMemo } from 'react'
import type { RevealOptions } from 'smooth-stream-text/react'

import { REVEAL_PACE, REVEAL_BLUR_TOKEN, REVEAL_DURATION_TOKEN } from './AssistantMessage.constants'
import { tokenNumber } from './AssistantMessage.utils'

/**
 * Настройки волны из токенов: символ «оседает» в текст по таймеру волны, и он должен
 * совпасть с длительностью анимации. Под «меньше движения» токены нулевые - волны нет.
 */
export const useRevealOptions = (): RevealOptions =>
  useMemo(() => {
    const style = getComputedStyle(document.documentElement)

    return {
      ...REVEAL_PACE,
      durationMs: tokenNumber(style, REVEAL_DURATION_TOKEN),
      blurPx: tokenNumber(style, REVEAL_BLUR_TOKEN),
    }
  }, [])
