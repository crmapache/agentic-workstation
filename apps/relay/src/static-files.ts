import { statSync, realpathSync, createReadStream } from 'node:fs'
import type { ServerResponse } from 'node:http'
import { sep, join, extname, resolve, relative, normalize } from 'node:path'

/**
 * Файлы телефонного клиента, когда их раздаёт этот релей. Клиент - одна страница, поэтому
 * всё, что не файл (`/pair`, `/project/…`), получает её оболочку: что рисовать, клиент
 * решает по адресу сам. Пустая папка в настройке - не раздавать вовсе.
 */

const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
}

/**
 * Неизменны только файлы с хешем в имени. Сервис-воркер и манифест - заново каждый раз:
 * воркер, закэшированный на год, - установленный телефон, до которого не дойдёт ни одна
 * выкладка. Оболочка не кэшируется вовсе.
 */
const NEVER_STALE = ['sw.js', 'manifest.webmanifest']

const cacheControl = (file: string): string => {
  if (file.endsWith('.html')) return 'no-store'
  if (NEVER_STALE.some((name) => file.endsWith(sep + name))) return 'no-cache'

  return 'public, max-age=31536000, immutable'
}

const inside = (path: string, base: string): boolean => path === base || path.startsWith(base + sep)

/** Имя с точкой на любой глубине - то, что попало в папку случайно (.env, ._name, .swp). */
const hidden = (target: string, base: string): boolean =>
  relative(base, target)
    .split(sep)
    .some((part) => part.startsWith('.') && part !== '.well-known' && part !== '')

/** Файл, и правда лежащий внутри: ссылка из папки наружу проходит проверку строки, но не эту. */
const readable = (path: string, base: string): string | null => {
  try {
    if (!statSync(path).isFile()) return null

    const real = realpathSync(path)

    return inside(real, realpathSync(base)) ? real : null
  } catch {
    return null
  }
}

const safeDecode = (path: string): string | null => {
  try {
    return decodeURIComponent(path)
  } catch {
    return null
  }
}

const pick = (target: string, base: string): string | null =>
  readable(target, base) ??
  readable(join(target, 'index.html'), base) ??
  readable(join(base, 'index.html'), base)

/** Файл клиента; headers - заголовки страницы (политика, HTTPS, камера) на каждый ответ. */
export const serveStatic = (
  root: string,
  path: string,
  response: ServerResponse,
  headers: Record<string, string> = {},
): void => {
  if (!root) {
    response.writeHead(404, { 'content-type': 'text/plain' }).end('not found')

    return
  }

  const base = resolve(root)
  const decoded = safeDecode(path)
  // Путь снаружи не верится: «../../etc/passwd» - самый старый запрос в интернете.
  const target = decoded === null ? null : resolve(join(base, normalize(decoded)))

  if (target === null) {
    response.writeHead(400, { 'content-type': 'text/plain' }).end('bad path')

    return
  }

  if (!inside(target, base) || hidden(target, base)) {
    response.writeHead(403, { 'content-type': 'text/plain' }).end('forbidden')

    return
  }

  const file = pick(target, base)

  if (!file) {
    response.writeHead(404, { 'content-type': 'text/plain' }).end('not found')

    return
  }

  response.writeHead(200, {
    ...headers,
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': cacheControl(file),
    'x-content-type-options': 'nosniff',
  })
  createReadStream(file).pipe(response)
}
