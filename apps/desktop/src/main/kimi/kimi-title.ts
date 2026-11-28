import { ownTitle } from '../agents/tabs/tab-names'
import { awaitKimiAccess, KIMI_CLIENT_HEADERS } from './kimi-access'

/**
 * Сколько ждать живого токена: сразу после сообщения Kimi сам обновляет истёкший на запросе к
 * модели - за секунды; дольше - Kimi не дошёл до модели (не вошёл, упал).
 */
const TOKEN_WAIT_MS = 60_000

/** Сколько ждать ответа инструмента имён: столько же даёт сам Kimi. */
const TITLE_TIMEOUT_MS = 8_000

/** Как Kimi кормит свой инструмент имён: до 400 знаков каждого сообщения, до 1000 всего. */
const SAMPLE_CHARS = 400
const INPUT_CHARS = 1000

/** Разговор для инструмента имён словами Kimi: строка `user: ...` на сообщение человека. */
export const chatContent = (prompts: readonly string[]): string =>
  prompts
    .map((prompt) => `user: ${prompt.slice(0, SAMPLE_CHARS)}`)
    .join('\n')
    .slice(0, INPUT_CHARS)

/** Имя из ответа инструмента: `{ title }`, одной строкой по мерке имени вкладки. */
export const titleOf = (body: unknown): string | null => {
  const title =
    typeof body === 'object' && body !== null ? (body as Record<string, unknown>)['title'] : null

  return typeof title === 'string' ? ownTitle(title) : null
}

/**
 * Имя разговора от Kimi - его же инструментом `chat_title` (`POST <сервер>/tools`), как окно Kimi
 * называет свои разговоры после первого хода. По ACP Kimi имени не даёт: `session_info_update`
 * несёт первые 200 знаков сообщения. Токен - его входа, только читаем (kimi-access.ts). null -
 * не вышло (токена не дождались, сервер отказал): вкладка спросит на следующем сообщении.
 */
export const kimiTitle =
  (home: string) =>
  async (prompts: readonly string[]): Promise<string | null> => {
    const access = await awaitKimiAccess(home, TOKEN_WAIT_MS)

    if (!access) return null

    const response = await fetch(`${access.baseUrl}/tools`, {
      method: 'POST',
      headers: {
        ...KIMI_CLIENT_HEADERS,
        Authorization: `Bearer ${access.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        method: 'chat_title',
        params: { chat_content: chatContent(prompts) },
      }),
      signal: AbortSignal.timeout(TITLE_TIMEOUT_MS),
    })

    if (!response.ok) {
      console.warn(`[kimi] имя разговора: сервер ответил ${response.status}`)

      return null
    }

    return titleOf(await response.json())
  }
