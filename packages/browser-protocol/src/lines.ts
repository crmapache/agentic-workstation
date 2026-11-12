/**
 * JSON-строки между native host и IDE (unix-сокет): одно сообщение - одна строка. JSON.stringify
 * не оставляет переводов строк внутри, так что граница сообщения - всегда «\n».
 */

/** Строка длиннее - не сообщение, а сбой: картинка всей страницы укладывается с запасом. */
export const MAX_LINE_CHARS = 96 * 1024 * 1024

export class LineTooLongError extends Error {}

export const encodeLine = (message: unknown): string => `${JSON.stringify(message)}\n`

/**
 * Сборщик строк из кусков текста (сокет с setEncoding('utf8') не режет символы). Линейный:
 * перевод строки ищется только в новом куске, а начало недописанной строки копится списком и
 * склеивается один раз, когда строка кончилась. Склейка всего хвоста на каждом куске стоила
 * секунды процессора главного процесса на картинке в десятки мегабайт (квадрат от размера).
 */
export class LineSplitter {
  private parts: string[] = []
  private partsLength = 0

  constructor(private readonly maxChars = MAX_LINE_CHARS) {}

  push(chunk: string): string[] {
    const lines: string[] = []
    let start = 0

    for (let end = chunk.indexOf('\n'); end >= 0; end = chunk.indexOf('\n', start)) {
      const piece = chunk.slice(start, end)
      const line = this.parts.length ? this.parts.join('') + piece : piece

      this.parts = []
      this.partsLength = 0
      start = end + 1

      if (line.trim()) lines.push(line)
    }

    if (start < chunk.length) {
      const rest = start ? chunk.slice(start) : chunk

      this.partsLength += rest.length

      if (this.partsLength > this.maxChars) {
        this.parts = []
        this.partsLength = 0
        throw new LineTooLongError('Line is too long')
      }

      this.parts.push(rest)
    }

    return lines
  }
}

/** JSON из строки; битая строка - undefined, чтобы одна строка не роняла связь. */
export const parseLine = (line: string): unknown => {
  try {
    return JSON.parse(line) as unknown
  } catch {
    return undefined
  }
}
