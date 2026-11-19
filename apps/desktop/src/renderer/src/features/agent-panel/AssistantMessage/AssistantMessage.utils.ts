/** Число из значения токена («340ms», «4px»); нет или не число - 0. */
export const tokenNumber = (style: CSSStyleDeclaration, token: string): number => {
  const value = Number.parseFloat(style.getPropertyValue(token))

  return Number.isFinite(value) ? value : 0
}

/** Строка, открывающая или закрывающая забор кода: «```ts», «~~~~». */
const FENCE = /^ {0,3}(`{3,}|~{3,})/

/**
 * Ответ в буфер: блоки (списки, цитаты, код, таблицы) остаются как написаны, а
 * выделение внутри строки уходит - звёздочки жирного и обратные кавычки кода в
 * скопированном тексте ничего не выделяют и торчат мусором (ACC). Внутри блоков кода
 * не трогается ничего.
 */
export const replyClipboard = (markdown: string): string => {
  let fence: string | null = null

  return markdown
    .split('\n')
    .map((line) => {
      const opened = FENCE.exec(line)?.[1]

      if (fence) {
        if (opened && opened[0] === fence[0] && opened.length >= fence.length) fence = null

        return line
      }

      if (opened) {
        fence = opened

        return line
      }

      return line.replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, '$1').replace(/`([^`\n]+)`/g, '$1')
    })
    .join('\n')
}
