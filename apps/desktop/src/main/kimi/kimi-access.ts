import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

/** Сервер подписки Kimi и действующий токен входа - чем IDE спрашивает его о своём. */
export type KimiAccess = { baseUrl: string; token: string }

/**
 * Сколько токену должно остаться жить, чтобы им спрашивать: запас на сам запрос. Токен Kimi живёт
 * 15 минут, обновляет его сам Kimi на своём запросе к модели.
 */
const TOKEN_MARGIN_MS = 60_000

/** Как часто смотреть, не обновил ли Kimi токен, пока его ждём. */
const TOKEN_POLL_MS = 1_000

/** Подпись IDE в запросах к серверу Kimi: чужим клиентом IDE не представляется (ADR 0094). */
export const KIMI_CLIENT_HEADERS = {
  'User-Agent': 'AgenticWorkstation',
  Accept: 'application/json',
} as const

/** Секция подписки в config.toml Kimi: вход IDE - всегда `managed:kimi-code`. */
const MANAGED = '[providers."managed:kimi-code"]'
const MANAGED_OAUTH = '[providers."managed:kimi-code".oauth]'

/** Строки секции TOML до следующего заголовка. */
const sectionLines = (config: string, header: string): string[] => {
  const lines = config.split('\n').map((line) => line.trim())
  const start = lines.indexOf(header)

  if (start < 0) return []

  const end = lines.findIndex((line, index) => index > start && line.startsWith('['))

  return lines.slice(start + 1, end < 0 ? undefined : end)
}

/** Строковое значение ключа секции: `key = "value"`. */
const valueOf = (lines: readonly string[], key: string): string => {
  const line = lines.find((one) => one.startsWith(`${key} `) || one.startsWith(`${key}=`))
  const match = line ? /=\s*"([^"]*)"/.exec(line) : null

  return match?.[1] ?? ''
}

/**
 * Где Kimi держит вход подписки (config.toml своей папки): сервер (у глобального аккаунта -
 * `api.kimi.ai`, у китайского - `api.kimi.com`) и имя файла токена в `credentials/`. Не нашлось -
 * null: Kimi не вошёл или формат настроек стал другим.
 */
export const managedLogin = (config: string): { baseUrl: string; tokenFile: string } | null => {
  const baseUrl = valueOf(sectionLines(config, MANAGED), 'base_url').replace(/\/+$/, '')
  const key = valueOf(sectionLines(config, MANAGED_OAUTH), 'key').replace(/^oauth\//, '')

  // Имя файла - из чужого файла: только простое имя, без выхода из папки.
  if (!/^https:\/\//.test(baseUrl) || !/^[\w.-]+$/.test(key)) return null

  return { baseUrl, tokenFile: `${key}.json` }
}

/** Токен из файла Kimi, если ему ещё жить хотя бы TOKEN_MARGIN_MS; иначе пусто. */
export const liveToken = (credentials: string, now: number): string => {
  try {
    const value = JSON.parse(credentials) as Record<string, unknown>
    const token = typeof value['access_token'] === 'string' ? value['access_token'] : ''
    const expiresAt = typeof value['expires_at'] === 'number' ? value['expires_at'] * 1000 : 0

    return expiresAt - now > TOKEN_MARGIN_MS ? token : ''
  } catch {
    return ''
  }
}

/**
 * Вход Kimi из своей папки IDE (`KIMI_CODE_HOME`) - только читать: токен обновляет сам Kimi, а
 * обновление силами IDE сменило бы токен обновления под ногами у живого процесса Kimi и выбило бы
 * его вход. Токен истёк - null: спросим, когда Kimi сам его обновит.
 */
export const readKimiAccess = async (home: string): Promise<KimiAccess | null> => {
  const config = await readFile(join(home, 'config.toml'), 'utf8').catch(() => '')
  const login = managedLogin(config)

  if (!login) return null

  const credentials = await readFile(join(home, 'credentials', login.tokenFile), 'utf8').catch(
    () => '',
  )
  const token = liveToken(credentials, Date.now())

  return token ? { baseUrl: login.baseUrl, token } : null
}

/**
 * Вход Kimi, дождавшись живого токена: сразу после сообщения Kimi сам обновляет истёкший токен
 * на запросе к модели. Не дождались за timeoutMs - null.
 */
export const awaitKimiAccess = async (
  home: string,
  timeoutMs: number,
): Promise<KimiAccess | null> => {
  const until = Date.now() + timeoutMs

  for (;;) {
    const access = await readKimiAccess(home)

    if (access || Date.now() >= until) return access

    await delay(TOKEN_POLL_MS)
  }
}
