import { ADDRESS_PATTERN } from '@agentic-workstation/remote-protocol/frame'

/** Спаренный телефон на диске - без «на связи»: это знает только живая линия. */
export type StoredDevice = {
  id: string
  label: string
  fingerprint: string
  pairedAt: number
  lastSeenAt: number
}

/**
 * Отпущенный телефон - надгробие, а не запись: ключей нет, но вернувшемуся можно сказать «тебя
 * отпустили», а не молчать, как выключенный ноутбук. tag - HMAC долгим ключом пары
 * (crypto-spec.ts), посчитанный при отзыве, пока ключ ещё был: телефон верит слову только с
 * ним. Пусто - ключа не было (секрет не открылся при загрузке): такому телефону IDE молчит.
 */
export type RevokedDevice = { id: string; tag: string }

/**
 * Что Remote Control хранит на диске (`remote.json` в userData). Ключи - только запечатанными
 * системным хранилищем (safeStorage): открытым текстом закрытые ключи IDE и секреты пар не
 * лежат никогда. Адреса релея здесь нет: он задан в IDE (решение владельца, свой домен). Адреса
 * IDE на релее тоже нет: это начало SHA-256 её ключа подписи, он выводится из ключа.
 */
export type StoredRemote = {
  /**
   * Формат файла. aw-remote/1 (адрес - случайные байты) не читается: такой адрес релей больше не
   * отдаёт без подписи, и пары на нём всё равно не вернутся. Прежний `remote.json` удалённого
   * доступа ACC (ADR 0011) - тоже не наш.
   */
  format: typeof REMOTE_FORMAT
  enabled: boolean
  devices: StoredDevice[]
  /** Отпущенные, свежие в конце. */
  revoked: RevokedDevice[]
  /** Закрытый ключ ECDH IDE (PKCS8), запечатанный; пусто - ещё не создан или некуда класть. */
  identity: string
  /** Закрытый ключ подписи IDE (PKCS8), запечатанный: им IDE доказывает релею свой адрес. */
  signing: string
  /** Долгие ключи пар по телефону, запечатанные хранилищем. */
  secrets: Record<string, string>
  /**
   * Подписки телефонов на пуши (push.ts протокола) - JSON, запечатанный хранилищем, как ключи:
   * адрес службы пушей и ключи браузера - то, по чему телефон можно будить. Уходит вместе с
   * парой (отзыв, «забудь меня», новая пара) и по слову релея «подписки нет».
   */
  pushes: Record<string, string>
}

export const REMOTE_FORMAT = 'aw-remote/2'

/** Сколько надгробий помнить: телефон, отпущенный давным-давно, встретит тишину. */
export const REVOKED_REMEMBERED = 32

export const emptyRemote = (): StoredRemote => ({
  format: REMOTE_FORMAT,
  enabled: false,
  devices: [],
  revoked: [],
  identity: '',
  signing: '',
  secrets: {},
  pushes: {},
})

const text = (value: unknown, max = 4096): string =>
  typeof value === 'string' && value.length <= max ? value : ''

const time = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0

const parseDevice = (value: unknown): StoredDevice | null => {
  if (typeof value !== 'object' || value === null) return null

  const device = value as Record<string, unknown>
  const id = text(device['id'], 64)

  if (!ADDRESS_PATTERN.test(id)) return null

  return {
    id,
    label: text(device['label'], 80) || 'A phone',
    fingerprint: text(device['fingerprint'], 32),
    pairedAt: time(device['pairedAt']),
    lastSeenAt: time(device['lastSeenAt']),
  }
}

const parseRevoked = (value: unknown): RevokedDevice | null => {
  if (typeof value !== 'object' || value === null) return null

  const entry = value as Record<string, unknown>
  const id = text(entry['id'], 64)

  return ADDRESS_PATTERN.test(id) ? { id, tag: text(entry['tag'], 100) } : null
}

/** Файл как есть - в проверенное состояние; чужой формат или негодное поле - по умолчанию. */
export const parseStoredRemote = (raw: unknown): StoredRemote => {
  if (typeof raw !== 'object' || raw === null) return emptyRemote()

  const stored = raw as Record<string, unknown>

  if (stored['format'] !== REMOTE_FORMAT) return emptyRemote()

  const devices = Array.isArray(stored['devices'])
    ? stored['devices'].map(parseDevice).filter((device) => device !== null)
    : []
  const revoked = Array.isArray(stored['revoked'])
    ? stored['revoked'].map(parseRevoked).filter((entry) => entry !== null)
    : []
  const sealedById = (raw: unknown): Record<string, string> => {
    const out: Record<string, string> = {}

    if (typeof raw === 'object' && raw !== null) {
      for (const [id, sealed] of Object.entries(raw as Record<string, unknown>)) {
        if (ADDRESS_PATTERN.test(id) && typeof sealed === 'string') out[id] = sealed
      }
    }

    return out
  }

  return {
    format: REMOTE_FORMAT,
    enabled: stored['enabled'] === true,
    devices,
    revoked: revoked.slice(-REVOKED_REMEMBERED),
    identity: text(stored['identity'], 8192),
    signing: text(stored['signing'], 8192),
    secrets: sealedById(stored['secrets']),
    // Файл без подписок (до пушей) - просто без них: формат тот же.
    pushes: sealedById(stored['pushes']),
  }
}

/** Отпустить телефон: запись, секрет и подписка уходят, надгробие с тегом встаёт последним. */
export const withRevoked = (stored: StoredRemote, deviceId: string, tag: string): StoredRemote => {
  const { [deviceId]: _gone, ...secrets } = stored.secrets

  return {
    ...stored,
    devices: stored.devices.filter((device) => device.id !== deviceId),
    secrets,
    pushes: withoutPush(stored.pushes, deviceId),
    revoked: [
      ...stored.revoked.filter((entry) => entry.id !== deviceId),
      { id: deviceId, tag },
    ].slice(-REVOKED_REMEMBERED),
  }
}

/**
 * Новый или вернувшийся телефон: запись заменяется, надгробие с него снимается. Подписка
 * прежней пары уходит: новая пара - новый ключ пуша, и телефон пришлёт подписку заново.
 */
export const withDevice = (
  stored: StoredRemote,
  device: StoredDevice,
  sealed: string,
): StoredRemote => ({
  ...stored,
  devices: [...stored.devices.filter((item) => item.id !== device.id), device],
  secrets: { ...stored.secrets, [device.id]: sealed },
  pushes: withoutPush(stored.pushes, device.id),
  revoked: stored.revoked.filter((entry) => entry.id !== device.id),
})

export const withoutPush = (
  pushes: Record<string, string>,
  deviceId: string,
): Record<string, string> => {
  const { [deviceId]: _gone, ...rest } = pushes

  return rest
}

/**
 * Адрес релея - только защищённый: телефону `crypto.subtle` дают лишь в защищённом контексте.
 * Исключение - localhost для разработки и тестов. Хост разбирается, а не сравнивается
 * префиксом: «ws://localhost.example.com» - чужой сервер.
 */
export const isSecureRelay = (url: string): boolean => {
  try {
    const parsed = new URL(url)

    if (parsed.protocol === 'wss:') return parsed.hostname !== ''

    return (
      parsed.protocol === 'ws:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
    )
  } catch {
    return false
  }
}
