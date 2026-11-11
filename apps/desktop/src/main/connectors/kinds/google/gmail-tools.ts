import { mapLimit, numberArg, stringArg, stringListArg } from '../native-tools'
import type { NativeTool } from '../native-tools'
import { idArg, saveDraft, resolveLabels, DRAFT_PROPERTIES } from './gmail-drafts'
import type { Draft, Gmail, Label } from './gmail-drafts'
import { headerOf, messageView } from './gmail-format'
import type { GmailMessage } from './gmail-format'
import { GMAIL_API } from './google.constants'

type ThreadList = { threads?: { id: string }[]; nextPageToken?: string }
type Thread = { id: string; messages?: GmailMessage[] }

const SUMMARY_HEADERS = ['From', 'To', 'Subject', 'Date']

/** Сколько писем читать разом: на десятки параллельных Gmail отвечает 429. */
const GMAIL_PARALLEL = 8

const threadSummary = (thread: Thread) => {
  const messages = thread.messages ?? []
  const first = messages[0]
  const last = messages.at(-1)
  const labels = [...new Set(messages.flatMap((message) => message.labelIds ?? []))]

  return {
    thread_id: thread.id,
    subject: headerOf(first?.payload, 'Subject'),
    from: headerOf(first?.payload, 'From'),
    last_from: headerOf(last?.payload, 'From'),
    date: headerOf(last?.payload, 'Date'),
    snippet: last?.snippet ?? '',
    message_count: messages.length,
    unread: labels.includes('UNREAD'),
    labels,
  }
}

/**
 * Инструменты Gmail. Отправка (send_draft) - ступень outbound: по умолчанию выключена, её
 * включает только человек на виде Connectors (ADR 0028). Остальное пишет черновики и метки,
 * но ничего не уходит людям.
 */
export const GMAIL_TOOLS: NativeTool<Gmail>[] = [
  {
    name: 'search_threads',
    access: 'read',
    description:
      'Search mail threads with Gmail search syntax (from:, to:, subject:, is:unread, newer_than:7d, label:, has:attachment). Returns subject, senders, date, snippet.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Gmail search query; empty - latest threads' },
        max_results: { type: 'number', description: '1-50, default 15' },
        page_token: { type: 'string', description: 'next_page_token from a previous call' },
      },
    },
    run: async (args, gmail) => {
      const list = await gmail.request<ThreadList>(`${GMAIL_API}/threads`, {
        query: {
          q: stringArg(args, 'query'),
          maxResults: numberArg(args, 'max_results', { min: 1, max: 50, fallback: 15 }),
          pageToken: stringArg(args, 'page_token'),
        },
      })
      const threads = await mapLimit(list.threads ?? [], GMAIL_PARALLEL, (thread) =>
        gmail.request<Thread>(`${GMAIL_API}/threads/${encodeURIComponent(thread.id)}`, {
          query: { format: 'metadata', metadataHeaders: SUMMARY_HEADERS },
        }),
      )

      return { threads: threads.map(threadSummary), next_page_token: list.nextPageToken ?? null }
    },
  },
  {
    name: 'get_thread',
    access: 'read',
    description: 'Read a whole thread: every message with headers, text body and attachment list.',
    inputSchema: {
      type: 'object',
      properties: { thread_id: { type: 'string' } },
      required: ['thread_id'],
    },
    run: async (args, gmail) => {
      const thread = await gmail.request<Thread>(
        `${GMAIL_API}/threads/${idArg(args, 'thread_id')}`,
        { query: { format: 'full' } },
      )

      return { thread_id: thread.id, messages: (thread.messages ?? []).map(messageView) }
    },
  },
  {
    name: 'list_labels',
    access: 'read',
    description: 'List labels (system and user) with ids and names.',
    inputSchema: { type: 'object', properties: {} },
    run: async (_args, gmail) => {
      const { labels = [] } = await gmail.request<{ labels?: Label[] }>(`${GMAIL_API}/labels`)

      return labels.map(({ id, name, type }) => ({ id, name, type }))
    },
  },
  {
    name: 'list_drafts',
    access: 'read',
    description: 'List drafts with recipients, subject and snippet.',
    inputSchema: {
      type: 'object',
      properties: {
        max_results: { type: 'number', description: '1-50, default 20' },
        page_token: { type: 'string', description: 'next_page_token from a previous call' },
      },
    },
    run: async (args, gmail) => {
      const list = await gmail.request<{ drafts?: { id: string }[]; nextPageToken?: string }>(
        `${GMAIL_API}/drafts`,
        {
          query: {
            maxResults: numberArg(args, 'max_results', { min: 1, max: 50, fallback: 20 }),
            pageToken: stringArg(args, 'page_token'),
          },
        },
      )
      const full = await mapLimit(list.drafts ?? [], GMAIL_PARALLEL, (draft) =>
        gmail.request<Draft>(`${GMAIL_API}/drafts/${encodeURIComponent(draft.id)}`, {
          query: { format: 'metadata' },
        }),
      )

      return {
        drafts: full.map((draft) => ({
          draft_id: draft.id,
          thread_id: draft.message.threadId,
          to: headerOf(draft.message.payload, 'To'),
          subject: headerOf(draft.message.payload, 'Subject'),
          snippet: draft.message.snippet ?? '',
        })),
        next_page_token: list.nextPageToken ?? null,
      }
    },
  },
  {
    name: 'create_draft',
    access: 'write',
    description:
      'Create a draft (nothing is sent). With reply_to_message_id it becomes a reply in that thread.',
    inputSchema: { type: 'object', properties: DRAFT_PROPERTIES, required: ['body'] },
    run: (args, gmail) => saveDraft(gmail, args),
  },
  {
    name: 'update_draft',
    access: 'write',
    description: 'Replace a draft with new recipients, subject and body (nothing is sent).',
    inputSchema: {
      type: 'object',
      properties: { draft_id: { type: 'string' }, ...DRAFT_PROPERTIES },
      required: ['draft_id', 'body'],
    },
    run: (args, gmail) => saveDraft(gmail, args, stringArg(args, 'draft_id', true)),
  },
  {
    name: 'delete_draft',
    access: 'write',
    description: 'Delete a draft permanently.',
    inputSchema: {
      type: 'object',
      properties: { draft_id: { type: 'string' } },
      required: ['draft_id'],
    },
    run: async (args, gmail) => {
      await gmail.request(`${GMAIL_API}/drafts/${idArg(args, 'draft_id')}`, {
        method: 'DELETE',
      })

      return { deleted: true }
    },
  },
  {
    name: 'modify_thread_labels',
    access: 'write',
    description:
      'Add or remove labels on a thread by id or name. Archive = remove INBOX, mark read = remove UNREAD, star = add STARRED.',
    inputSchema: {
      type: 'object',
      properties: {
        thread_id: { type: 'string' },
        add: { type: 'array', items: { type: 'string' } },
        remove: { type: 'array', items: { type: 'string' } },
      },
      required: ['thread_id'],
    },
    run: async (args, gmail) => {
      const add = await resolveLabels(gmail, stringListArg(args, 'add'))
      const remove = await resolveLabels(gmail, stringListArg(args, 'remove'))
      const thread = await gmail.request<Thread>(
        `${GMAIL_API}/threads/${idArg(args, 'thread_id')}/modify`,
        { method: 'POST', body: { addLabelIds: add, removeLabelIds: remove } },
      )

      return { thread_id: thread.id, modified: true }
    },
  },
  {
    name: 'trash_thread',
    access: 'write',
    description: 'Move a thread to Trash (recoverable for 30 days).',
    inputSchema: {
      type: 'object',
      properties: { thread_id: { type: 'string' } },
      required: ['thread_id'],
    },
    run: async (args, gmail) => {
      await gmail.request(`${GMAIL_API}/threads/${idArg(args, 'thread_id')}/trash`, {
        method: 'POST',
      })

      return { trashed: true }
    },
  },
  {
    name: 'send_draft',
    access: 'outbound',
    description: 'Send an existing draft to its recipients.',
    inputSchema: {
      type: 'object',
      properties: { draft_id: { type: 'string' } },
      required: ['draft_id'],
    },
    run: async (args, gmail) => {
      const message = await gmail.request<GmailMessage>(`${GMAIL_API}/drafts/send`, {
        method: 'POST',
        body: { id: stringArg(args, 'draft_id', true) },
      })

      return { message_id: message.id, thread_id: message.threadId }
    },
  },
]
