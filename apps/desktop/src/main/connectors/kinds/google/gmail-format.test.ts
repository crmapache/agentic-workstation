import { it, expect, describe } from 'vitest'

import {
  bodyText,
  BODY_LIMIT,
  htmlToText,
  mergeDraft,
  messageView,
  replySubject,
  attachmentsOf,
  splitAddresses,
  buildRawMessage,
} from './gmail-format'
import type { GmailPart } from './gmail-format'

const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64url')

const multipart: GmailPart = {
  mimeType: 'multipart/mixed',
  headers: [
    { name: 'From', value: 'Ann <ann@x.com>' },
    { name: 'subject', value: 'Hello' },
  ],
  parts: [
    {
      mimeType: 'multipart/alternative',
      parts: [
        { mimeType: 'text/plain', body: { data: b64('Plain body') } },
        { mimeType: 'text/html', body: { data: b64('<p>Html</p>') } },
      ],
    },
    {
      mimeType: 'application/pdf',
      filename: 'invoice.pdf',
      body: { attachmentId: 'att1', size: 1200 },
    },
  ],
}

describe('чтение письма', () => {
  it('берёт text/plain и вложения', () => {
    expect(bodyText(multipart)).toBe('Plain body')
    expect(attachmentsOf(multipart)).toEqual([
      { filename: 'invoice.pdf', mime_type: 'application/pdf', size: 1200 },
    ])
  })

  it('без text/plain - html без разметки', () => {
    const html: GmailPart = {
      mimeType: 'text/html',
      body: { data: b64('<style>p{}</style><p>One&nbsp;&amp; two</p><br>Three') },
    }

    expect(bodyText(html)).toBe('One & two\n\nThree')
    expect(htmlToText('<div>a</div><div>b</div>')).toBe('a\nb')
  })

  it('длинный текст режется с пометкой', () => {
    const long: GmailPart = {
      mimeType: 'text/plain',
      body: { data: b64('x'.repeat(BODY_LIMIT + 5)) },
    }

    expect(bodyText(long)).toContain('[truncated: 5 more characters]')
  })

  it('заголовки без учёта регистра', () => {
    const view = messageView({ id: 'm', threadId: 't', payload: multipart })

    expect(view).toMatchObject({ from: 'Ann <ann@x.com>', subject: 'Hello', labels: [] })
  })
})

describe('buildRawMessage', () => {
  const decode = (raw: string) => Buffer.from(raw, 'base64url').toString('utf8')

  it('собирает письмо с заголовками и телом base64', () => {
    const raw = decode(
      buildRawMessage({
        to: ['a@x.com', 'b@x.com'],
        cc: [],
        bcc: ['c@x.com'],
        subject: 'Hi',
        body: 'Body text',
        inReplyTo: '<id@x>',
        references: '<id@x>',
      }),
    )
    const [head = '', body = ''] = raw.split('\r\n\r\n')

    expect(head).toContain('To: a@x.com, b@x.com')
    expect(head).toContain('Bcc: c@x.com')
    expect(head).not.toContain('Cc: ')
    expect(head).toContain('In-Reply-To: <id@x>')
    expect(Buffer.from(body, 'base64').toString('utf8')).toBe('Body text')
  })

  it('тема не ASCII кодируется, переводы строк в заголовках вырезаются', () => {
    const raw = decode(
      buildRawMessage({
        to: ['a@x.com\r\nBcc: evil@x.com'],
        cc: [],
        bcc: [],
        subject: 'Привет',
        body: '',
      }),
    )

    expect(raw).toContain(`Subject: =?UTF-8?B?${Buffer.from('Привет').toString('base64')}?=`)
    expect(raw).not.toContain('\r\nBcc: evil')
  })
})

describe('replySubject', () => {
  it('Re: один раз', () => {
    expect(replySubject('Hello')).toBe('Re: Hello')
    expect(replySubject('RE: Hello')).toBe('RE: Hello')
  })
})

describe('splitAddresses', () => {
  it('запятая в имени в кавычках - не разделитель', () => {
    expect(splitAddresses('"Doe, John" <j@x.com>, ann@x.com')).toEqual([
      '"Doe, John" <j@x.com>',
      'ann@x.com',
    ])
    expect(splitAddresses('')).toEqual([])
  })
})

describe('mergeDraft', () => {
  const base = {
    to: ['a@x.com'],
    cc: ['c@x.com'],
    bcc: [],
    subject: 'Re: Plan',
    threadId: 't1',
    inReplyTo: '<m1>',
    references: '<m0> <m1>',
  }

  it('правка одного текста сохраняет получателей, тему и переписку', () => {
    expect(mergeDraft(base, { body: 'New text' })).toEqual({ ...base, body: 'New text' })
  })

  it('переданное поле заменяет, пустой список - очищает', () => {
    expect(mergeDraft(base, { body: 'x', to: ['b@x.com'], cc: [] })).toMatchObject({
      to: ['b@x.com'],
      cc: [],
      subject: 'Re: Plan',
    })
  })
})
