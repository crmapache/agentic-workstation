import { pathId, stringArg, ArgumentError, stringListArg } from '../native-tools'
import {
  headerOf,
  mergeDraft,
  replySubject,
  splitAddresses,
  buildRawMessage,
  EMPTY_DRAFT_BASE,
} from './gmail-format'
import type { DraftBase, DraftChanges, GmailMessage } from './gmail-format'
import type { GoogleSession } from './google-session'
import { GMAIL_API } from './google.constants'

export type Gmail = GoogleSession

export type Label = { id: string; name: string; type?: string }

export type Draft = { id: string; message: GmailMessage }

/**
 * id из аргументов модели - в путь API только экранированным: id вида «../labels/X» иначе
 * ушёл бы к другому ресурсу, а подсказать такой id может письмо, которое модель прочитала.
 */
export const idArg = (args: Record<string, unknown>, key: string): string =>
  pathId(stringArg(args, key, true), key)

/** Метки по id или имени: модель знает «Важное», а API - Label_123. */
export const resolveLabels = async (gmail: Gmail, names: string[]): Promise<string[]> => {
  if (!names.length) return []

  const { labels = [] } = await gmail.request<{ labels?: Label[] }>(`${GMAIL_API}/labels`)

  return names.map((name) => {
    const label = labels.find(
      (candidate) =>
        candidate.id === name || candidate.name.toLowerCase() === name.trim().toLowerCase(),
    )

    if (!label) throw new ArgumentError(`Label "${name}" not found; call list_labels`)

    return label.id
  })
}

/** Список из аргументов, только если модель его передала: иначе поле берётся из основы. */
const listIfGiven = (args: Record<string, unknown>, key: string): string[] | undefined =>
  args[key] === undefined ? undefined : stringListArg(args, key)

const changesOf = (args: Record<string, unknown>): DraftChanges => ({
  to: listIfGiven(args, 'to'),
  cc: listIfGiven(args, 'cc'),
  bcc: listIfGiven(args, 'bcc'),
  subject: args['subject'] === undefined ? undefined : (stringArg(args, 'subject') ?? ''),
  body: stringArg(args, 'body', true),
})

/**
 * Основа ответа: тема «Re:», заголовки ответа, переписка и кому - Reply-To или From письма,
 * на которое отвечаем: ответ без адресата - не ответ.
 */
const replyBase = async (gmail: Gmail, messageId: string): Promise<DraftBase> => {
  const message = await gmail.request<GmailMessage>(
    `${GMAIL_API}/messages/${pathId(messageId, 'reply_to_message_id')}`,
    {
      query: {
        format: 'metadata',
        metadataHeaders: ['Message-ID', 'References', 'Subject', 'Reply-To', 'From'],
      },
    },
  )
  const id = headerOf(message.payload, 'Message-ID')
  const sender = headerOf(message.payload, 'Reply-To') || headerOf(message.payload, 'From')

  return {
    ...EMPTY_DRAFT_BASE,
    to: splitAddresses(sender),
    subject: replySubject(headerOf(message.payload, 'Subject')),
    threadId: message.threadId,
    inReplyTo: id || undefined,
    references:
      [headerOf(message.payload, 'References'), id].filter(Boolean).join(' ') || undefined,
  }
}

/** Основа правки: то, что уже стоит в черновике, вместе с привязкой к переписке. */
const draftBase = async (gmail: Gmail, draftId: string): Promise<DraftBase> => {
  // У drafts.get есть только format (metadataHeaders - у писем): лишний параметр Google
  // отверг бы. С format=metadata заголовки приходят все.
  const draft = await gmail.request<Draft>(`${GMAIL_API}/drafts/${pathId(draftId, 'draft_id')}`, {
    query: { format: 'metadata' },
  })
  const { payload, threadId } = draft.message

  return {
    to: splitAddresses(headerOf(payload, 'To')),
    cc: splitAddresses(headerOf(payload, 'Cc')),
    bcc: splitAddresses(headerOf(payload, 'Bcc')),
    subject: headerOf(payload, 'Subject'),
    threadId,
    inReplyTo: headerOf(payload, 'In-Reply-To') || undefined,
    references: headerOf(payload, 'References') || undefined,
  }
}

/**
 * Основа черновика. Правка - то, что в нём уже стоит; правка с письмом для ответа - его
 * же получатели и тема, а переписка и заголовки ответа - от письма. Новый - ответ или пусто.
 */
const baseFor = async (
  gmail: Gmail,
  replyTo: string | undefined,
  draftId: string | undefined,
): Promise<DraftBase> => {
  const reply = replyTo ? await replyBase(gmail, replyTo) : null

  if (!draftId) return reply ?? EMPTY_DRAFT_BASE

  const current = await draftBase(gmail, draftId)

  return reply
    ? {
        ...current,
        threadId: reply.threadId,
        inReplyTo: reply.inReplyTo,
        references: reply.references,
      }
    : current
}

/**
 * Создать или заменить черновик: поверх основы (baseFor) - только то, что модель передала.
 */
export const saveDraft = async (gmail: Gmail, args: Record<string, unknown>, draftId?: string) => {
  const base = await baseFor(gmail, stringArg(args, 'reply_to_message_id'), draftId)
  const { threadId, ...draft } = mergeDraft(base, changesOf(args))
  const message = { raw: buildRawMessage(draft), ...(threadId ? { threadId } : {}) }
  const path = draftId ? `/${pathId(draftId, 'draft_id')}` : ''
  const saved = await gmail.request<Draft>(`${GMAIL_API}/drafts${path}`, {
    method: draftId ? 'PUT' : 'POST',
    body: { ...(draftId ? { id: draftId } : {}), message },
  })

  return { draft_id: saved.id, message_id: saved.message.id, thread_id: saved.message.threadId }
}

export const DRAFT_PROPERTIES = {
  to: {
    type: 'array',
    items: { type: 'string' },
    description: 'Recipients; for a reply defaults to the sender, for an update - unchanged',
  },
  cc: { type: 'array', items: { type: 'string' } },
  bcc: { type: 'array', items: { type: 'string' } },
  subject: {
    type: 'string',
    description: 'Subject; for a reply defaults to "Re: …", for an update - unchanged',
  },
  body: { type: 'string', description: 'Plain text body' },
  reply_to_message_id: {
    type: 'string',
    description: 'Message to reply to: the draft joins its thread with proper reply headers',
  },
}
