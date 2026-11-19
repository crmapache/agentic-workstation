import type { AiProposal } from './connector-spec'

/** Домены второго уровня у национальных зон: у co.uk сайт - три части имени, а не две. */
const SECOND_LEVEL = new Set(['co', 'com', 'net', 'org', 'gov', 'ac', 'edu'])

/** Сайт адреса для сравнения: последние две части имени (три у co.uk и подобных). */
const siteOf = (url: string): string | null => {
  try {
    const parts = new URL(url).hostname.split('.')
    const [zone = '', second = ''] = parts.slice(-2).reverse()
    const size = parts.length > 2 && zone.length === 2 && SECOND_LEVEL.has(second) ? 3 : 2

    return parts.slice(-size).join('.')
  } catch {
    return null
  }
}

/**
 * Адрес API не на сайте документации, которую дал человек: повод проверить, что это
 * официальный адрес сервиса, а не тот, что подсунула чужая страница. Документации нет -
 * сравнивать не с чем.
 */
export const isForeignHost = (baseUrl: string, docsUrl: string): boolean => {
  const docs = docsUrl ? siteOf(docsUrl) : null
  const base = siteOf(baseUrl)

  return Boolean(docs && base && docs !== base)
}

/**
 * Что нужно от человека, чтобы добавить предложенное ИИ (ADR 0086): key - ключ (его знает
 * только человек, ИИ не видит), host - взгляд на адрес не с сайта документации. null - ничего:
 * IDE добавляет коннектор сама, и работа уходит из очереди.
 */
export type ProposalNeed = 'key' | 'host' | null

export const proposalNeed = (proposal: AiProposal, docsUrl: string): ProposalNeed => {
  // Сервер из Claude Code человек настроил сам, его вход переезжает внутри IDE.
  if (proposal.kind === 'existing') return null

  const needsKey =
    proposal.kind === 'mcp' ? proposal.auth === 'token' : proposal.spec.auth.type !== 'none'

  if (needsKey) return 'key'

  return isForeignHost(proposal.kind === 'mcp' ? proposal.url : proposal.spec.baseUrl, docsUrl)
    ? 'host'
    : null
}
