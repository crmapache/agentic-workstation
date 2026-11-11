import { SECRET_MASK, SECRET_VALUE } from '../claude/tools/tools.constants'

/** Адреса своей машины: только к ним MCP можно по http - дальше ключ ушёл бы по сети открыто. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

const parse = (value: string): URL | null => {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

/** Адрес MCP-сервера, который IDE примет: https, а http - только на своей машине. */
export const isAllowedMcpUrl = (value: string): boolean => {
  const url = parse(value)

  if (!url) return false

  return url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname))
}

const ENCODED_MASK = encodeURIComponent(SECRET_MASK)

/** Кусок пути, похожий на ключ (Zapier: …/s/<ключ>/mcp), - маской; маска остаётся маской. */
const maskSegment = (segment: string): string =>
  segment === ENCODED_MASK || SECRET_VALUE.test(segment) ? SECRET_MASK : segment

/**
 * Адрес без строки запроса, якоря, логина с паролем и похожих на ключ кусков пути: его
 * можно хранить в реестре открытым текстом и показывать в окне. Полный адрес с ключом -
 * только в хранилище.
 */
export const publicUrl = (value: string): string => {
  const url = parse(value)

  return url ? `${url.origin}${url.pathname.split('/').map(maskSegment).join('/')}` : ''
}

/** В адресе есть то, что публичный адрес прячет: ключ в пути или в строке запроса, логин, якорь. */
export const hasSecretParts = (value: string): boolean => {
  const url = parse(value)

  return Boolean(url && url.href !== publicUrl(value))
}
