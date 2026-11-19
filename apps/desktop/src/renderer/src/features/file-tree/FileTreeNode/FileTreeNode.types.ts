import type { DirectoryEntry } from '@shared/fs'

export type FileTreeNodeProps = {
  projectId: string
  entry: DirectoryEntry
  /** Глубина вложенности: от неё отступ строки. */
  depth: number
  /**
   * Места под стрелку нет: в корне проекта одни файлы, раскрывать нечего, и пустой столбец
   * стрелок отодвигал бы их от края панели.
   */
  flat?: boolean | undefined
}

export type DirectoryChildrenProps = {
  projectId: string
  relativePath: string
  depth: number
}
