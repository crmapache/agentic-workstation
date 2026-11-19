/**
 * Перевод строки в набираемом тексте - общее правило Browser и Computer Use (ADR 0095). В
 * мессенджерах (WhatsApp, Telegram, Slack, Teams) Enter отправляет сообщение, а строку переносит
 * Shift+Enter. Поэтому набор никогда не жмёт голый Enter внутри текста: перевод строки -
 * Shift+Enter (на маке Shift+Return), пустая строка - два подряд. А многострочный текст вместе с
 * submit не принимается вовсе: такое сообщение ушло бы одним слепым вызовом, и модель не увидела
 * бы, как легли абзацы.
 */

/**
 * Переводы строк Windows (\r\n) и старого мака (\r) - в \n: знак \r по клавише стал бы голым
 * Return, а вставкой - лишним знаком в поле.
 */
export const normalizeBreaks = (text: string): string => text.replace(/\r\n?/g, '\n')

export const isMultiline = (text: string): boolean => /[\r\n]/.test(text)

/** Отказ модели: многострочный текст и submit в одном вызове. send - чем отправить потом. */
export const multilineSubmitRefused = (send: string): string =>
  `Text with line breaks can't go with submit: a chat would send it in one blind step. Type it without submit, check the field (lines, blank lines, the right chat), then ${send}.`
