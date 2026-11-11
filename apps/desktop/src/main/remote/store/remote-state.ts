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
 * Что Remote Control хранит на диске (`remote.json` в userData). Ключи - только запечатанными
 * системным хранилищем (safeStorage): открытым текстом закрытый ключ IDE и секреты пар не
 * лежат никогда. Адреса релея здесь нет: он задан в IDE (решение владельца, свой домен).
 */
export type StoredRemote = {
  /** Формат файла: прежний `remote.json` удалённого доступа ACC (ADR 0011) - не наш, не читается. */
  format: typeof REMOTE_FORMAT
  /** Адрес IDE на релее: 16 случайных байт base64url, ни о машине, ни о человеке. */
  agentId: string
  enabled: boolean
  devices: StoredDevice[]
  /**
   * Отпущенные адреса, свежие в конце. Надгробие, а не запись: ключей нет, но вернувшемуся
   * телефону можно сказать «тебя отпустили», а не молчать, как выключенный ноутбук.
   */
  revoked: string[]
  /** Закрытый ключ IDE (PKCS8), запечатанный хранилищем; пусто - ещё не создан или некуда класть. */
  identity: string
  /** Долгие ключи пар по телефону, запечатанные хранилищем. */
  secrets: Record<string, string>
}

export const REMOTE_FORMAT = 'aw-remote/1'

/** Сколько надгробий помнить: телефон, отпущенный давным-давно, встретит тишину. */
export const REVOKED_REMEMBERED = 32

export const emptyRemote = (): StoredRemote => ({
  format: REMOTE_FORMAT,
  agentId: '',
  enabled: false,
  devices: [],
  revoked: [],
  identity: '',
  secrets: {},
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

/** Файл как есть - в проверенное состояние; чужой формат или негодное поле - по умолчанию. */
export const parseStoredRemote = (raw: unknown): StoredRemote => {
  if (typeof raw !== 'object' || raw === null) return emptyRemote()

  const stored = raw as Record<string, unknown>

  if (stored['format'] !== REMOTE_FORMAT) return emptyRemote()

  const devices = Array.isArray(stored['devices'])
    ? stored['devices'].map(parseDevice).filter((device) => device !== null)
    : []
  const revoked = Array.isArray(stored['revoked'])
    ? stored['revoked'].filter(
        (id): id is string => typeof id === 'string' && ADDRESS_PATTERN.test(id),
      )
    : []
  const secrets: Record<string, string> = {}
  const rawSecrets = stored['secrets']

  if (typeof rawSecrets === 'object' && rawSecrets !== null) {
    for (const [id, sealed] of Object.entries(rawSecrets as Record<string, unknown>)) {
      if (ADDRESS_PATTERN.test(id) && typeof sealed === 'string') secrets[id] = sealed
    }
  }

  return {
    format: REMOTE_FORMAT,
    agentId: ADDRESS_PATTERN.test(text(stored['agentId'])) ? text(stored['agentId']) : '',
    enabled: stored['enabled'] === true,
    devices,
    revoked: revoked.slice(-REVOKED_REMEMBERED),
    identity: text(stored['identity'], 8192),
    secrets,
  }
}

/** Отпустить телефон: запись и секрет уходят, надгробие встаёт последним. */
export const withRevoked = (stored: StoredRemote, deviceId: string): StoredRemote => {
  const { [deviceId]: _gone, ...secrets } = stored.secrets

  return {
    ...stored,
    devices: stored.devices.filter((device) => device.id !== deviceId),
    secrets,
    revoked: [...stored.revoked.filter((id) => id !== deviceId), deviceId].slice(
      -REVOKED_REMEMBERED,
    ),
  }
}

/** Новый или вернувшийся телефон: запись заменяется, надгробие с него снимается. */
export const withDevice = (
  stored: StoredRemote,
  device: StoredDevice,
  sealed: string,
): StoredRemote => ({
  ...stored,
  devices: [...stored.devices.filter((item) => item.id !== device.id), device],
  secrets: { ...stored.secrets, [device.id]: sealed },
  revoked: stored.revoked.filter((id) => id !== device.id),
})

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
