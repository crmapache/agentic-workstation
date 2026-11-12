/**
 * Платформа окна (ADR 0048): из моста preload и сразу, без запроса - клавиши, их подписи и
 * место под кнопки окна нужны до первого ответа главного процесса. Вне Electron (тесты) моста
 * нет - тогда мак, основная платформа IDE.
 */
export const PLATFORM: string =
  (globalThis as { ide?: { platform?: string } }).ide?.platform ?? 'darwin'

/** Мак: главный модификатор ⌘, клавиши подписываются знаками. Иначе - Windows: Ctrl и слова. */
export const IS_MAC = PLATFORM === 'darwin'
