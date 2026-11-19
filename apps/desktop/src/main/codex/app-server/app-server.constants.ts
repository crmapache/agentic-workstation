/** Сколько ждать ответа на запрос app-server: дольше - сервер завис, ход не должен висеть вечно. */
export const REQUEST_TIMEOUT_MS = 30_000

/** Рукопожатие дольше обычного запроса: первый запуск Codex читает конфиг и MCP. */
export const HANDSHAKE_TIMEOUT_MS = 60_000

/**
 * Сколько ждать выхода после закрытия stdin, прежде чем слать сигнал. SIGKILL сразу оставил бы
 * процесс, который держит замок писателя разговора (опыт amazing-codex).
 */
export const STDIN_CLOSE_GRACE_MS = 3_000

/** Хвост stderr для причины падения: последние строки - самые полезные. */
export const STDERR_TAIL_CHARS = 4_000

/** Ответ на запрос сервера, которого клиент не знает: стандартный код JSON-RPC. */
export const METHOD_NOT_FOUND = -32_601
