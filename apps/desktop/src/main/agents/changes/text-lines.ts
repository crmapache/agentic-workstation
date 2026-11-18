/** Текст строками и кончается ли он переводом строки - этого список строк сам не скажет. */
export type TextLines = { lines: string[]; endsWithBreak: boolean }

/**
 * Текст в строки. `\r\n` читается как `\n`: CLI присылает строки диффа без возврата
 * каретки, и файл с концами строк Windows иначе не совпал бы ни с одним ханком.
 */
export const splitText = (text: string): TextLines => {
  const plain = text.replaceAll('\r\n', '\n')

  if (!plain) return { lines: [], endsWithBreak: false }

  const endsWithBreak = plain.endsWith('\n')

  return { lines: (endsWithBreak ? plain.slice(0, -1) : plain).split('\n'), endsWithBreak }
}

/** Строки обратно в текст - с переводом строки в конце, если он был. */
export const joinText = ({ lines, endsWithBreak }: TextLines): string =>
  lines.join('\n') + (endsWithBreak && lines.length > 0 ? '\n' : '')

/** Одни и те же строки: перевод строки в самом конце не в счёт. */
export const sameLines = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((line, index) => line === right[index])
