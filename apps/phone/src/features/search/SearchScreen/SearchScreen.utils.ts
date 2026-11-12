import type { TFunction } from 'i18next'

import type { SearchResult, SnippetPiece } from './SearchScreen.types'

/**
 * Кусок сообщения на части: найденные слова (spans - пары [начало, конец)) и текст между ними.
 * Пары идут по порядку; кривая (пустая, за краем, налезающая на прошлую) пропускается - текст
 * остаётся целым, просто без закраски.
 */
export const snippetPieces = (
  snippet: string,
  spans: readonly (readonly [number, number])[],
): SnippetPiece[] => {
  const pieces: SnippetPiece[] = []
  let at = 0

  for (const [start, end] of spans) {
    if (start < at || end <= start || end > snippet.length) continue
    if (start > at) pieces.push({ text: snippet.slice(at, start), hit: false })

    pieces.push({ text: snippet.slice(start, end), hit: true })
    at = end
  }

  if (at < snippet.length) pieces.push({ text: snippet.slice(at), hit: false })

  return pieces
}

/** Итог поиска одной строкой: сколько нашлось и где, или почему ничего. */
export const summaryOf = (t: TFunction, result: SearchResult): string => {
  if (result.kind === 'words') {
    const { data } = result

    if (data.failed) return t('search.failed')
    if (data.hits.length === 0) return t('search.nothing')

    const found = `${t('search.results', { count: data.total })} ${t('search.inConversations', {
      count: data.conversations,
    })}`

    return data.hits.length < data.total
      ? `${found} · ${t('search.showing', { shown: data.hits.length })}`
      : found
  }

  switch (result.data.status) {
    case 'found':
      return result.data.hits.length > 0
        ? t('search.places', { count: result.data.hits.length })
        : t('search.aiNothing')
    case 'cancelled':
      return t('search.cancelled')
    case 'failed':
      return [
        t(`search.aiFailures.${result.data.reason}`, { defaultValue: t('search.failed') }),
        result.data.detail,
      ]
        .filter(Boolean)
        .join(' ')
  }
}
