import type { LucideIcon } from 'lucide-react'
import { createLucideIcon } from 'lucide-react'

/**
 * Знак ИИ (панель Claude Code, её пустой разговор, вкладка «спросить ИИ» в поиске): звезда с
 * вогнутыми гранями и звёздочка рядом, залитые. У lucide `Sparkles` толстые лучи, кружок и плюс -
 * на плитке пустого состояния он выглядел грубо. Заливка, а не контур: тонкий контур такой звезды
 * в 16 пикселях рассыпается, а залитая читается в любом размере. Толщина штриха её не трогает.
 */
export const AI_ICON: LucideIcon = createLucideIcon({
  name: 'ai-sparkle',
  node: [
    [
      'path',
      {
        d: 'M10.5 5.5Q12.2 11.8 18.5 13.5Q12.2 15.2 10.5 21.5Q8.8 15.2 2.5 13.5Q8.8 11.8 10.5 5.5Z',
        fill: 'currentColor',
        stroke: 'none',
        key: 'star',
      },
    ],
    [
      'path',
      {
        d: 'M18.5 2.5Q19.2 4.8 21.5 5.5Q19.2 6.2 18.5 8.5Q17.8 6.2 15.5 5.5Q17.8 4.8 18.5 2.5Z',
        fill: 'currentColor',
        stroke: 'none',
        key: 'spark',
      },
    ],
  ],
})
