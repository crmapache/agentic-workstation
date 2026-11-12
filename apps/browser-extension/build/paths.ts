import { resolve } from 'node:path'

/** Корень пакета расширения. */
export const PACKAGE_ROOT = resolve(import.meta.dirname, '..')

export const SRC = resolve(PACKAGE_ROOT, 'src')

/** Готовое расширение: эту папку IDE копирует в ~/.agentic-workstation/chrome-extension. */
export const DIST = resolve(PACKAGE_ROOT, 'dist')

/** Единственный источник значений стиля (ADR 0006). */
export const TOKENS_PATH = resolve(PACKAGE_ROOT, '../../packages/ui/src/styles/tokens.css')
