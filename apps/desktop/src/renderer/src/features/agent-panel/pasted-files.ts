import { invoke, pathForFile } from '../../lib/ipc'
import { base64Of } from './field-clipboard.utils'

/**
 * Пути вставленных файлов - для полей, где ответ уходит только текстом (свой ответ на
 * вопрос). Файл из Finder - своим путём, байты из буфера (скриншот, документ) - файлом
 * в каталоге IDE. Не вышло записать - пути нет.
 */
export const pastedPaths = async (projectId: string, files: readonly File[]): Promise<string[]> => {
  const paths = await Promise.all(
    files.map(async (file) => {
      const real = pathForFile(file)

      if (real) return real

      return invoke('claude:savePasted', { name: file.name, data: await base64Of(file) }).catch(
        () => null,
      )
    }),
  )
  const found = paths.filter((path): path is string => path !== null)
  const described = await invoke('claude:describePaths', { projectId, paths: found }).catch(
    () => [],
  )

  return described.map((item) => item.path)
}
