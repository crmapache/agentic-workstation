/** Ключ хранилища окна: черновики поля переживают перезагрузку и перезапуск. */
export const COMPOSER_STORAGE_KEY = 'agentic-workstation.claude-composer.v1'

/** Прежнее хранилище, где черновики были голым текстом: забираются оттуда один раз. */
export const LEGACY_STORAGE_KEY = 'agentic-workstation.claude-code.v1'

/**
 * Пауза перед записью черновиков на диск: пишется после паузы в наборе, а не на каждую
 * букву - черновик бывает со свёрнутой вставкой на сотню килобайт.
 */
export const DRAFT_SAVE_DELAY_MS = 400

/** Сколько отправленных сообщений вкладки помнит ↑. */
export const SENT_HISTORY_KEPT = 50

/** Клавиша отправки словами - для подсказки на Send и строки поправляемого в очереди. */
export const SEND_KEY_HINT = 'Enter'
