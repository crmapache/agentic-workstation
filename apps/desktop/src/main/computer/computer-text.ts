/**
 * Текст руки кусками: переводы строк и табуляции - отдельно (их жмут клавишей: перевод строки -
 * Shift+Return, ADR 0095), остальное - не длиннее size UTF-16 знаков и без разрыва суррогатной
 * пары.
 */
export const pieces = (text: string, size: number): string[] => {
  const out: string[] = []
  let chunk = ''

  for (const char of text) {
    if (char === '\n' || char === '\t') {
      if (chunk) out.push(chunk)

      out.push(char)
      chunk = ''
      continue
    }

    // Знак из двух половин UTF-16 (эмодзи) длиннее куска в один знак: пустой кусок не нужен -
    // он стал бы нажатием клавиши без текста.
    if (chunk && chunk.length + char.length > size) {
      out.push(chunk)
      chunk = ''
    }

    chunk += char
  }

  if (chunk) out.push(chunk)

  return out
}
