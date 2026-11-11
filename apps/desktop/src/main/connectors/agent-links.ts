import type { AgentApp } from '@shared/connectors'

/**
 * Claude обрезает текст ссылки около 14 000 знаков, а промпт настройки - пара тысяч. Длиннее
 * из окна приходит только мусор.
 */
export const MAX_AGENT_PROMPT = 14_000

/** Схема, которую приложение регистрирует в macOS: по ней видно, установлено ли оно. */
export const AGENT_SCHEMES: Record<AgentApp, string> = {
  claude: 'claude://',
  codex: 'codex://',
}

/**
 * Ссылка на новый разговор с текстом в поле ввода - из документации приложений: Claude -
 * Cowork (он работает в Chrome или своём браузере), Codex - новый локальный чат. Оба только
 * кладут текст в поле, отправляет человек. Схема и путь - отсюда, из окна - только текст.
 */
export const agentLink = (app: AgentApp, prompt: string): string => {
  const text = encodeURIComponent(prompt)

  return app === 'claude'
    ? `${AGENT_SCHEMES.claude}cowork/new?q=${text}`
    : `${AGENT_SCHEMES.codex}threads/new?prompt=${text}`
}
