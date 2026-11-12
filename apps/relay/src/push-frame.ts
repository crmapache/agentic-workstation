import { HEADER_BYTES, WIRE_VERSION, FRAME_PUSH_GONE } from './frame.ts'

/**
 * Тело кадра FRAME_PUSH - единственное тело, которое релей читает: подписку телефона, чтобы
 * отправить пуш. Раскладка - в packages/remote-protocol (push.ts), здесь своя копия, как и у
 * конверта: релей проверяется чтением одной папки, а тест сверяет его с протоколом. Payload в
 * конце запечатан для телефона ключом пары - релей передаёт его службе пушей как есть.
 */

export const PUSH_BODY_VERSION = 1

const TOPIC_BYTES = 16

const P256DH_BYTES = 65

const AUTH_BYTES = 16

const TOPIC_AT = 1

const P256DH_AT = TOPIC_AT + TOPIC_BYTES

const AUTH_AT = P256DH_AT + P256DH_BYTES

const ENDPOINT_LENGTH_AT = AUTH_AT + AUTH_BYTES

const FIXED_BYTES = ENDPOINT_LENGTH_AT + 2

export const MAX_ENDPOINT_CHARS = 1024

export const MAX_PAYLOAD_BYTES = 3072

/** Куда и что: ключи браузера и тема - base64url, как их ждёт web-push и заголовок Topic. */
export type PushOrder = {
  endpoint: string
  p256dh: string
  auth: string
  /** Тема (RFC 8030) или пусто. */
  topic: string
  payload: Buffer
}

const decoder = new TextDecoder('utf-8', { fatal: true })

/** Тело кадра; не та версия, длины не сходятся, ключ браузера - не точка P-256 - null. */
export const readPushBody = (body: Buffer): PushOrder | null => {
  if (body.length <= FIXED_BYTES || body.readUInt8(0) !== PUSH_BODY_VERSION) return null

  const endpointLength = body.readUInt16BE(ENDPOINT_LENGTH_AT)
  const payloadAt = FIXED_BYTES + endpointLength
  const payloadLength = body.length - payloadAt
  const topic = body.subarray(TOPIC_AT, P256DH_AT)
  const p256dh = body.subarray(P256DH_AT, AUTH_AT)

  if (
    endpointLength === 0 ||
    endpointLength > MAX_ENDPOINT_CHARS ||
    payloadLength <= 0 ||
    payloadLength > MAX_PAYLOAD_BYTES ||
    p256dh.readUInt8(0) !== 0x04
  ) {
    return null
  }

  try {
    return {
      endpoint: decoder.decode(body.subarray(FIXED_BYTES, payloadAt)),
      p256dh: p256dh.toString('base64url'),
      auth: body.subarray(AUTH_AT, ENDPOINT_LENGTH_AT).toString('base64url'),
      topic: topic.some((byte) => byte !== 0) ? topic.toString('base64url') : '',
      payload: Buffer.from(body.subarray(payloadAt)),
    }
  } catch {
    return null
  }
}

/**
 * Куда релею можно звонить. Адрес службы пушей - единственное место, где чужая строка
 * становится исходящим запросом этого сервера, а честных адресов немного, они публичны и их
 * называют сами браузеры: белый список здесь и точен, и короток. Список запрещённого (частные
 * сети и т.п.) пришлось бы перепроверять при каждом звонке, а он всё равно оставлял бы релей
 * готовым стучать куда угодно в интернете.
 */
export const PUSH_HOSTS: readonly string[] = [
  // Chrome и всё, что на нём.
  'fcm.googleapis.com',
  'android.googleapis.com',
  // Firefox.
  'updates.push.services.mozilla.com',
  // Safari: iPhone, iPad и Mac.
  'web.push.apple.com',
  // Edge: адреса вида wns2-xxx.notify.windows.com.
  'notify.windows.com',
]

/**
 * Адрес службы пушей из белого списка: https, порт по умолчанию, без логина, хост - из списка
 * или его поддомен целым именем (fcm.googleapis.com.evil.example и evilfcm.googleapis.com - нет).
 */
export const pushEndpointAllowed = (endpoint: string): boolean => {
  if (endpoint.length === 0 || endpoint.length > MAX_ENDPOINT_CHARS) return false

  let url: URL

  try {
    url = new URL(endpoint)
  } catch {
    return false
  }

  if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password) return false

  const host = url.hostname.toLowerCase()

  return PUSH_HOSTS.some((known) => host === known || host.endsWith(`.${known}`))
}

/** Слово релея IDE: подписки телефона больше нет. Кому - IDE, от кого - телефон, без тела. */
export const pushGoneFrame = (agent: Buffer, device: Buffer): Buffer => {
  const frame = Buffer.alloc(HEADER_BYTES)

  frame.writeUInt8(WIRE_VERSION, 0)
  frame.writeUInt8(FRAME_PUSH_GONE, 1)
  agent.copy(frame, 2)
  device.copy(frame, 18)

  return frame
}
