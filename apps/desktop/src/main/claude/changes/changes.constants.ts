/**
 * Инструменты правки CLI и где у них путь файла. Остальные (Read) файл только смотрят. Им же
 * локальная история узнаёт правку агента (ADR 0045).
 */
export const EDIT_TOOL_PATH_FIELD: Readonly<Record<string, string>> = {
  Edit: 'file_path',
  MultiEdit: 'file_path',
  Write: 'file_path',
  NotebookEdit: 'notebook_path',
}

/** Транскрипт читается кусками такого размера - с конца, где лежит ход. */
export const TRANSCRIPT_CHUNK_BYTES = 1024 * 1024

/**
 * Дальше этого от конца транскрипта начало хода не ищется: ход с выводом в десятки
 * мегабайт сверяется хуже, чем стоит его чтение.
 */
export const TRANSCRIPT_SCAN_MAX_BYTES = 64 * 1024 * 1024
