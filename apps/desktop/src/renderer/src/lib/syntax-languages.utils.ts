import { baseName } from './path.utils'
import { GRAMMARS } from './syntax-grammars.constants'
import {
  DOTENV_PREFIX,
  TSCONFIG_NAME,
  LANGUAGE_ALIASES,
  FILE_NAME_LANGUAGES,
} from './syntax-languages.constants'

/** Язык подсветки по имени из забора кода или по расширению. null - не знаем такого. */
export const resolveLanguage = (name: string): string | null => {
  const key = name.trim().toLowerCase()
  const language = LANGUAGE_ALIASES[key] ?? key

  return language in GRAMMARS ? language : null
}

/**
 * Язык файла по пути: имя целиком (Dockerfile, .zshrc, tsconfig.json), файлы окружения
 * (.env, .env.local), потом расширение. null - текст без подсветки.
 */
export const languageOfPath = (path: string): string | null => {
  const name = baseName(path).toLowerCase()
  const byName = FILE_NAME_LANGUAGES[name]

  if (byName) return byName
  if (name === DOTENV_PREFIX || name.startsWith(`${DOTENV_PREFIX}.`)) return 'dotenv'
  if (TSCONFIG_NAME.test(name)) return 'jsonc'

  const dot = name.lastIndexOf('.')

  return dot > 0 ? resolveLanguage(name.slice(dot + 1)) : null
}

/** Файл Markdown - у него в редакторе есть просмотр (ADR 0019). */
export const isMarkdownPath = (path: string): boolean => languageOfPath(path) === 'markdown'
