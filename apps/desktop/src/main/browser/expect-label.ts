/**
 * Сверка нажатия с намерением (ADR 0119) - общее у Browser и Computer Use: модель называет
 * подпись того, что хочет нажать (expect), инструмент сравнивает её с именем того, что под
 * точкой в момент нажатия. Чистые функции - держит тест.
 */

/** Хвост, который подпись не меняет: «Save As…», «Name:», «Delete?». */
const TRAILING = /[\s.…:?!]+$/u

/**
 * Подпись для сравнения: регистр, лишние пробелы, вид знаков (NFKC), типографские кавычки и
 * хвостовая пунктуация не важны.
 */
const normalized = (text: string): string =>
  text
    .normalize('NFKC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(TRAILING, '')

/**
 * Начало имени, по которому модель узнаёт элемент, скопировав его обрезанным из ответа (с «…»):
 * такое начало однозначно, а «Reply…» на «Reply all» не пройдёт.
 */
const CLIPPED_PREFIX_MIN = 40

/**
 * Подходит ли имя под ожидание: совпадает целиком. Вхождения мало: «Save» входит в «Don't Save»,
 * «Reply» - в «Reply all», «1» - в «21», и проверка пустила бы ровно соседнюю кнопку. Исключение -
 * длинное имя, которое модель скопировала из ответа обрезанным.
 */
export const matchesExpect = (name: string, expect: string): boolean => {
  const wanted = normalized(expect)
  const actual = normalized(name)

  if (!wanted) return false

  if (actual === wanted) return true

  return (
    expect.trim().endsWith('…') && wanted.length >= CLIPPED_PREFIX_MIN && actual.startsWith(wanted)
  )
}

/** Предел подписи в ответе: имя элемента бывает целым абзацем текста. Сравнение - по полному. */
const NAME_MAX = 120

export const clipName = (name: string): string => {
  const flat = name.replace(/\s+/g, ' ').trim()

  return flat.length > NAME_MAX ? `${flat.slice(0, NAME_MAX - 1)}…` : flat
}

/** Элемент словами для модели, как строка снимка: `button "Aceptar"`, без имени - роль. */
export const elementLabel = (role: string, name: string): string => {
  const what = role || 'element'
  const shown = clipName(name)

  return shown ? `${what} "${shown}"` : what
}

/** Имя для сравнения: целиком, но не мегабайт текста, который бывает у поля или абзаца. */
export const fullName = (name: string): string => name.replace(/\s+/g, ' ').trim().slice(0, 1000)
