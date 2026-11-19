import type { QuestionAnswers } from '@shared/conversation'
import type { InboxInvokeContract } from '@shared/ipc/inbox.contract'

import type { InboxService } from '../inbox/inbox-service'
import type { InvokeHandlers } from './handle'
import { assertString } from './validate'

type InboxChannels = keyof InboxInvokeContract

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const idsOf = (value: unknown): string[] => {
  if (!Array.isArray(value)) throw new Error('itemIds - список')

  return value.filter((id): id is string => typeof id === 'string').slice(0, 1000)
}

/** Ответ на вопросы: текст вопроса → подписи через запятую или свои слова. */
const answersOf = (value: unknown): QuestionAnswers | null => {
  if (value === null || value === undefined) return null
  if (!isRecord(value)) throw new Error('answers - объект')

  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .map(([question, answer]) => [question.slice(0, 2000), answer.slice(0, 10_000)]),
  )
}

/** Каналы уведомлений IDE (ADR 0069): проверить запрос и позвать сервис. */
export const createInboxHandlers = (inbox: InboxService): Pick<InvokeHandlers, InboxChannels> => ({
  'inbox:get': () => inbox.view(),
  'inbox:act': ({ itemId, actionId, text, answers }) => {
    assertString(itemId, 'itemId')
    assertString(actionId, 'actionId')
    assertString(text, 'text')

    return inbox.act({ itemId, actionId, text: text.slice(0, 20_000), answers: answersOf(answers) })
  },
  'inbox:dismiss': ({ itemIds }) => inbox.dismiss(idsOf(itemIds)),
  'inbox:markRead': ({ itemIds }) => inbox.markRead(idsOf(itemIds)),
  'inbox:clearDone': () => inbox.clearDone(),
  'inbox:remind': ({ title, body, deliverAt }) => {
    assertString(title, 'title')
    assertString(body, 'body')

    return inbox.remind({ title, body, deliverAt: Number(deliverAt) })
  },
})
