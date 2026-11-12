import { fromBase64Url } from './base64'
import { ADDRESS_BYTES } from './frame'
import { PROJECT_KEY_PATTERN } from './project-key'

/**
 * Push - как IDE будит телефон, которого нет на линии. Три стороны, и каждая видит только своё:
 *
 * 1. Телефон подписывается у службы пушей своего браузера (Apple, Google, Mozilla) открытым
 *    ключом VAPID релея (`/v1/info`) и отдаёт подписку каждой IDE запечатанным словом `pushSet`
 *    (phone-messages.ts). IDE хранит её у записи телефона, запечатанной safeStorage. Релей не
 *    хранит ничего: подписку он видит, только когда IDE просит что-то послать.
 * 2. IDE запечатывает уведомление для телефона ключом пары (pushKey ниже) - это payload. Его
 *    открывает только сервис-воркер телефона, ключами пары из IndexedDB.
 * 3. Кадр FRAME_PUSH несёт релею подписку (куда) и payload (что - для релея непрозрачно). Релей
 *    шифрует его ещё раз для браузера (RFC 8291, библиотека web-push) и подписывает VAPID.
 *
 * Релей видит, кому и когда, адрес службы пушей и размер, но не текст. Служба пушей видит ещё
 * меньше: её слой шифрования снимает только браузер.
 *
 * Ключ пуша: pushKey = HKDF-SHA256(пустая соль, долгий ключ пары, PUSH_KEY_LABEL), 32 байта,
 * AES-256-GCM. Долгий ключ - тот же, что ручается за переподключение (crypto-spec.ts): его
 * знают только IDE и этот телефон. Своя метка - свой ключ: шифрование пушей не делит ключ ни с
 * одним кадром.
 */

export const PUSH_KEY_LABEL = 'aw/v1/push'

/**
 * Тема пуша (заголовок Topic, RFC 8030): служба держит для выключенного телефона только
 * последнее сообщение темы. Тема - первые 16 байт HMAC-SHA256(pushKey, macInput([метка, тег])):
 * одна на разговор или очередь и непрозрачна для релея и службы - по ней не узнать, какой это
 * разговор, и не связать двух телефонов.
 */
export const PUSH_TOPIC_LABEL = 'aw/v1/push-topic'

export const PUSH_PAYLOAD_VERSION = 1

/** Открытая часть payload: версия и адрес IDE - по нему воркер находит пару. */
export const PUSH_PAYLOAD_HEADER_BYTES = 1 + ADDRESS_BYTES

/** Случайный nonce: ключ пуша живёт всю пару, а счётчика у пушей нет. 96 бит - без повторов. */
export const PUSH_NONCE_BYTES = 12

export const PUSH_TAG_BYTES = 16

/**
 * Потолок payload. Служба пушей принимает запись до 4096 байт, а RFC 8291 добавляет к ней
 * заголовок, отступ и тег (около 100 байт): трёх килобайт хватает уведомлению с запасом.
 */
export const MAX_PUSH_PAYLOAD_BYTES = 3072

/** Длина адреса службы пушей. Настоящие - 150-400 знаков. */
export const MAX_PUSH_ENDPOINT_CHARS = 1024

/** Открытый ключ браузера для RFC 8291 - точка P-256 без сжатия. */
export const PUSH_P256DH_BYTES = 65

/** Секрет браузера для RFC 8291. */
export const PUSH_AUTH_BYTES = 16

export const PUSH_TOPIC_BYTES = 16

/**
 * Раскладка payload (то, что получает воркер телефона, когда браузер снял свой слой):
 *
 * | байт   | что                                                     |
 * | ------ | ------------------------------------------------------- |
 * | 0      | версия payload (1)                                      |
 * | 1-16   | адрес IDE (16 байт)                                     |
 * | 17-28  | nonce (12 случайных байт)                               |
 * | 29-... | AES-256-GCM: JSON уведомления (PushNotice) и тег 16 байт |
 *
 * Дополнительные данные печати - байты 0-16: адрес IDE не подменить, не сломав тег.
 */
export const pushPayloadHeader = (agent: Uint8Array): Uint8Array => {
  if (agent.length !== ADDRESS_BYTES) throw new Error('an address is exactly 16 bytes')

  const header = new Uint8Array(PUSH_PAYLOAD_HEADER_BYTES)

  header[0] = PUSH_PAYLOAD_VERSION
  header.set(agent, 1)

  return header
}

export const encodePushPayload = (
  agent: Uint8Array,
  nonce: Uint8Array,
  sealed: Uint8Array,
): Uint8Array => {
  if (nonce.length !== PUSH_NONCE_BYTES) throw new Error('a push nonce is 12 bytes')

  const out = new Uint8Array(PUSH_PAYLOAD_HEADER_BYTES + PUSH_NONCE_BYTES + sealed.length)

  out.set(pushPayloadHeader(agent), 0)
  out.set(nonce, PUSH_PAYLOAD_HEADER_BYTES)
  out.set(sealed, PUSH_PAYLOAD_HEADER_BYTES + PUSH_NONCE_BYTES)

  return out
}

export type PushPayloadParts = {
  header: Uint8Array
  agent: Uint8Array
  nonce: Uint8Array
  sealed: Uint8Array
}

/** Части payload; чужая версия или короче печати с тегом - null. */
export const readPushPayload = (bytes: Uint8Array): PushPayloadParts | null => {
  const sealedAt = PUSH_PAYLOAD_HEADER_BYTES + PUSH_NONCE_BYTES

  if (bytes.length < sealedAt + PUSH_TAG_BYTES || bytes.length > MAX_PUSH_PAYLOAD_BYTES) {
    return null
  }

  if (bytes[0] !== PUSH_PAYLOAD_VERSION) return null

  return {
    header: bytes.slice(0, PUSH_PAYLOAD_HEADER_BYTES),
    agent: bytes.slice(1, PUSH_PAYLOAD_HEADER_BYTES),
    nonce: bytes.slice(PUSH_PAYLOAD_HEADER_BYTES, sealedAt),
    sealed: bytes.slice(sealedAt),
  }
}

/** Подписка браузера телефона, как её отдаёт PushSubscription.toJSON(): ключи - base64url. */
export type PushSubscriptionWire = { endpoint: string; p256dh: string; auth: string }

/** Адрес службы пушей похож на адрес: https, без логина, не длиннее потолка. Белый список хостов - у релея. */
export const isPushEndpointShape = (endpoint: string): boolean => {
  if (endpoint.length === 0 || endpoint.length > MAX_PUSH_ENDPOINT_CHARS) return false

  try {
    const url = new URL(endpoint)

    return url.protocol === 'https:' && url.username === '' && url.password === ''
  } catch {
    return false
  }
}

const bytesOfLength = (text: string, length: number): Uint8Array | null => {
  const bytes = /^[A-Za-z0-9_-]+$/.test(text) ? fromBase64Url(text) : null

  return bytes?.length === length ? bytes : null
}

/** Ключ браузера - точка P-256 без сжатия (65 байт, первый - 0x04); иначе null. */
export const p256dhBytes = (text: string): Uint8Array | null => {
  const bytes = bytesOfLength(text, PUSH_P256DH_BYTES)

  return bytes?.[0] === 0x04 ? bytes : null
}

export const pushAuthBytes = (text: string): Uint8Array | null =>
  bytesOfLength(text, PUSH_AUTH_BYTES)

/** Подписка годится к хранению: форма адреса и длины ключей. */
export const isPushSubscription = (value: PushSubscriptionWire): boolean =>
  isPushEndpointShape(value.endpoint) &&
  p256dhBytes(value.p256dh) !== null &&
  pushAuthBytes(value.auth) !== null

/**
 * Почему телефону пора посмотреть на IDE - от самого важного к будничному (порядок ACC): из
 * нескольких поводов одного разговора или очереди сразу уходит первый по списку.
 *
 * - trouble - процесс разговора вышел сам или ход кончился ошибкой не про лимит;
 * - limit - разговор или прогон упёрся в лимит и ждёт (until - до когда, если известно);
 * - extraUsage - аккаунт начал платить за работу сверх лимита;
 * - permission, question, plan - разговор ждёт ответа; question с экраном прогона - вопрос
 *   головы сценария;
 * - held - очередь встала (detail: stopAfter, failed, refused).
 *
 * Конец хода не будит: человек вернётся к телефону сам, а будильник на каждый ответ модели
 * отучил бы смотреть на уведомления.
 */
export type PushReason =
  'trouble' | 'limit' | 'extraUsage' | 'permission' | 'question' | 'plan' | 'held'

export const PUSH_REASONS: readonly PushReason[] = [
  'trouble',
  'limit',
  'extraUsage',
  'permission',
  'question',
  'plan',
  'held',
]

/** Куда ведёт нажатие: экран телефона по ключу проекта и id - путей здесь нет. */
export type PushRoute =
  | { screen: 'conversation'; projectKey: string; conversationId: string }
  | { screen: 'queue'; projectKey: string; queueId: string }
  | { screen: 'run'; projectKey: string; runId: string }

/**
 * Уведомление - данными, а не текстом: слова собирает воркер телефона по своим строкам (i18n
 * телефона), IDE не пишет интерфейс за него. Имена - короткие и с метками вместо папок
 * машины (bridge/redact.ts), как везде на дороге к телефону. tag - один на разговор или
 * очередь: новое уведомление того же тега заменяет прежнее на экране телефона.
 */
export type PushNotice = {
  p: 1
  reason: PushReason
  /** У held - почему встала очередь: stopAfter | failed | refused; иначе пусто. */
  detail: string
  /** Id провайдера разговора или прогона: «claude». */
  provider: string
  /** Имя проекта (папки), не путь. */
  project: string
  /** Заголовок разговора, имя сценария или имя очереди. */
  title: string
  /** Инструмент вопроса разрешения: «Bash». */
  tool: string
  /** До когда ждёт лимит (мс); 0 - не лимит или момент не известен. */
  until: number
  tag: string
  route: PushRoute
  at: number
}

/** Сколько знаков у каждого имени в уведомлении: экран блокировки всё равно режет. */
export const PUSH_TEXT_MAX = 80

export const PUSH_TAG_PATTERN = /^[cqr]-[A-Za-z0-9_-]{1,80}$/

const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/

const isText = (value: unknown, max = PUSH_TEXT_MAX): value is string =>
  typeof value === 'string' && value.length <= max

const isRoute = (value: unknown): value is PushRoute => {
  if (typeof value !== 'object' || value === null) return false

  const route = value as Record<string, unknown>

  if (typeof route['projectKey'] !== 'string' || !PROJECT_KEY_PATTERN.test(route['projectKey'])) {
    return false
  }

  const id = (name: string) => typeof route[name] === 'string' && ID_PATTERN.test(route[name])

  switch (route['screen']) {
    case 'conversation':
      return id('conversationId')
    case 'queue':
      return id('queueId')
    case 'run':
      return id('runId')
    default:
      return false
  }
}

/**
 * Уведомление из открытого payload. Проверка - формы, а не доверия: доверие дал тег AES-GCM
 * ключом пары. Что-то не так - null, и воркер показывает общее «IDE ждёт тебя».
 */
export const parsePushNotice = (value: unknown): PushNotice | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null

  const notice = value as Record<string, unknown>

  return notice['p'] === 1 &&
    PUSH_REASONS.includes(notice['reason'] as PushReason) &&
    isText(notice['detail'], 20) &&
    isText(notice['provider'], 40) &&
    isText(notice['project']) &&
    isText(notice['title']) &&
    isText(notice['tool']) &&
    typeof notice['until'] === 'number' &&
    typeof notice['at'] === 'number' &&
    typeof notice['tag'] === 'string' &&
    PUSH_TAG_PATTERN.test(notice['tag']) &&
    isRoute(notice['route'])
    ? (notice as PushNotice)
    : null
}

/**
 * Раскладка тела кадра FRAME_PUSH (IDE → релей). Релей читает его по постоянным смещениям,
 * как заголовок кадра, - и только то, что нужно, чтобы отправить; payload для него непрозрачен.
 *
 * | байт      | что                                                        |
 * | --------- | ---------------------------------------------------------- |
 * | 0         | версия раскладки (1)                                       |
 * | 1-16      | тема (16 байт; нули - без темы)                             |
 * | 17-81     | p256dh браузера (65 байт)                                  |
 * | 82-97     | auth браузера (16 байт)                                    |
 * | 98-99     | длина адреса службы пушей, u16 big-endian                  |
 * | 100-...   | адрес службы пушей, UTF-8                                  |
 * | дальше    | payload, запечатанный для телефона (до 3072 байт)          |
 *
 * Кому (заголовок кадра) - адрес телефона, от кого - адрес IDE: по нему релей считает предел
 * пушей. Ответ релея - только один, FRAME_PUSH_GONE: служба сказала, что подписки больше нет.
 */
export const PUSH_BODY_VERSION = 1

const TOPIC_AT = 1

const P256DH_AT = TOPIC_AT + PUSH_TOPIC_BYTES

const AUTH_AT = P256DH_AT + PUSH_P256DH_BYTES

const ENDPOINT_LENGTH_AT = AUTH_AT + PUSH_AUTH_BYTES

export const PUSH_BODY_FIXED_BYTES = ENDPOINT_LENGTH_AT + 2

export type PushBody = {
  /** null - без темы. */
  topic: Uint8Array | null
  p256dh: Uint8Array
  auth: Uint8Array
  endpoint: string
  payload: Uint8Array
}

const encoder = new TextEncoder()

const decoder = new TextDecoder('utf-8', { fatal: true })

export const encodePushBody = (body: PushBody): Uint8Array => {
  const endpoint = encoder.encode(body.endpoint)

  if (
    (body.topic !== null && body.topic.length !== PUSH_TOPIC_BYTES) ||
    body.p256dh.length !== PUSH_P256DH_BYTES ||
    body.auth.length !== PUSH_AUTH_BYTES ||
    endpoint.length === 0 ||
    endpoint.length > MAX_PUSH_ENDPOINT_CHARS ||
    body.payload.length === 0 ||
    body.payload.length > MAX_PUSH_PAYLOAD_BYTES
  ) {
    throw new Error('a push body is a topic, browser keys, an endpoint and a payload in bounds')
  }

  const out = new Uint8Array(PUSH_BODY_FIXED_BYTES + endpoint.length + body.payload.length)
  const view = new DataView(out.buffer)

  out[0] = PUSH_BODY_VERSION
  if (body.topic) out.set(body.topic, TOPIC_AT)
  out.set(body.p256dh, P256DH_AT)
  out.set(body.auth, AUTH_AT)
  view.setUint16(ENDPOINT_LENGTH_AT, endpoint.length, false)
  out.set(endpoint, PUSH_BODY_FIXED_BYTES)
  out.set(body.payload, PUSH_BODY_FIXED_BYTES + endpoint.length)

  return out
}

/** Тело кадра FRAME_PUSH; не та версия, длины не сходятся, адрес не UTF-8 - null. */
export const decodePushBody = (bytes: Uint8Array): PushBody | null => {
  if (bytes.length <= PUSH_BODY_FIXED_BYTES || bytes[0] !== PUSH_BODY_VERSION) return null

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const endpointLength = view.getUint16(ENDPOINT_LENGTH_AT, false)
  const payloadAt = PUSH_BODY_FIXED_BYTES + endpointLength
  const payloadLength = bytes.length - payloadAt

  if (
    endpointLength === 0 ||
    endpointLength > MAX_PUSH_ENDPOINT_CHARS ||
    payloadLength <= 0 ||
    payloadLength > MAX_PUSH_PAYLOAD_BYTES
  ) {
    return null
  }

  try {
    const topic = bytes.slice(TOPIC_AT, P256DH_AT)

    return {
      topic: topic.some((byte) => byte !== 0) ? topic : null,
      p256dh: bytes.slice(P256DH_AT, AUTH_AT),
      auth: bytes.slice(AUTH_AT, ENDPOINT_LENGTH_AT),
      endpoint: decoder.decode(bytes.subarray(PUSH_BODY_FIXED_BYTES, payloadAt)),
      payload: bytes.slice(payloadAt),
    }
  } catch {
    return null
  }
}
