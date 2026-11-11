import type { FileFailure } from '@shared/fs'

/**
 * Что держит файл открытым с несохранённым: файл поменял кто-то ещё, пока здесь
 * правили (conflict); файл удалили (deleted); запись не прошла (saveFailed); файл - ссылка
 * за пределы проекта, и правка в нём пишется только по просьбе (outside). Пока вопрос не
 * решён, автосохранение молчит, а вкладка не закрывается молча.
 */
export type DocumentNotice =
  | { kind: 'conflict' }
  | { kind: 'deleted' }
  | { kind: 'saveFailed'; reason: FileFailure }
  | { kind: 'outside' }

/**
 * Что показывает вкладка: файл ещё читается, текст (только для чтения или с вопросом),
 * не текст, слишком большой, не прочитался (нет прав, проект закрыли, диск отвалился) или
 * его нет на диске (удалили; вкладка файла закрывается сама, разница показывает удаление).
 */
export type DocumentStatus =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'text'; readOnly: boolean; notice: DocumentNotice | null; bom: boolean }
  | { kind: 'binary' }
  | { kind: 'tooLarge'; size: number; limit: number }
  | { kind: 'unreadable'; reason: FileFailure }

/**
 * Как показан файл Markdown, как в WebStorm: только код (editor), код и просмотр рядом
 * (split), только просмотр (preview). У других файлов - всегда код.
 */
export type MarkdownLayout = 'editor' | 'split' | 'preview'

/** Разница файла: две колонки рядом или одна, где удалённое стоит над добавленным. */
export type DiffLayout = 'sideBySide' | 'unified'

/** Отмена или повтор правки - команды Monaco с этими именами. */
export type HistoryCommand = 'undo' | 'redo'

/** Как показана разница - выбор человека, один на все файлы. */
export type DiffViewOptions = { layout: DiffLayout; collapsed: boolean }

/** Что сравнивает локальная история: версию с файлом сейчас (как в WebStorm) или само событие. */
export type HistoryCompare = 'current' | 'change'
