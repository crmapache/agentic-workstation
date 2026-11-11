import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js'
import { SseError } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

/**
 * Сервер ответил «нужен вход» (401). Транспорт без провайдера входа кладёт код в числовое
 * поле, а в текст - только тело ответа («invalid_token»): узнавать по тексту нельзя, иначе
 * обычный сервер на OAuth выглядел бы просто лежащим.
 */
export const isUnauthorized = (error: unknown): boolean =>
  error instanceof UnauthorizedError ||
  ((error instanceof StreamableHTTPError || error instanceof SseError) && error.code === 401)
