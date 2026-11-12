/**
 * Ключ записи числом из строкового id (сообщения, вызова инструмента, пути файла): два
 * 32-битных хэша в 53 бита, как answerKey счётчика «tok». Целое в первичном ключе SQLite
 * вдвое компактнее строки; совпадение на миллион записей - доли процента от одного случая.
 */
export const keyOf = (text: string): number => {
  let first = 0x811c9dc5
  let second = 5381

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)

    first = Math.imul(first ^ code, 0x01000193)
    second = (Math.imul(second, 33) + code) | 0
  }

  return (first >>> 0) * 0x200000 + ((second >>> 0) & 0x1fffff)
}
