/** Время по умолчанию, когда к сроку добавляют время. */
export const DEFAULT_TIME = '09:00'

/** Шаг минут в поле времени срока. */
export const MINUTE_STEP = 5

/**
 * Подстановки в тексте справки: i18next раскрыл бы `{{card}}` как свою переменную, поэтому они
 * приходят значениями - сами собой.
 */
export const PLACEHOLDER_WORDS = {
  card: '{{card}}',
  title: '{{title}}',
  subtitle: '{{subtitle}}',
  description: '{{description}}',
}
