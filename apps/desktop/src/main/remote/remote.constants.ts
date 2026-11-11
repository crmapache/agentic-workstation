/** Свой релей Remote Control (решение владельца): в настройках не меняется. */
export const RELAY_URL = 'wss://agentic-workstation-relay.mzpizote.com'

/** Другой релей - только для тестов и разработки (локальный `apps/relay` на ws://localhost). */
export const RELAY_URL_ENV = 'AGENTIC_WORKSTATION_RELAY_URL'

/** Файл настроек и спаренных телефонов в userData; ключи в нём - запечатанные safeStorage. */
export const REMOTE_FILE = 'remote.json'
