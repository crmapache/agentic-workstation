/**
 * Локальная история файлов (ADR 0045), как Local History в WebStorm: каждое изменение файла
 * проекта хранится 30 дней, любую версию можно посмотреть и вернуть.
 */

/**
 * Почему файл стал таким: сохранение в редакторе IDE, правка извне (терминал, другая
 * программа), правка агентом ИИ (его инструмент правки шёл в это время), правка ссылок при
 * переименовании в дереве, файл появился, удалён, перенесён, возвращена версия из истории.
 */
export type HistoryCause =
  'edit' | 'outside' | 'agent' | 'refactor' | 'created' | 'deleted' | 'moved' | 'restored'

/**
 * Событие в истории файла. version - ключ содержимого после события, у удаления - последнее
 * содержимое перед ним (его и возвращают); previous - до события, null - файла не было или
 * каким он был, неизвестно. Ключ - отпечаток содержимого: одинаковые версии - один ключ.
 */
export type HistoryEntry = {
  id: number
  /** Путь файла сейчас, от корня проекта: история едет за файлом при переносе. */
  path: string
  at: number
  cause: HistoryCause
  /** Откуда перенесли (moved); иначе null. */
  origin: string | null
  version: string | null
  previous: string | null
}

/** История файла или всего в папке: новые сверху; truncated - показаны не все. */
export type HistoryList = {
  /** Чья история: файла или папки (и всего проекта) - по диску, а у пропавшего - по событиям. */
  scope: 'file' | 'folder'
  entries: HistoryEntry[]
  truncated: boolean
  /** Сколько дней хранится история: окно говорит это словами. */
  retentionDays: number
}

/** Содержимое версии: текст; не текст (показать нечего, вернуть можно); пропало. */
export type HistoryContent =
  { kind: 'text'; text: string } | { kind: 'binary'; size: number } | { kind: 'lost' }

/**
 * Почему версию не вернуть: содержимое пропало, на месте файла папка, нет прав, файл сейчас
 * так велик, что история не может сохранить его перед возвратом, другой сбой (подробности -
 * в журнале главного процесса).
 */
export type HistoryRestoreCode = 'lost' | 'occupied' | 'denied' | 'tooLarge' | 'failed'

export type HistoryRestoreOutcome = { ok: true } | { ok: false; code: HistoryRestoreCode }

/** В истории проекта появились события - у этих файлов. */
export type HistoryChange = { projectId: string; paths: string[] }
