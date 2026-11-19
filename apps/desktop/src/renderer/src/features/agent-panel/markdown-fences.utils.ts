/**
 * Строка-забор блока кода: три бэктика или больше и после них любая инфо-строка
 * (не одно слово языка). Отступ - любые пробелы и табы, а не три, как у CommonMark:
 * забор внутри пункта списка сдвинут на четыре так же часто, как на три.
 */
const FENCE = /^[ \t]*(`{3,})([^`\n]*)$/

/** Блок кода с начала текста: что съел, инфо-строка целиком и сам код. */
export type FenceBlock = {
  /** Съеденный кусок исходника, без перевода строки после закрывающего забора. */
  raw: string
  /** Всё, что написано после открывающего забора, целиком: `markdown ultracode`. */
  info: string
  /** Код между заборами: строки как есть, без отступа самого забора. */
  text: string
  /** Закрыт ли блок: незакрытый - обычное состояние печатающегося ответа. */
  closed: boolean
}

/** Строка - забор блока кода (открывающий или закрывающий). */
export const isFenceLine = (line: string) => FENCE.test(line)

/** Первая строка текста, без перевода строки. */
export const firstLine = (source: string) => {
  const lineBreak = source.indexOf('\n')

  return lineBreak === -1 ? source : source.slice(0, lineBreak)
}

/**
 * Начало первой строки, в которой есть одна из подстрок и которая проходит проверку.
 * Позиция 0 не считается: так marked спрашивает, где кончится абзац, - с текстом без
 * первого знака, и первая строка в нём обрезана, а не начинается.
 */
export const findLineStart = (
  source: string,
  needles: readonly string[],
  matches: (line: string) => boolean,
): number | undefined => {
  let best: number | undefined

  for (const needle of needles) {
    let index = source.indexOf(needle)

    while (index !== -1 && (best === undefined || index < best)) {
      const lineStart = source.lastIndexOf('\n', index - 1) + 1
      const lineEnd = source.indexOf('\n', index)
      const line = source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd)

      if (lineStart > 0 && matches(line)) {
        best = lineStart
        break
      }

      index = lineEnd === -1 ? -1 : source.indexOf(needle, lineEnd)
    }
  }

  return best
}

/** Длина отступа забора: таб считается за четыре, как в CommonMark. */
const indentWidth = (line: string) =>
  (/^[ \t]*/.exec(line)?.[0] ?? '').replace(/\t/g, '    ').length

/** Снять с строки кода отступ забора, но не больше, чем у неё есть пробелов. */
const dedent = (line: string, width: number) => {
  let cut = 0

  while (cut < width && (line[cut] === ' ' || line[cut] === '\t')) cut += 1

  return line.slice(cut)
}

/**
 * Блок кода, если текст начинается с забора, иначе null. Правило ACC, а не
 * CommonMark: закрывает только голый забор ТОЙ ЖЕ длины. Длинный забор вокруг
 * короткого - это и есть вложенность (промпт с примером разметки внутри), а более
 * длинный забор внутри обычного блока остаётся его текстом и не съедает хвост ответа.
 * Не закрылся - блок до конца текста: ответ ещё печатается.
 */
export const readFence = (source: string): FenceBlock | null => {
  const opening = FENCE.exec(firstLine(source))

  if (!opening) return null

  const length = opening[1]?.length ?? 0
  const width = indentWidth(source)
  const info = (opening[2] ?? '').trim()
  const lines: string[] = []
  let cursor = source.indexOf('\n')

  while (cursor !== -1) {
    const start = cursor + 1
    const lineBreak = source.indexOf('\n', start)
    const end = lineBreak === -1 ? source.length : lineBreak
    const line = source.slice(start, end)
    const fence = FENCE.exec(line)

    if (fence && fence[1]?.length === length && (fence[2] ?? '').trim() === '') {
      return { raw: source.slice(0, end), info, text: lines.join('\n'), closed: true }
    }

    lines.push(dedent(line, width))
    cursor = lineBreak
  }

  return { raw: source, info, text: lines.join('\n'), closed: false }
}

/**
 * Где ближайший забор, - чтобы абзац над ним остановился, а не съел забор своим
 * продолжением (у CommonMark так бывает с забором, сдвинутым на четыре).
 */
export const findFenceStart = (source: string) => findLineStart(source, ['```'], isFenceLine)
