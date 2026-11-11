import type {
  Machine,
  RunWire,
  QueueWire,
  FeedItemWire,
  FeedTaskWire,
  ProviderCaps,
  RunSummaryWire,
  ConversationWire,
  InventoryProject,
} from './wire-types'

/**
 * Что IDE говорит телефону. Как и в обратную сторону - JSON-объект с `p` (версия протокола) и
 * `k` (вид). Открытым телом - только ответы рукопожатия, остальное запечатано.
 */

type Versioned = { p: 1 }

/** Ответ на пару, когда человек нажал Approve: ключи IDE и её доказательство. */
export type PairAck = Versioned & {
  k: 'pairAck'
  agentId: string
  label: string
  staticPub: string
  ephemeralPub: string
  proof: string
}

/** Ответ на переподключение: эфемерный ключ IDE; for - на какой ключ телефона это ответ. */
export type SessionAck = Versioned & { k: 'sessionAck'; ephemeralPub: string; for: string }

/** «Твои ключи не наши - предложи новые» (IDE перезапускалась или кадр не открылся). */
export type SessionStale = Versioned & { k: 'sessionStale' }

/**
 * Телефон отпустили в IDE: ключей больше нет, нужна новая пара. Бывает открытым (ответ на
 * sessionInit отпущенного) и запечатанным. tag - HMAC долгим ключом пары (crypto-spec.ts):
 * телефон стирает пару, только если тег сошёлся. Без верного тега слово ничего не значит -
 * открытым его мог прислать кто угодно.
 */
export type Revoked = Versioned & { k: 'revoked'; tag: string }

/** Почему пару не пустили: человек нажал Refuse или код истёк, пока телефон ждал Approve. */
export type PairRefusal = 'refused' | 'expired'

/**
 * Пару не пустили: телефону незачем ждать Approve. proof - HMAC секретом QR (crypto-spec.ts):
 * сказать это может только тот, кто видел код на экране IDE, и телефон без верного proof ждёт
 * дальше.
 */
export type PairRefused = Versioned & { k: 'pairRefused'; reason: PairRefusal; proof: string }

export type HandshakeReply = PairAck | SessionAck | SessionStale | Revoked | PairRefused

/**
 * Что есть на машине: проекты с разговорами и очередями, провайдеры. Шлётся на hello и
 * inventory и сам - каждому на линии, когда что-то в нём поменялось. at - часы IDE: по ним
 * телефон считает «идёт 2m 40s». epoch - жизнь этой IDE: другой - номера журналов лент
 * начались заново, телефону - снимок, а не заплатки.
 */
export type InventoryMessage = Versioned & {
  k: 'inventory'
  at: number
  epoch: string
  machine: Machine
  /** Что умеет эта IDE: parts - сообщение частями. */
  caps: string[]
  providers: ProviderCaps[]
  projects: InventoryProject[]
}

/**
 * Снимок ленты: последние элементы, сколько влезло. seq - номер журнала, на котором снят
 * снимок; следующая заплатка - seq + 1. hasEarlier - выше есть ещё (на телефон не уходит).
 *
 * Приходит не только в ответ на подписку: телефон, проснувшийся после того, как журнал ушёл
 * дальше его номера, получает снимок сам. Снимок всегда заменяет ленту целиком, и заплатки
 * дальше считаются от его seq.
 */
export type FeedSnapshotMessage = Versioned & {
  k: 'feed'
  conversationId: string
  epoch: string
  seq: number
  items: FeedItemWire[]
  tasks: FeedTaskWire[]
  hasEarlier: boolean
}

/** Заплатка ленты по id элементов. Пропущен номер - телефон подписывается заново с since. */
export type FeedPatchMessage = Versioned & {
  k: 'patch'
  conversationId: string
  epoch: string
  seq: number
  upserts: FeedItemWire[]
  removes?: string[] | undefined
  tasks?: FeedTaskWire[] | undefined
  hasEarlier?: boolean | undefined
}

export type ConversationMessage = Versioned & { k: 'conversation'; conversation: ConversationWire }

/** Разговора больше нет (закрыли вкладку, закрыли проект): подписка на него снята. */
export type ConversationGoneMessage = Versioned & { k: 'conversationGone'; conversationId: string }

/** Очереди сценариев: одного проекта (scope - его ключ) или всех (`*`). */
export type QueuesMessage = Versioned & {
  k: 'queues'
  scope: string
  queues: QueueWire[]
  live: RunSummaryWire[]
}

export type RunMessage = Versioned & { k: 'run'; run: RunWire }

/**
 * Отказ команды. questionGone - ответ на вопрос, которого уже нет (ответили за столом, вопрос
 * снят, стоит другой); runMoved - кнопка прогона нарисована для состояния, которого уже нет
 * (нажали «продолжить», а прогон уже идёт).
 */
export type RemoteErrorCode =
  | 'unknownCommand'
  | 'badArgs'
  | 'rateLimited'
  | 'notFound'
  | 'notOpen'
  | 'refused'
  | 'failed'
  | 'questionGone'
  | 'runMoved'

/**
 * Ответ на команду по её id. Отказ - кодом; refused с detail - отказ самой IDE её словом
 * (у сценариев: queueBusy, untrusted, runOver…; у нового разговора - permissionMode).
 */
export type ResultMessage = Versioned & { k: 'result'; id: string } & (
    { ok: true; data?: unknown } | { ok: false; code: RemoteErrorCode; detail?: string | undefined }
  )

/**
 * Слово IDE не в ответ на команду, ничего не теряется молча:
 *
 * - partsRefused - сообщение частями не собралось (части пропали, не сошлись, перерос
 *   MAX_ASSEMBLED_BYTES, вытеснено следующим или не дождалось частей); about - id сообщения;
 * - rateLimited - слово отброшено пределом частоты или веса; about - id команды или сообщения
 *   частями, если он был;
 * - notFound - подписка на то, чего нет; about - id прогона или ключ проекта.
 *
 * Телефон по about находит свою команду и кончает её отказом сразу, а не через минуту.
 */
export type NoticeCode = 'partsRefused' | 'rateLimited' | 'notFound'

export type NoticeMessage = Versioned & {
  k: 'notice'
  level: 'info' | 'warning'
  code: NoticeCode
  about?: string | undefined
}

/**
 * Посланное телефону могло пропасть (очередь до него обвалилась, релей потерял кадры, линия
 * IDE переподключилась). Телефон: что смотрит - подписывается заново со своего номера, а
 * команды без итога повторяет с тем же id. IDE помнит итог команды COMMAND_MEMORY_MS: повтор
 * получает его же, а не второе выполнение.
 */
export type ResyncMessage = Versioned & { k: 'resync' }

/** Ответ на ping телефона - тем же n: IDE на связи и слышит его. */
export type PongMessage = Versioned & { k: 'pong'; n: number }

export type AgentMessage =
  | InventoryMessage
  | FeedSnapshotMessage
  | FeedPatchMessage
  | ConversationMessage
  | ConversationGoneMessage
  | QueuesMessage
  | RunMessage
  | ResultMessage
  | NoticeMessage
  | ResyncMessage
  | PongMessage
  | Revoked

export type AgentMessageKind = AgentMessage['k']

const AGENT_KINDS: ReadonlySet<string> = new Set<AgentMessageKind>([
  'inventory',
  'feed',
  'patch',
  'conversation',
  'conversationGone',
  'queues',
  'run',
  'result',
  'notice',
  'resync',
  'pong',
  'revoked',
])

const HANDSHAKE_KINDS: ReadonlySet<string> = new Set<HandshakeReply['k']>([
  'pairAck',
  'sessionAck',
  'sessionStale',
  'revoked',
  'pairRefused',
])

const isVersioned = (value: unknown): value is { p: unknown; k: unknown } =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && 'k' in value

/**
 * Запечатанное слово IDE для телефона. Проверка лёгкая - вид и версия: IDE доказала, что это
 * она, тегом печати, а формы данных телефон читает по типам выше.
 */
export const parseAgentMessage = (value: unknown): AgentMessage | null =>
  isVersioned(value) && value.p === 1 && typeof value.k === 'string' && AGENT_KINDS.has(value.k)
    ? (value as AgentMessage)
    : null

/** Открытое слово IDE - только ответы рукопожатия. */
export const parseHandshakeReply = (value: unknown): HandshakeReply | null =>
  isVersioned(value) && value.p === 1 && typeof value.k === 'string' && HANDSHAKE_KINDS.has(value.k)
    ? (value as HandshakeReply)
    : null

/** Что умеет эта сторона протокола v1. */
export const CAP_PARTS = 'parts'

/**
 * Сколько IDE помнит итог команды по id: столько телефон может повторять команду без итога,
 * не боясь второго выполнения. Телефон повторяет только в первой половине этого срока.
 */
export const COMMAND_MEMORY_MS = 10 * 60_000
