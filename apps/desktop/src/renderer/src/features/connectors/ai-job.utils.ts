import type { TFunction } from 'i18next'

import type { FeedItem, ConversationFeed } from '@shared/claude-feed'
import type { AiJob, AiProposal, AiJobActivity } from '@shared/connector-spec'

import { ANSWER_TOOL } from './ai-job.constants'
import { hostOf } from './ConnectorsView/ConnectorsView.utils'

/** Страница коротко: хост и путь без протокола - полный адрес в строку не влезет. */
const pageOf = (url: string): string => {
  try {
    const { host, pathname } = new URL(url)

    return pathname === '/' ? host : `${host}${pathname}`
  } catch {
    return url
  }
}

/** Первая строка слов ИИ: на плитке и в шапке окна вся мысль не нужна. */
const firstLine = (text: string): string => text.trim().split('\n')[0] ?? ''

/** Что ИИ делает в идущем ходе: ищет, читает страницу, пишет ответ; шага ещё нет - думает. */
export const activityLine = (t: TFunction, activity: AiJobActivity | null): string => {
  if (!activity) return t('connectors.ai.activity.thinking')
  if (activity.kind === 'search')
    return t('connectors.ai.activity.search', { subject: activity.subject })
  if (activity.kind === 'read')
    return t('connectors.ai.activity.read', { subject: pageOf(activity.subject) })

  return t('connectors.ai.activity.answer')
}

/** Что ИИ предлагает добавить - одной строкой: сервер Claude Code, MCP или API с инструментами. */
export const proposalLine = (t: TFunction, proposal: AiProposal): string => {
  if (proposal.kind === 'existing') {
    return t('connectors.ai.proposal.existing', { name: proposal.candidate.name })
  }

  if (proposal.kind === 'mcp')
    return t('connectors.ai.proposal.mcp', { host: hostOf(proposal.url) })

  return t('connectors.ai.proposal.http', {
    host: hostOf(proposal.spec.baseUrl),
    count: proposal.spec.tools.length,
  })
}

/** Почему ход сломался - словами, без подробностей CLI: они - строкой ниже, где есть место. */
export const failureLine = (t: TFunction, job: AiJob): string =>
  t(`connectors.ai.errors.${job.error ?? 'failed'}`)

/**
 * Строка работы на плитке и в шапке окна: шаг идущего хода, что предложено, вопрос ИИ,
 * остановка или сбой.
 */
export const jobLine = (t: TFunction, job: AiJob): string => {
  switch (job.status) {
    case 'working':
      return activityLine(t, job.activity)
    case 'ready':
      return job.proposal ? proposalLine(t, job.proposal) : firstLine(job.message)
    case 'asking':
      return firstLine(job.message) || t('connectors.ai.status.asking')
    case 'stopped':
      return t('connectors.ai.stopped')
    case 'failed':
      return failureLine(t, job)
  }
}

/**
 * Лента работы для журнала: ответ хода по схеме - словами ИИ человеку, а не вызовом с JSON;
 * ответ, который ещё пишется (слов в нём пока нет), не виден.
 */
export const jobLogFeed = (feed: ConversationFeed): ConversationFeed => ({
  ...feed,
  items: feed.items.flatMap((item): FeedItem[] => {
    if (item.kind !== 'tool' || item.name !== ANSWER_TOOL) return [item]

    const message = item.input['message']

    return typeof message === 'string' && message.trim()
      ? [
          {
            kind: 'assistant',
            id: item.id,
            parentToolUseId: item.parentToolUseId,
            text: message,
            streaming: false,
          },
        ]
      : []
  }),
})
