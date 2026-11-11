/**
 * Действия с файлами и папками проекта из дерева (как в WebStorm): создать, переименовать,
 * перенести, скопировать, убрать в корзину. Пути - от корня проекта через «/».
 */

/**
 * Почему действие не вышло - словами окна (en.json fileTree.errors). unsaved - у файла в
 * редакторе несохранённое с конфликтом: его решает человек до переноса.
 */
export type FileOpCode = 'exists' | 'invalidName' | 'missing' | 'intoItself' | 'failed' | 'unsaved'

/** Отказ с причиной. */
export type FileOpFailure = { ok: false; code: FileOpCode }

/** Что вышло: где теперь созданное, перенесённое или скопированное. */
export type FileOpOutcome = { ok: true; path: string } | FileOpFailure

/** Перенос: откуда и куда. Переименование - перенос в той же папке. */
export type FileMove = { from: string; to: string }

/**
 * Перенос с правкой ссылок: сколько ссылок в скольких файлах переписано и сколько файлов
 * пропущено - они поменялись между поиском и записью, и правка легла бы мимо.
 */
export type FileMoveOutcome =
  { ok: true; path: string; references: number; files: number; skipped: number } | FileOpFailure

/** Файл со ссылками на переносимое и сколько их в нём. */
export type ReferenceFile = { path: string; count: number }

/**
 * Ссылки на переносимое в коде, стилях и Markdown проекта: импорты, require, @use, ссылки
 * Markdown и src/href. truncated - файлов в проекте больше предела списка: искали не везде.
 */
export type ReferencePlan = { files: ReferenceFile[]; total: number; truncated: boolean }

export type EntryKind = 'file' | 'directory'
