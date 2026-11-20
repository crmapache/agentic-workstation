import type { TFunction } from 'i18next'

import type { UsageWindowWire } from '@agentic-workstation/remote-protocol/machine-wire-types'
import type { ConversationWire } from '@agentic-workstation/remote-protocol/wire-types'
import type { ProgressBarTone } from '@agentic-workstation/ui/ProgressBar.types'

/**
 * Лимиты на телефоне: окна аккаунта (экран аккаунтов) и показания под полем разговора - контекст
 * и окна аккаунта, на котором он идёт.
 */

/** Окно лимита словами: пять часов, неделя, неделя одной модели. */
export const windowLabel = (t: TFunction, window: UsageWindowWire): string => {
  if (window.model) return t('accounts.windows.weeklyModel', { model: window.model })

  return t(`accounts.windows.${window.group}`, { defaultValue: window.group })
}

/** Сколько израсходовано, целыми процентами; больше 100 - доплата, так и показывается. */
export const percentText = (percent: number): string => `${Math.round(Math.max(0, percent))}%`

/** Доля полосы: до края, даже если доплата ушла за сотню. */
export const usageShare = (percent: number): number => Math.min(Math.max(percent / 100, 0), 1)

/** Тон полосы по израсходованному: в запасе, быстрее нормы, близко к пределу, предел. */
export const usageTone = (percent: number): ProgressBarTone => {
  if (percent >= 100) return 'danger'
  if (percent >= 80) return 'high'
  if (percent >= 50) return 'warning'

  return 'success'
}

/** Показание под полем разговора: заполненность контекста или окно лимита аккаунта. */
export type Meter = {
  key: string
  /** Подпись в ряду: «Context», «5-hour», «Week». */
  label: string
  /** Израсходовано, проценты. */
  percent: number
  tone: ProgressBarTone
  /** Окно исчерпано, и идёт доплата: кольцо горит, процент застрял на сотне. */
  burning: boolean
  /** Когда окно сбросится, по часам телефона; null - не сказано или это контекст. */
  resetsAt: number | null
}

/**
 * Показания разговора, как кольца под полем окна IDE: контекст (если провайдер назвал окно) и
 * окна лимита его аккаунта. Окно, чей сброс уже прошёл, - новое и пустое, а не вчерашнее.
 * offset - насколько часы IDE впереди часов телефона.
 */
export const conversationMeters = (
  t: TFunction,
  conversation: ConversationWire,
  now: number,
  offset: number,
): Meter[] => {
  const { tokens, window: size } = conversation.context
  const context: Meter[] =
    size > 0
      ? [
          {
            key: 'context',
            label: t('conversation.meters.context'),
            percent: (tokens / size) * 100,
            tone: usageTone((tokens / size) * 100),
            burning: false,
            resetsAt: null,
          },
        ]
      : []
  const usage = conversation.usage ?? null
  const windows = (usage?.windows ?? []).map((window): Meter => {
    const resetsAt = window.resetsAt === null ? null : window.resetsAt - offset
    const percent = resetsAt !== null && resetsAt <= now ? 0 : window.percent
    const burning = percent >= 100 && usage?.extra !== null

    return {
      key: `${window.group}|${window.model}`,
      label: windowLabel(t, window),
      percent,
      tone: burning ? 'accent' : usageTone(percent),
      burning,
      resetsAt,
    }
  })

  return [...context, ...windows]
}
