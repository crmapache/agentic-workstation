/**
 * Поля, в которые не печатают, а ставят значение (ADR 0040). У даты, времени, месяца, недели,
 * цвета и ползунка Chrome рисует свою разметку ввода: набранные по буквам «2026-11-10» она
 * разбирает по сегментам и портит, а вставка текста целиком не доходит до значения вовсе.
 * Поэтому значение ставится прямо, тем же путём, что у человека после выбора в календаре:
 * родной сеттер value, затем input и change - их слушают React и другие фреймворки.
 */

/** Тип поля → какой формат значения ждёт Chrome: его модель увидит в отказе. */
export const SET_VALUE_FORMATS: Readonly<Record<string, string>> = {
  date: 'YYYY-MM-DD, like 2026-11-10',
  time: 'HH:MM or HH:MM:SS in 24 hours, like 13:45',
  'datetime-local': 'YYYY-MM-DDTHH:MM, like 2026-11-10T13:45',
  month: 'YYYY-MM, like 2026-11',
  week: 'YYYY-Www, like 2026-W46',
  color: '#rrggbb, like #ff8800',
  range: "a number between the slider's min and max, on its step",
}

/** Значение такого поля ставится напрямую, а не печатается. */
export const setsValue = (tag: string, type: string): boolean =>
  tag === 'input' && type in SET_VALUE_FORMATS

/**
 * Поле взяло то, что просили. Chrome молча чистит значение не того формата (пустая строка) и
 * подгоняет ползунок к шагу - так это и видно. Цвет Chrome хранит строчными буквами, ползунок -
 * числом без лишних нулей.
 */
export const sameFieldValue = (type: string, actual: string, wanted: string): boolean => {
  if (type === 'color') return actual.toLowerCase() === wanted.trim().toLowerCase()

  if (type === 'range') return wanted.trim() !== '' && Number(actual) === Number(wanted)

  return actual === wanted.trim()
}

/** Отказ модели: что поле взяло и какой формат оно ждёт. */
export const fieldValueRefused = (
  type: string,
  wanted: string,
  actual: string,
  limits: { min: string; max: string; step: string },
): string => {
  const range =
    type === 'range'
      ? ` (min ${limits.min || '0'}, max ${limits.max || '100'}, step ${limits.step || '1'})`
      : ''

  return `The ${type} field did not take "${wanted}"${actual ? ` - it holds "${actual}"` : ''}. Expected: ${SET_VALUE_FORMATS[type] ?? 'a valid value'}${range}.`
}

/**
 * Функция страницы: родной сеттер value (обход перехвата фреймворков), input и change, ответ -
 * что получилось и пределы ползунка.
 */
export const SET_VALUE = `function (value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  this.focus()
  setter.call(this, value)
  this.dispatchEvent(new Event('input', { bubbles: true }))
  this.dispatchEvent(new Event('change', { bubbles: true }))
  return { value: this.value, min: this.min, max: this.max, step: this.step }
}`
