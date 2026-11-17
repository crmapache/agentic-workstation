import type { ProjectImageRead } from '@shared/preview-images'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { invoke } from '../../lib/ipc'
import { useIpcEvent } from '../../lib/ipc.hooks'
import { isOutsidePath } from '../../lib/path.utils'
import { QUERY_KEYS } from '../../state/query-keys'
import { isTouched } from './documents.utils'

/** Картинка из файла, как её видит окно: unchanged до него не доходит. */
export type ImageFile = Exclude<ProjectImageRead, { kind: 'unchanged' }>

/** Как следить за картинкой: live - сверять при каждом показе и возврате в окно. */
type ImageFileOptions = { live?: boolean }

/** Файл проекта - путём от корня, файл вне проекта - абсолютным, как у fs:readFile. */
const imageRequest = (projectId: string, path: string) =>
  isOutsidePath(path) ? { projectId, absolutePath: path } : { projectId, relativePath: path }

/**
 * Картинка файла - data URL или причина, почему её нет: для просмотра Markdown и вкладки
 * картинки. Читается один раз; поменялся файл на диске - сбрасывает useImageFileSync, и
 * перечитывание с прежней версией (known) отвечает unchanged без байтов, если файл тот же.
 * live - вкладка: она сверяется и при показе, и по возврату в окно, как документ редактора, -
 * за картинкой вне проекта, пока она не на виду, никто не следит.
 */
export const useImageFile = (projectId: string, path: string, { live }: ImageFileOptions = {}) => {
  const queryClient = useQueryClient()
  const queryKey = QUERY_KEYS.projectImage(projectId, path)

  return useQuery({
    queryKey,
    queryFn: async (): Promise<ImageFile> => {
      const previous = queryClient.getQueryData<ImageFile>(queryKey)
      const known = previous?.kind === 'image' ? previous.version : null
      const request = imageRequest(projectId, path)
      const read = await invoke('fs:readImage', { ...request, known })

      if (read.kind !== 'unchanged') return read
      if (previous) return previous

      return (await invoke('fs:readImage', request)) as ImageFile
    },
    staleTime: live ? 0 : Infinity,
    refetchOnWindowFocus: live === true,
  })
}

/**
 * Изменения на диске - перечитать картинки, которых они касаются: по пути и по настоящему
 * пути (картинка - ссылка внутри проекта). Человек пересохранил скриншот - просмотр и
 * вкладка показывают новый; пачка без списка (git checkout) перечитывает видимые, и прежние
 * отвечают unchanged. Картинка вне проекта приходит своим абсолютным путём, пока за ней
 * следят (outside-watch.ts). Подключается в синхронизации редактора (useEditorSync).
 */
export const useImageFileSync = () => {
  const queryClient = useQueryClient()

  useIpcEvent('fs:changed', ({ projectId, files }) => {
    void queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.projectImages(projectId),
      predicate: ({ queryKey, state }) => {
        const path = queryKey[3]
        const image = state.data as ImageFile | undefined
        const realPath = image?.kind === 'image' ? image.realPath : null

        return (
          (typeof path === 'string' && isTouched(path, files)) ||
          (realPath !== null && isTouched(realPath, files))
        )
      },
    })
  })
}
