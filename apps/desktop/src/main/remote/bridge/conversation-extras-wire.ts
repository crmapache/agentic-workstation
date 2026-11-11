import type { AsideExchange } from '@shared/claude-panel'
import type { RewindOutcome, RewindPreview } from '@shared/claude-rewind'
import type { SearchHit, SearchAnswer, AiSearchOutcome } from '@shared/claude-search'

import type {
  SearchWire,
  AiSearchWire,
  SearchHitWire,
  AsideAnswerWire,
  RewindOutcomeWire,
  RewindPreviewWire,
} from '@agentic-workstation/remote-protocol/conversation-wire-types'

import { CLAUDE_PROVIDER } from './conversation-wire'
import type { Redact } from './fit'
import { sizeOf, fitValue, redactStrings } from './fit'
import { READ_BUDGET } from './reads-fit'

/**
 * Ответы команд разговора телефону, каждый - в один кадр и без папок машины: вопрос сбоку,
 * находки поиска, предпросмотр и итог отката.
 */

/**
 * Кусок находки без папок, с местами найденных слов, пересчитанными после подмены: метка
 * короче пути, и места после неё сдвинулись бы. Подменяется по кускам между границами мест -
 * найденное слово внутри пути остаётся словом, а домашняя папка перед ним всё равно уходит.
 */
export const redactSnippet = (
  snippet: string,
  spans: readonly [number, number][],
  redact: Redact,
): { snippet: string; spans: [number, number][] } => {
  const cuts = [
    ...new Set([0, snippet.length, ...spans.flat().filter((at) => at > 0 && at < snippet.length)]),
  ].sort((first, second) => first - second)
  const moved = new Map<number, number>([[0, 0]])
  let text = ''

  for (let index = 0; index < cuts.length - 1; index += 1) {
    text += redact(snippet.slice(cuts[index], cuts[index + 1]))
    moved.set(cuts[index + 1] ?? snippet.length, text.length)
  }

  return {
    snippet: text,
    spans: spans.map(([start, end]) => [moved.get(start) ?? 0, moved.get(end) ?? text.length]),
  }
}

/** Поиск по разговорам сейчас только у панели Claude Code. */
const hitWire = (hit: SearchHit, redact: Redact): SearchHitWire => ({
  provider: CLAUDE_PROVIDER,
  sessionId: hit.conversationId,
  anchor: hit.anchor,
  speaker: hit.speaker,
  at: hit.at,
  title: redact(hit.title),
  messages: hit.messages,
  ...redactSnippet(hit.snippet, hit.spans, redact),
  ...(hit.reason !== undefined && { reason: redact(hit.reason) }),
})

/** Находки - сколько влезло в кадр, по порядку IDE; счёт - всего найденного. */
const hitsThatFit = (hits: readonly SearchHit[], redact: Redact, budget: number) => {
  const wires = hits.map((hit) => hitWire(hit, redact))

  while (wires.length > 0 && sizeOf(wires) > budget) wires.pop()

  return wires
}

export const searchWire = (
  answer: SearchAnswer,
  redact: Redact,
  budget = READ_BUDGET,
): SearchWire => ({
  hits: hitsThatFit(answer.hits, redact, budget),
  total: answer.total,
  conversations: answer.counts.conversations,
  failed: answer.failed,
})

export const aiSearchWire = (
  outcome: AiSearchOutcome,
  redact: Redact,
  budget = READ_BUDGET,
): AiSearchWire => {
  switch (outcome.status) {
    case 'found':
      return { status: 'found', hits: hitsThatFit(outcome.hits, redact, budget) }
    case 'cancelled':
      return outcome
    case 'failed':
      return { status: 'failed', reason: outcome.reason, detail: redact(outcome.detail) }
  }
}

/**
 * Итог вопроса сбоку. null - вопрос снят вместе с цепочкой (/clear) раньше ответа: для телефона
 * это отмена. Ответ длиннее кадра - урезан с пометкой и флагом truncated.
 */
export const asideAnswerWire = (
  askId: string,
  exchange: AsideExchange | null,
  redact: Redact,
): AsideAnswerWire => {
  const ended =
    exchange && exchange.state !== 'asking' ? { ...exchange, state: exchange.state } : null
  const full: AsideAnswerWire = {
    askId,
    state: ended?.state ?? 'cancelled',
    text: ended?.text ?? '',
    notice: ended?.notice ?? '',
    failure: ended?.failure ?? null,
    message: ended?.message ?? '',
    truncated: false,
  }
  const clean = redactStrings(full, redact) as AsideAnswerWire

  if (sizeOf(clean) <= READ_BUDGET) return clean

  const cut = fitValue(clean, READ_BUDGET)

  return { ...(cut ?? { ...clean, text: '', notice: '', message: '' }), truncated: true }
}

/** Предпросмотр отката: пути файлов - метками папок. */
export const rewindPreviewWire = (preview: RewindPreview, redact: Redact): RewindPreviewWire =>
  preview.state === 'ready'
    ? { ...preview, files: preview.files.map(redact) }
    : preview.state === 'unavailable'
      ? { state: 'unavailable', detail: redact(preview.detail) }
      : { state: preview.state }

export const rewindOutcomeWire = (outcome: RewindOutcome, redact: Redact): RewindOutcomeWire => {
  if (!outcome.rewound) {
    return { rewound: false, reason: outcome.reason, detail: redact(outcome.detail) }
  }

  const wire: RewindOutcomeWire = {
    rewound: true,
    prefill: redact(outcome.prefill),
    filesFailed: outcome.filesFailed === null ? null : redact(outcome.filesFailed),
  }

  // Текст отрезанного сообщения ложится в поле телефона: урезанный с пометкой он лёг бы
  // туда с чужими словами - лучше пустое поле, сообщение целиком есть в IDE.
  return sizeOf(wire) <= READ_BUDGET ? wire : { ...wire, prefill: '' }
}
