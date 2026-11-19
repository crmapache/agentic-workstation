import type { TFunction } from 'i18next'

import type { ModelConnection } from '@shared/open-models'

import type { BadgeTone } from '@agentic-workstation/ui/Badge.types'

import type { ConnectionDraft } from './ConnectionsScreen.types'

/** Слово и цвет состояния подключения: работает, не запущено, ключ не принят, не отвечает. */
export const connectionState = (
  connection: ModelConnection,
  t: TFunction,
): { text: string; tone: BadgeTone } => {
  switch (connection.state) {
    case 'ok':
      return {
        text: t('openModels.connections.states.ok', {
          count: connection.models.filter((model) => model.tools !== false).length,
        }),
        tone: 'success',
      }
    case 'offline':
      return { text: t('openModels.connections.states.offline'), tone: 'neutral' }
    case 'unauthorized':
      return { text: t('openModels.connections.states.unauthorized'), tone: 'warning' }
    case 'failed':
      return { text: t('openModels.connections.states.failed'), tone: 'danger' }
    default:
      return { text: t('openModels.connections.states.checking'), tone: 'neutral' }
  }
}

/** Сколько моделей подключение не предлагает: не умеют вызывать инструменты. */
export const withoutTools = (connection: ModelConnection): number =>
  connection.models.filter((model) => model.tools === false).length

/** Черновик диалога: новое OpenRouter, новый адрес или правка своего. */
export const draftOf = (
  connection: ModelConnection | null,
  kind: ConnectionDraft['kind'] = 'custom',
): ConnectionDraft =>
  connection
    ? {
        id: connection.id,
        kind: connection.kind,
        label: connection.label,
        baseUrl: connection.baseUrl,
        hasKey: connection.hasKey,
      }
    : { id: null, kind, label: '', baseUrl: '', hasKey: false }

/** Расход ключа OpenRouter строкой карточки; не назван - пусто. */
export const creditsLine = (connection: ModelConnection, t: TFunction): string => {
  const { credits } = connection

  if (!credits) return ''

  const used = credits.used.toFixed(2)

  return credits.limit === null
    ? t('openModels.connections.creditsNoLimit', { used })
    : t('openModels.connections.credits', { used, limit: credits.limit.toFixed(2) })
}

/** Тот же ли хост у двух адресов: ключ подключения живёт с хостом, а не с путём. */
export const sameHost = (left: string, right: string): boolean => {
  const origin = (url: string) => {
    try {
      return new URL(url.trim()).origin
    } catch {
      return url.trim()
    }
  }

  return origin(left) === origin(right)
}
