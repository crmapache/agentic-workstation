/**
 * Метки папок машины в тексте для телефона. Путь живёт и в тексте - в вызове инструмента, в
 * вопросе разрешения, в ошибке прогона, - и по дороге на телефон IDE меняет корень проекта,
 * папку worktree и домашнюю папку на метки. Телефон показывает их как есть, приглушённо: это
 * не часть пути, который можно скопировать, а знак, что на этом месте папка машины.
 *
 * Метки в фигурных скобках, а не в угловых: телефон рисует текст разметкой, и «<project>» стал
 * бы для неё тегом HTML.
 */

export const PROJECT_PLACEHOLDER = '{project}'

export const WORKTREE_PLACEHOLDER = '{worktree}'

export const HOME_PLACEHOLDER = '~'

/**
 * Где в тексте метки. «~» - только как начало пути (за ним «/» или конец слова) и в начале слова:
 * «~5 минут» и «a~b» - не метка.
 */
const PATTERN = /\{project\}|\{worktree\}|(?<![^\s"'`(=:[,])~(?=\/|$|[\s"'`),\]])/g

export type TextPiece = { text: string; placeholder: boolean }

/** Текст кусками: обычный текст и метки папок по порядку. Без меток - один кусок. */
export const splitPlaceholders = (text: string): TextPiece[] => {
  const pieces: TextPiece[] = []
  let at = 0

  for (const match of text.matchAll(PATTERN)) {
    const start = match.index

    if (start > at) pieces.push({ text: text.slice(at, start), placeholder: false })

    pieces.push({ text: match[0], placeholder: true })
    at = start + match[0].length
  }

  if (at < text.length || pieces.length === 0) {
    pieces.push({ text: text.slice(at), placeholder: false })
  }

  return pieces
}
