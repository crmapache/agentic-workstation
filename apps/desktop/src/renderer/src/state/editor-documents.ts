import type { ProjectDiskChange } from '@shared/fs'

/** Что умеют документы редактора для тех, кто живёт вне ленивого куска с Monaco. */
export type DocumentsBus = {
  diskChanged: (change: ProjectDiskChange) => void
  /** Сверить все открытые файлы с диском - вернувшись в окно. */
  checkAll: () => void
  /** Человек согласился потерять несохранённое в этих файлах проекта. */
  discard: (projectId: string, paths: readonly string[]) => void
  /** Дописать всё несохранённое; ответ - когда записано. */
  saveAll: () => Promise<void>
  /**
   * Правка от расширения (ADR 0091) в редакторе файла на виду: вставить у курсора или заменить
   * выделенное - одним шагом отмены. false - файл сейчас не открыт в редакторе.
   */
  edit: (projectId: string, path: string, kind: 'insert' | 'replace', text: string) => boolean
}

let documents: DocumentsBus | null = null

/**
 * Связь с документами редактора. Monaco - отдельный ленивый кусок (ADR 0005), а слушать
 * диск и просьбы главного процесса надо с первой секунды окна. Пока Monaco не загружен,
 * открытых документов нет - и сообщать некому: null. Живёт в state, а не в редакторе: перед
 * переименованием в дереве несохранённое дописывает и дерево.
 */
export const connectDocuments = (bus: DocumentsBus) => {
  documents = bus
}

export const editorDocuments = (): DocumentsBus | null => documents
