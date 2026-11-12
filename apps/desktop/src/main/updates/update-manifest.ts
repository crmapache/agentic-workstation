import { valid } from 'semver'

/** Файл новой версии для одной платформы. */
export type UpdateAsset = {
  url: string
  /** SHA-512 файла в base64. */
  sha512: string
  size: number
  /**
   * Подпись Ed25519 строки sha512, base64 - у установщика Windows (ADR 0048). У сборки мака её
   * нет: там новую версию проверяет подпись кода.
   */
  signature?: string
}

/**
 * Манифест релиза (latest.json). Пишет его scripts/write-update-manifest.mjs при
 * выпуске, читает приложение при проверке обновлений.
 */
export type UpdateManifest = {
  version: string
  notes: string
  releasedAt: string
  /** Ключ - платформа и архитектура: «mac-arm64». */
  assets: Record<string, UpdateAsset>
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])

/** https, а для проверки обновления на своей машине - http на локальный адрес. */
export const isAllowedDownloadUrl = (value: string) => {
  try {
    const url = new URL(value)

    return (
      url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname))
    )
  } catch {
    return false
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const parseAsset = (key: string, raw: unknown): UpdateAsset => {
  if (!isRecord(raw)) throw new Error(`Манифест: сборка ${key} не описана`)

  const { url, sha512, size, signature } = raw

  if (typeof url !== 'string' || !isAllowedDownloadUrl(url)) {
    throw new Error(`Манифест: у сборки ${key} недопустимый адрес`)
  }

  if (typeof sha512 !== 'string' || sha512.length === 0) {
    throw new Error(`Манифест: у сборки ${key} нет sha512`)
  }

  if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0) {
    throw new Error(`Манифест: у сборки ${key} неверный размер`)
  }

  return typeof signature === 'string' && signature.length > 0
    ? { url, sha512, size, signature }
    : { url, sha512, size }
}

/** Разбирает манифест и падает с понятной причиной, если он не тот, что ждём. */
export const parseUpdateManifest = (raw: unknown): UpdateManifest => {
  if (!isRecord(raw)) throw new Error('Манифест: не объект')

  const { version, notes, releasedAt, assets } = raw

  if (typeof version !== 'string' || valid(version) === null) {
    throw new Error('Манифест: версия не в формате semver')
  }

  if (!isRecord(assets)) throw new Error('Манифест: нет списка сборок')

  return {
    version,
    notes: typeof notes === 'string' ? notes : '',
    releasedAt: typeof releasedAt === 'string' ? releasedAt : '',
    assets: Object.fromEntries(
      Object.entries(assets).map(([key, asset]) => [key, parseAsset(key, asset)]),
    ),
  }
}
