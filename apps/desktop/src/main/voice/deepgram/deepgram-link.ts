import type { VoiceRegion, VoiceKeyCheck } from '@shared/voice'

/**
 * Соединение с Deepgram (ADR 0104): WebSocket главного процесса, ключ - подпротоколом
 * `['token', key]` (проба 2026-11-21: так Deepgram пускает и в `/v2/listen`, и в `/v2/speak`).
 * Окну и телефону ключ не отдаётся никогда.
 */

export type DeepgramHandlers = {
  open: () => void
  text: (data: string) => void
  audio: (data: Buffer) => void
  /** Соединение закрылось - само, сервером или сбоем; code - код закрытия WebSocket. */
  close: (code: number) => void
}

export type DeepgramLink = {
  /** Отправить, если соединение открыто; иначе - ничего: о закрытии скажет close. */
  send: (data: string | Uint8Array) => void
  close: () => void
}

/** Открыть соединение; тест подставляет своё. */
export type DeepgramDial = (url: string, key: string, handlers: DeepgramHandlers) => DeepgramLink

export const deepgramHost = (region: VoiceRegion): string =>
  region === 'eu' ? 'api.eu.deepgram.com' : 'api.deepgram.com'

export const dialDeepgram: DeepgramDial = (url, key, handlers) => {
  const socket = new WebSocket(url, ['token', key])

  socket.binaryType = 'arraybuffer'
  socket.onopen = () => handlers.open()
  socket.onmessage = (event: MessageEvent) => {
    if (typeof event.data === 'string') handlers.text(event.data)
    else if (event.data instanceof ArrayBuffer) handlers.audio(Buffer.from(event.data))
  }
  // Ошибку всегда сопровождает закрытие: о нём и скажем.
  socket.onerror = () => undefined
  socket.onclose = (event: CloseEvent) => handlers.close(event.code)

  return {
    send: (data) => {
      // Своя копия кадра: байты окна или телефона могут лежать в общем буфере, а сокет берёт свой.
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(typeof data === 'string' ? data : new Uint8Array(data))
      }
    },
    close: () => {
      if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
        socket.close()
      }
    },
  }
}

/** Сколько ждать ответа проверки ключа. */
const KEY_CHECK_MS = 10_000

/**
 * Годен ли ключ: `GET /v1/auth/token` отвечает 200 на годный и 401 на чужой. Сбой сети и
 * прочие ответы - «Deepgram не ответил», а не «ключ плохой».
 */
export const checkDeepgramKey = async (
  key: string,
  region: VoiceRegion,
  fetcher: typeof fetch = fetch,
): Promise<VoiceKeyCheck> => {
  try {
    const response = await fetcher(`https://${deepgramHost(region)}/v1/auth/token`, {
      headers: { Authorization: `Token ${key}` },
      signal: AbortSignal.timeout(KEY_CHECK_MS),
    })

    if (response.ok) return 'ok'

    return response.status === 401 || response.status === 403 ? 'invalid' : 'unreachable'
  } catch {
    return 'unreachable'
  }
}
