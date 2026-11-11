import { z } from 'zod'

import { isAddress } from './frame'

/**
 * Что телефон говорит IDE. Каждое сообщение - JSON-объект с версией протокола `p` и видом
 * `k`. Рукопожатие идёт открытым телом (счётчик 0): ключей ещё нет, оно их и даёт. Всё
 * остальное - только запечатанным, иначе IDE его не прочтёт.
 */

export const PROTOCOL_VERSION = 1

const P = z.literal(PROTOCOL_VERSION)

const ADDRESS = z.string().refine(isAddress, 'not an address')

/** SPKI P-256 в base64 - около 124 знаков. */
const PUBLIC_KEY = z.string().min(40).max(400)

const ID = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/)

const CONVERSATION_ID = z.string().regex(/^[A-Za-z0-9-]{1,80}$/)

/** Пара: телефон доказывает, что видел QR, и приносит свои ключи. */
export const pairInitSchema = z.object({
  p: P,
  k: z.literal('pairInit'),
  deviceId: ADDRESS,
  label: z.string().max(200),
  staticPub: PUBLIC_KEY,
  ephemeralPub: PUBLIC_KEY,
  proof: z.string().max(100),
})

/** Спаренный телефон вернулся: свежий эфемерный ключ, за который ручается долгий. */
export const sessionInitSchema = z.object({
  p: P,
  k: z.literal('sessionInit'),
  deviceId: ADDRESS,
  ephemeralPub: PUBLIC_KEY,
})

export type PairInit = z.output<typeof pairInitSchema>

export type SessionInit = z.output<typeof sessionInitSchema>

/** Открытое слово телефона: пара или переподключение. Остальное открытым не принимается. */
export const parseHandshake = (value: unknown): PairInit | SessionInit | null => {
  const parsed = z.discriminatedUnion('k', [pairInitSchema, sessionInitSchema]).safeParse(value)

  return parsed.success ? parsed.data : null
}

const helloSchema = z.object({
  p: P,
  k: z.literal('hello'),
  client: z.object({ name: z.string().max(80), version: z.string().max(40) }).optional(),
})

const inventorySchema = z.object({ p: P, k: z.literal('inventory') })

/**
 * Стук телефона, пока экран открыт (раз в 25 с): IDE считает телефон на связи, пока слышит его
 * не реже раза в 45 с. Ответа нет - стук ничего не стоит.
 */
const pingSchema = z.object({ p: P, k: z.literal('ping') })

/**
 * Что смотреть: разговор (лента и состояние), прогон сценария или очереди проекта (`*` -
 * доска всех очередей). Ровно что-то одно. since и epoch - что у телефона уже есть: тот же
 * epoch и номер в журнале - придут только заплатки после него, иначе снимок.
 */
const watchFields = {
  conversationId: CONVERSATION_ID.optional(),
  runId: ID.optional(),
  projectKey: z
    .string()
    .regex(/^([pr]-[A-Za-z0-9_-]{22}|\*)$/)
    .optional(),
}

const oneTarget = (value: { conversationId?: unknown; runId?: unknown; projectKey?: unknown }) =>
  [value.conversationId, value.runId, value.projectKey].filter((field) => field !== undefined)
    .length === 1

const subscribeSchema = z
  .object({
    p: P,
    k: z.literal('subscribe'),
    ...watchFields,
    since: z.int().min(0).optional(),
    epoch: z.string().max(40).optional(),
  })
  .refine(oneTarget, 'subscribe to exactly one thing')

const unsubscribeSchema = z
  .object({ p: P, k: z.literal('unsubscribe'), ...watchFields })
  .refine(oneTarget, 'unsubscribe from exactly one thing')

/** Просьба выполнить команду: id - чтобы ответ (`result`) нашёл свою кнопку на телефоне. */
const cmdSchema = z.object({
  p: P,
  k: z.literal('cmd'),
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  name: z.string().max(80),
  args: z.unknown(),
})

/** Кусок сообщения тяжелее кадра: id сообщения, номер куска, сколько всего, текст куска. */
const partSchema = z.object({
  p: P,
  k: z.literal('part'),
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  i: z.int().min(0),
  n: z.int().min(2),
  d: z.string(),
})

export const phoneMessageSchema = z.union([
  helloSchema,
  inventorySchema,
  pingSchema,
  subscribeSchema,
  unsubscribeSchema,
  cmdSchema,
  partSchema,
])

export type PhoneMessage = z.output<typeof phoneMessageSchema>

export type PhoneMessageKind = PhoneMessage['k']

export type SubscribeMessage = z.output<typeof subscribeSchema>

export type UnsubscribeMessage = z.output<typeof unsubscribeSchema>

export type CmdMessage = z.output<typeof cmdSchema>

export type PartMessage = z.output<typeof partSchema>

/** Запечатанное слово телефона после открытия; null - не сообщение протокола. */
export const parsePhoneMessage = (value: unknown): PhoneMessage | null => {
  const parsed = phoneMessageSchema.safeParse(value)

  return parsed.success ? parsed.data : null
}

/** Сколько раз в минуту можно каждое слово, кроме команд (у них - свои числа). */
export const MESSAGE_LIMITS: Readonly<Record<Exclude<PhoneMessageKind, 'cmd'>, number>> = {
  hello: 30,
  inventory: 60,
  ping: 20,
  subscribe: 120,
  unsubscribe: 120,
  part: 400,
}

/** И рукопожатия - открытые слова, на которые IDE отвечает дорогой работой (ECDH). */
export const HANDSHAKE_LIMITS = { sessionInit: 12, revoked: 6 } as const
