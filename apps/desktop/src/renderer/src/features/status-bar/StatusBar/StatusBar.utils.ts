import type { Project } from '@shared/workspace'

import { joinRoot, displayPath, isOutsidePath } from '../../../lib/path.utils'

/**
 * Путь в строке состояния: на виду - от проекта (файл вне проекта - своим путём через ~), а в
 * буфер по нажатию - полный путь от корня системы, который поймут терминал и любое приложение.
 * Файл не выбран - папка проекта.
 */
export const statusPath = (
  project: Project,
  selectedFile: string | null | undefined,
  homeDir: string | undefined,
): { shown: string; full: string } => {
  if (!selectedFile) return { shown: project.name, full: project.rootPath }
  if (isOutsidePath(selectedFile)) {
    return { shown: displayPath(selectedFile, homeDir), full: selectedFile }
  }

  return {
    shown: `${project.name}/${selectedFile}`,
    full: joinRoot(project.rootPath, selectedFile),
  }
}
