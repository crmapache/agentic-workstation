import type { TextSpan } from '@shared/definitions'

/**
 * Вопрос процессу определений: файл - абсолютный путь, offset - смещение в тексте, version - версия текста
 * в окне. Текст едет, только когда процесс этой версии не знает.
 */
export type DefinitionJob = { file: string; version: string; offset: number; text?: string }

/** Место в файле: абсолютный путь (через «/», как пишет TypeScript) и смещение в его тексте. */
export type Place = { file: string; pos: number }

/** Ответ процесса: цель - абсолютный путь, строка и колонка с 1. */
export type JobAnswer =
  | { kind: 'found'; origin: TextSpan; target: { file: string; line: number; column: number } }
  | { kind: 'none' }
  | { kind: 'needText' }

/** Как имя пришло из другого модуля: путь, как написан в импорте, и имя в том модуле. */
export type ImportedName = {
  spec: string
  /** Имя экспорта; default - экспорт по умолчанию, * - модуль целиком. */
  name: string
}

export type WorkerInbound = { id: number; job: DefinitionJob }

export type WorkerOutbound =
  { id: number; ok: true; answer: JobAnswer } | { id: number; ok: false; error: string }
