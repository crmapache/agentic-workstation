import type { OpenFileRequest } from '../../../state/open-file.context'

export type CodeBlockProps = {
  code: string
  /** Язык из забора кода или по расширению файла. Пусто - без подсветки. */
  language?: string | undefined
  /** Внутри другой плитки (команда установки CLI): ниже потолок высоты, без отступов. */
  compact?: boolean | undefined
  /**
   * Длинная строка переносится, а не листается вбок: для узкой панели, где код читают, а не
   * правят (команда фоновой задачи). Продолжение строки - с отступом, чтобы не спутать с
   * новой.
   */
  wrap?: boolean | undefined
}

/** Путь внутри кода: где стоит (смещения в коде) и что открыть. */
export type CodePath = {
  start: number
  end: number
  request: OpenFileRequest
  folder: boolean
}

/** Кусок кода с классом подсветки (пустой - ровный цвет кода). */
export type CodeSegment = {
  text: string
  className: string
}

/** Куски подряд: все под одним путём (одна ссылка) или все вне путей. */
export type CodeRun = {
  path: CodePath | null
  segments: CodeSegment[]
}

export type CodeRunsProps = {
  runs: readonly CodeRun[]
}
