/** Часть письма в ответе Gmail API (format=full или metadata). */
export type GmailPart = {
  mimeType?: string
  filename?: string
  headers?: { name: string; value: string }[]
  body?: { size?: number; data?: string; attachmentId?: string }
  parts?: GmailPart[]
}

export type GmailMessage = {
  id: string
  threadId: string
  labelIds?: string[]
  snippet?: string
  payload?: GmailPart
}

/** Сколько текста письма отдавать модели: длинные рассылки съели бы весь контекст. */
export const BODY_LIMIT = 20_000

export const headerOf = (part: GmailPart | undefined, name: string): string => {
  const lower = name.toLowerCase()

  return part?.headers?.find((header) => header.name.toLowerCase() === lower)?.value ?? ''
}

const decode = (data: string): string => Buffer.from(data, 'base64url').toString('utf8')

/** HTML в читаемый текст без библиотек: письмо читает модель, а не человек. */
export const htmlToText = (html: string): string =>
  html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const findPart = (part: GmailPart | undefined, mimeType: string): GmailPart | null => {
  if (!part) return null

  if (part.mimeType === mimeType && part.body?.data && !part.filename) return part

  for (const child of part.parts ?? []) {
    const found = findPart(child, mimeType)

    if (found) return found
  }

  return null
}

/** Текст письма: text/plain, а если его нет - text/html без разметки. Длинное режется. */
export const bodyText = (payload: GmailPart | undefined): string => {
  const plain = findPart(payload, 'text/plain')
  const html = plain ? null : findPart(payload, 'text/html')
  const text = plain?.body?.data
    ? decode(plain.body.data)
    : html?.body?.data
      ? htmlToText(decode(html.body.data))
      : ''

  return text.length > BODY_LIMIT
    ? `${text.slice(0, BODY_LIMIT)}\n\n[truncated: ${text.length - BODY_LIMIT} more characters]`
    : text
}

export type AttachmentInfo = { filename: string; mime_type: string; size: number }

/** Вложения письма: имя, тип и размер - самих файлов модель не получает. */
export const attachmentsOf = (part: GmailPart | undefined): AttachmentInfo[] => {
  if (!part) return []

  const own: AttachmentInfo[] =
    part.filename && part.body?.attachmentId
      ? [{ filename: part.filename, mime_type: part.mimeType ?? '', size: part.body.size ?? 0 }]
      : []

  return [...own, ...(part.parts ?? []).flatMap(attachmentsOf)]
}

/** Письмо для модели: кто, кому, когда, о чём, текст и вложения. */
export const messageView = (message: GmailMessage) => ({
  message_id: message.id,
  thread_id: message.threadId,
  from: headerOf(message.payload, 'From'),
  to: headerOf(message.payload, 'To'),
  cc: headerOf(message.payload, 'Cc') || undefined,
  date: headerOf(message.payload, 'Date'),
  subject: headerOf(message.payload, 'Subject'),
  labels: message.labelIds ?? [],
  body: bodyText(message.payload),
  attachments: attachmentsOf(message.payload),
})

export type DraftInput = {
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  body: string
  inReplyTo?: string | undefined
  references?: string | undefined
}

/** Значение заголовка без переводов строк: иначе в письмо можно дописать свой заголовок. */
const headerValue = (value: string): string => value.replace(/[\r\n]+/g, ' ').trim()

/** Тема не ASCII - словом RFC 2047, иначе почтовые программы покажут кракозябры. */
const encodeSubject = (subject: string): string =>
  /^[\x20-\x7e]*$/.test(subject)
    ? subject
    : `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`

/** Тело base64 строками по 76 знаков (RFC 2045). */
const wrapBase64 = (text: string): string =>
  (
    Buffer.from(text, 'utf8')
      .toString('base64')
      .match(/.{1,76}/g) ?? []
  ).join('\r\n')

/** Письмо RFC 5322 в base64url - так его принимает drafts.create. */
export const buildRawMessage = (draft: DraftInput): string => {
  const headers = [
    draft.to.length ? `To: ${headerValue(draft.to.join(', '))}` : '',
    draft.cc.length ? `Cc: ${headerValue(draft.cc.join(', '))}` : '',
    draft.bcc.length ? `Bcc: ${headerValue(draft.bcc.join(', '))}` : '',
    `Subject: ${encodeSubject(headerValue(draft.subject))}`,
    draft.inReplyTo ? `In-Reply-To: ${headerValue(draft.inReplyTo)}` : '',
    draft.references ? `References: ${headerValue(draft.references)}` : '',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
  ].filter(Boolean)

  return Buffer.from(`${headers.join('\r\n')}\r\n\r\n${wrapBase64(draft.body)}`, 'utf8').toString(
    'base64url',
  )
}

/** Тема ответа: «Re:» один раз, а не «Re: Re: Re:». */
export const replySubject = (subject: string): string =>
  /^re:/i.test(subject.trim()) ? subject.trim() : `Re: ${subject.trim()}`

/**
 * Список адресов из заголовка: запятые внутри кавычек и угловых скобок - часть адреса
 * («"Doe, John" <j@x.com>»), а не разделитель.
 */
export const splitAddresses = (value: string): string[] => {
  const addresses: string[] = []
  let current = ''
  let quoted = false
  let angle = 0

  for (const char of value) {
    if (char === '"') quoted = !quoted
    else if (char === '<' && !quoted) angle += 1
    else if (char === '>' && !quoted) angle = Math.max(0, angle - 1)

    if (char === ',' && !quoted && angle === 0) {
      addresses.push(current)
      current = ''
    } else {
      current += char
    }
  }

  return [...addresses, current].map((address) => address.trim()).filter(Boolean)
}

/** То, что черновик наследует: получатели, тема и связь с перепиской. */
export type DraftBase = {
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  threadId?: string | undefined
  inReplyTo?: string | undefined
  references?: string | undefined
}

export const EMPTY_DRAFT_BASE: DraftBase = { to: [], cc: [], bcc: [], subject: '' }

/** Поля, которые модель передала (undefined - не передала, пустой список - очистить). */
export type DraftChanges = {
  to?: string[] | undefined
  cc?: string[] | undefined
  bcc?: string[] | undefined
  subject?: string | undefined
  body: string
}

/**
 * Черновик из основы и правок: чего модель не передала, остаётся как было. «Поправь текст»
 * не должно стирать получателей, тему и привязку ответа к переписке.
 */
export const mergeDraft = (
  base: DraftBase,
  changes: DraftChanges,
): DraftInput & { threadId?: string | undefined } => ({
  to: changes.to ?? base.to,
  cc: changes.cc ?? base.cc,
  bcc: changes.bcc ?? base.bcc,
  subject: changes.subject ?? base.subject,
  body: changes.body,
  inReplyTo: base.inReplyTo,
  references: base.references,
  threadId: base.threadId,
})
