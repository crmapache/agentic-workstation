/** Сколько ждать ответа на обычный запрос ACP: дольше - агент завис. */
export const ACP_REQUEST_TIMEOUT_MS = 30_000

/**
 * Запросы, которые поднимают сессию (`session/new`, `load`, `resume`, `fork`): агент читает
 * конфиг, поднимает серверы MCP и, у `load`, повторяет всю историю.
 */
export const ACP_SESSION_TIMEOUT_MS = 120_000

/** Рукопожатие: первый запуск агента читает настройки и вход. */
export const ACP_HANDSHAKE_TIMEOUT_MS = 60_000

/**
 * Ход (`session/prompt`) срока не имеет (0): он идёт, пока агент работает, а человек может думать
 * над вопросом сколько угодно. Упавший процесс отклонит запрос сам.
 */
export const ACP_PROMPT_TIMEOUT_MS = 0

/** Пауза между закрытием stdin и сигналом: агент дописывает разговор на диск. */
export const ACP_STDIN_CLOSE_GRACE_MS = 3_000

/** Хвост stderr для причины падения. */
export const ACP_STDERR_TAIL_CHARS = 4_000

/** Версия протокола, на которой говорит IDE. */
export const ACP_PROTOCOL_VERSION = 1

/** Ответ на запрос агента, которого клиент не знает. */
export const ACP_METHOD_NOT_FOUND = -32_601

/** Ошибка, которую агент шлёт без входа (`agy`: «Authentication required»). */
export const ACP_AUTH_REQUIRED = -32_000

/**
 * Что IDE объявляет агенту: файлы и терминал - нет (агент читает, пишет и запускает сам, его
 * диффы и вывод приходят в вызовах); формы вопросов - да; настройки сессии - да.
 */
export const ACP_CLIENT_CAPABILITIES: Record<string, unknown> = {
  fs: { readTextFile: false, writeTextFile: false },
  terminal: false,
  elicitation: { form: {} },
  session: { configOptions: {} },
}
