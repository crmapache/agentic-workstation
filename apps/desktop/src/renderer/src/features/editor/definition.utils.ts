import type { TextSpan } from '@shared/definitions'

/** Код на TypeScript или JavaScript: по нему ходят к определениям (ADR 0061). */
const SCRIPT_PATH = /\.(?:[cm]?[jt]s|[jt]sx)$/i

/** Есть ли у файла переход к определению: только код TypeScript и JavaScript. */
export const hasDefinitions = (path: string): boolean => SCRIPT_PATH.test(path)

/** Смещение внутри куска текста; конец - тоже внутри: мышь у последней буквы - ещё на имени. */
export const spanHolds = (span: TextSpan, offset: number): boolean =>
  offset >= span.start && offset <= span.end
