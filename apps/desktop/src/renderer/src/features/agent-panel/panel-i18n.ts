import i18next from 'i18next'
import type { i18n } from 'i18next'

import type { ProviderId } from '@shared/providers'

import codexEn from '../../locales/en.codex.json'
import en from '../../locales/en.json'
import openCodeEn from '../../locales/en.opencode.json'

/** Строки провайдера поверх общих - только там, где он говорит иначе, чем Claude. */
const OVERRIDES: Record<ProviderId, object> = {
  claude: {},
  codex: codexEn,
  opencode: openCodeEn,
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Общие строки, поверх которых легли строки провайдера; общие не меняются. */
export const withOverrides = (
  base: Record<string, unknown>,
  over: Record<string, unknown>,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(base).map(([key, value]) => {
      const own = over[key]

      if (isRecord(value) && isRecord(own)) return [key, withOverrides(value, own)]

      return [key, own ?? value]
    }),
  )

const instances = new Map<ProviderId, i18n>()

/**
 * Переводы панели провайдера (ADR 0083): общие строки с его именем ({{agent}}, {{cli}}) и
 * его собственные. Панели смонтированы разом, поэтому у каждой свой экземпляр i18next, а не
 * переключение общего. Claude - общий экземпляр окна: его имя там по умолчанию (app/i18n.ts).
 */
export const panelI18n = (provider: ProviderId): i18n => {
  if (provider === 'claude') return i18next

  const known = instances.get(provider)

  if (known) return known

  const instance = i18next.createInstance()

  void instance.init({
    lng: 'en',
    fallbackLng: 'en',
    initAsync: false,
    resources: { en: { translation: withOverrides(en, { ...OVERRIDES[provider] }) } },
    interpolation: { escapeValue: false, defaultVariables: en.providerWords[provider] },
    returnNull: false,
  })
  instances.set(provider, instance)

  return instance
}
