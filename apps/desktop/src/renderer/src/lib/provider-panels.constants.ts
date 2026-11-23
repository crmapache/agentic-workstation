import type { LucideIcon } from 'lucide-react'
import { Boxes, Orbit, Aperture, MoonStar } from 'lucide-react'

import type { ProviderId } from '@shared/providers'

import { AI_ICON } from './ai-icon.constants'

/**
 * Значок панели провайдера LLM: её кнопка на правой полосе и всё, где выбирают, в чей чат идти
 * («Implement» у карточки трекера). Codex - диафрагма: терминал занят кнопкой терминала под
 * ним, а знак ИИ - панелью Claude Code. Antigravity (ADR 0092) - орбита, Kimi - луна со звездой
 * (Moonshot AI), открытые модели (ADR 0084) - кубики.
 */
export const PROVIDER_ICONS: Readonly<Record<ProviderId, LucideIcon>> = {
  claude: AI_ICON,
  codex: Aperture,
  antigravity: Orbit,
  kimi: MoonStar,
  opencode: Boxes,
}

/** Имя панели провайдера (ключ перевода): подсказка кнопки на полосе и пункт выбора чата. */
export const PROVIDER_LABEL_KEYS = {
  claude: 'providerViews.claudeCode',
  codex: 'providerViews.codex',
  antigravity: 'providerViews.antigravity',
  kimi: 'providerViews.kimi',
  opencode: 'providerViews.openModels',
} as const satisfies Readonly<Record<ProviderId, string>>
