import type { ConnectorKind } from '@shared/connectors'

import { SERVER_PREFIX, LABEL_SLUG_MAX } from './connectors.constants'

/**
 * Подпись коннектора для имени сервера: строчные латинские буквы, цифры и дефисы. Имя
 * сервера у провайдера становится частью имени инструмента (mcp__gmail-work__search), а
 * там допустимы только такие знаки. Ничего не осталось - пустая строка.
 */
export const labelSlug = (label: string): string =>
  label
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, LABEL_SLUG_MAX)
    .replace(/-+$/g, '')

/** Имя сервера: тип и подпись (gmail-work) или одна подпись (chatkepr). Пустая - null. */
export const serverNameFor = (kind: ConnectorKind, label: string): string | null => {
  const slug = labelSlug(label)
  const prefix = SERVER_PREFIX[kind]

  if (!slug) return null

  return prefix ? `${prefix}-${slug}` : slug
}
