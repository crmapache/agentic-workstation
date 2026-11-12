import { it, expect, describe } from 'vitest'

import { toBase64Url } from './base64'
import { decodeFrame, encodeFrame, FRAME_PUSH_GONE } from './frame'
import { parsePhoneMessage } from './phone-messages'
import type { PushNotice } from './push'
import {
  decodePushBody,
  encodePushBody,
  parsePushNotice,
  readPushPayload,
  encodePushPayload,
  isPushEndpointShape,
  PUSH_BODY_FIXED_BYTES,
  MAX_PUSH_PAYLOAD_BYTES,
  MAX_PUSH_ENDPOINT_CHARS,
  PUSH_PAYLOAD_HEADER_BYTES,
} from './push'

const AGENT = new Uint8Array(16).fill(0xa1)

const P256DH = Uint8Array.from({ length: 65 }, (_, index) => (index === 0 ? 4 : index))

const AUTH = new Uint8Array(16).fill(7)

const ENDPOINT = 'https://web.push.apple.com/QGuQyavXutnMH7j1g0kVHw'

const NOTICE: PushNotice = {
  p: 1,
  reason: 'permission',
  detail: '',
  provider: 'claude',
  project: 'demo',
  title: 'Fix the login bug',
  tool: 'Bash',
  until: 0,
  tag: 'c-6f1c2b8e-1d2a-4c3b-9e8f-0a1b2c3d4e5f',
  route: {
    screen: 'conversation',
    projectKey: `p-${'k'.repeat(22)}`,
    conversationId: '6f1c2b8e-1d2a-4c3b-9e8f-0a1b2c3d4e5f',
  },
  at: 1000,
}

describe('payload пуша', () => {
  it('версия и адрес IDE открыто, дальше nonce и печать', () => {
    const nonce = new Uint8Array(12).fill(9)
    const sealed = new Uint8Array(40).fill(3)
    const payload = encodePushPayload(AGENT, nonce, sealed)

    expect(payload[0]).toBe(1)
    expect([...payload.subarray(1, 17)]).toEqual([...AGENT])
    expect(PUSH_PAYLOAD_HEADER_BYTES).toBe(17)

    const parts = readPushPayload(payload)

    expect([...(parts?.header ?? [])]).toEqual([...payload.subarray(0, 17)])
    expect([...(parts?.agent ?? [])]).toEqual([...AGENT])
    expect([...(parts?.nonce ?? [])]).toEqual([...nonce])
    expect([...(parts?.sealed ?? [])]).toEqual([...sealed])
  })

  it('чужая версия, обрубок и переросший - не payload', () => {
    const payload = encodePushPayload(AGENT, new Uint8Array(12), new Uint8Array(16))

    expect(readPushPayload(Uint8Array.of(2, ...payload.subarray(1)))).toBeNull()
    expect(readPushPayload(payload.subarray(0, payload.length - 1))).toBeNull()
    expect(readPushPayload(new Uint8Array(MAX_PUSH_PAYLOAD_BYTES + 1).fill(1))).toBeNull()
  })
})

describe('тело кадра FRAME_PUSH', () => {
  it('раскладка по постоянным смещениям и обратно', () => {
    const topic = new Uint8Array(16).fill(5)
    const payload = new Uint8Array(100).fill(8)
    const body = encodePushBody({ topic, p256dh: P256DH, auth: AUTH, endpoint: ENDPOINT, payload })

    expect(body[0]).toBe(1)
    expect([...body.subarray(1, 17)]).toEqual([...topic])
    expect([...body.subarray(17, 82)]).toEqual([...P256DH])
    expect([...body.subarray(82, 98)]).toEqual([...AUTH])
    expect((body[98] ?? 0) * 256 + (body[99] ?? 0)).toBe(ENDPOINT.length)
    expect(body.length).toBe(PUSH_BODY_FIXED_BYTES + ENDPOINT.length + payload.length)

    const decoded = decodePushBody(body)

    expect(decoded?.endpoint).toBe(ENDPOINT)
    expect([...(decoded?.topic ?? [])]).toEqual([...topic])
    expect([...(decoded?.payload ?? [])]).toEqual([...payload])
  })

  it('нули темы - без темы; кривые длины и не UTF-8 - не тело', () => {
    const body = encodePushBody({
      topic: null,
      p256dh: P256DH,
      auth: AUTH,
      endpoint: ENDPOINT,
      payload: Uint8Array.of(1),
    })

    expect(decodePushBody(body)?.topic).toBeNull()
    expect(decodePushBody(body.subarray(0, PUSH_BODY_FIXED_BYTES + ENDPOINT.length))).toBeNull()
    expect(decodePushBody(Uint8Array.of(2, ...body.subarray(1)))).toBeNull()

    const broken = body.slice()

    broken[PUSH_BODY_FIXED_BYTES] = 0xff
    expect(decodePushBody(broken)).toBeNull()
    expect(() =>
      encodePushBody({
        topic: null,
        p256dh: P256DH.subarray(1),
        auth: AUTH,
        endpoint: ENDPOINT,
        payload: Uint8Array.of(1),
      }),
    ).toThrow()
    expect(() =>
      encodePushBody({
        topic: null,
        p256dh: P256DH,
        auth: AUTH,
        endpoint: ENDPOINT,
        payload: new Uint8Array(MAX_PUSH_PAYLOAD_BYTES + 1),
      }),
    ).toThrow()
  })

  it('слово релея «подписки нет» - кадр протокола', () => {
    const frame = encodeFrame(FRAME_PUSH_GONE, AGENT, new Uint8Array(16), 0n, new Uint8Array(0))

    expect(decodeFrame(frame).type).toBe(FRAME_PUSH_GONE)
  })
})

describe('подписка телефона', () => {
  const pushSet = (over: Record<string, unknown> = {}) =>
    parsePhoneMessage({
      p: 1,
      k: 'pushSet',
      endpoint: ENDPOINT,
      p256dh: toBase64Url(P256DH),
      auth: toBase64Url(AUTH),
      ...over,
    })

  it('https-адрес службы и ключи браузера нужной длины', () => {
    expect(pushSet()).toMatchObject({ k: 'pushSet', endpoint: ENDPOINT })
    expect(parsePhoneMessage({ p: 1, k: 'pushClear' })).toEqual({ p: 1, k: 'pushClear' })
  })

  it('http, логин в адресе, сжатая точка и короткий секрет - не подписка', () => {
    expect(pushSet({ endpoint: 'http://web.push.apple.com/x' })).toBeNull()
    expect(pushSet({ endpoint: 'https://user:pw@web.push.apple.com/x' })).toBeNull()
    expect(pushSet({ endpoint: `https://fcm.googleapis.com/${'x'.repeat(1100)}` })).toBeNull()
    expect(pushSet({ p256dh: toBase64Url(Uint8Array.of(2, ...P256DH.subarray(1))) })).toBeNull()
    expect(pushSet({ p256dh: toBase64Url(P256DH.subarray(0, 33)) })).toBeNull()
    expect(pushSet({ auth: toBase64Url(AUTH.subarray(1)) })).toBeNull()
    expect(isPushEndpointShape(`https://a.b/${'x'.repeat(MAX_PUSH_ENDPOINT_CHARS)}`)).toBe(false)
    expect(isPushEndpointShape('not a url')).toBe(false)
  })
})

describe('уведомление', () => {
  it('форма данных - да, кривой тег, маршрут и длинное имя - нет', () => {
    expect(parsePushNotice(NOTICE)).toEqual(NOTICE)
    expect(parsePushNotice({ ...NOTICE, tag: 'x-1' })).toBeNull()
    expect(parsePushNotice({ ...NOTICE, reason: 'turnDone' })).toBeNull()
    expect(parsePushNotice({ ...NOTICE, title: 'x'.repeat(200) })).toBeNull()
    expect(parsePushNotice({ ...NOTICE, route: { ...NOTICE.route, projectKey: '/Users' } })).toBe(
      null,
    )
    expect(
      parsePushNotice({
        ...NOTICE,
        route: { screen: 'queue', projectKey: NOTICE.route.projectKey },
      }),
    ).toBeNull()
    expect(parsePushNotice([NOTICE])).toBeNull()
  })
})
