import type { ProjectCall } from '../ProjectTab/ProjectTab.types'

export type ProjectTabsProps = {
  /** Позвавшие разговоры проекта по его пути - от workbench, который знает провайдеров. */
  callsOf?: ((rootPath: string) => readonly ProjectCall[]) | undefined
}
