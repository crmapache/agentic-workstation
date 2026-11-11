import { useTranslation } from 'react-i18next'

import type { HistoryContent, HistoryRestoreOutcome } from '@shared/local-history'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { preloadLanguage } from '../../lib/highlighter'
import { invoke } from '../../lib/ipc'
import { useIpcEvent } from '../../lib/ipc.hooks'
import { splitPath } from '../../lib/path.utils'
import { languageOfPath } from '../../lib/syntax-languages.utils'
import { useActionNoticeStore } from '../../state/action-notice.store'
import { editorDocuments } from '../../state/editor-documents'
import { QUERY_KEYS } from '../../state/query-keys'

/**
 * Локальная история файла или папки ('' - проект): события, новые сверху (ADR 0045).
 * Читается один раз; пополнилась - главный процесс скажет (history:changed).
 */
export const useLocalHistory = (projectId: string, path: string) =>
  useQuery({
    queryKey: QUERY_KEYS.localHistory(projectId, path),
    queryFn: () => invoke('history:list', { projectId, path }),
    staleTime: Infinity,
  })

/**
 * Содержимое версии. Ключ - отпечаток содержимого, под ним версия не меняется: читается один
 * раз. null - читать нечего (файла до события не было). Язык подсветки файла path грузится
 * заранее, как у документа: модель, созданная до грамматики, мигнула бы ровным текстом.
 */
export const useHistoryContent = (
  projectId: string,
  key: string | null,
  path: string,
): HistoryContent | undefined =>
  useQuery({
    queryKey: QUERY_KEYS.historyContent(projectId, key ?? ''),
    queryFn: async () => {
      const content = await invoke('history:content', { projectId, key: key ?? '' })
      const language = languageOfPath(path)

      if (content.kind === 'text' && language) {
        await preloadLanguage(language).catch(() => undefined)
      }

      return content
    },
    enabled: key !== null,
    staleTime: Infinity,
  }).data

/** История проекта пополнилась - открытые истории перечитываются. Подключается в корне окна. */
export const useLocalHistorySync = () => {
  const queryClient = useQueryClient()

  useIpcEvent('history:changed', ({ projectId }) => {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.localHistories(projectId) })
  })
}

type RestoreRequest = { path: string; key: string; when: string }

/**
 * Вернуть файлу версию. Несохранённое в редакторе сначала дописывается - иначе возврат
 * встретил бы правку конфликтом, - потом версия ложится на диск, и открытый файл сразу
 * сверяется с ним. Итог - в углу окна; прежнее содержимое остаётся в истории.
 */
export const useRestoreVersion = (projectId: string) => {
  const { t } = useTranslation()
  const show = useActionNoticeStore((state) => state.show)

  return useMutation({
    mutationFn: async ({ path, key }: RestoreRequest): Promise<HistoryRestoreOutcome> => {
      await editorDocuments()?.saveAll()

      return invoke('history:restore', { projectId, path, key })
    },
    onSuccess: (outcome, { path, when }) => {
      const { name } = splitPath(path)

      if (!outcome.ok) {
        return show({
          tone: 'danger',
          title: t('localHistory.restore.failed', { name }),
          details: t(`localHistory.restore.codes.${outcome.code}`),
        })
      }

      editorDocuments()?.diskChanged({
        projectId,
        directories: [],
        renamed: [],
        files: [path],
        git: false,
      })
      show({
        tone: 'success',
        title: t('localHistory.restore.done', { name }),
        details: t('localHistory.restore.doneDetails', { when }),
      })
    },
    onError: (_error, { path }) =>
      show({
        tone: 'danger',
        title: t('localHistory.restore.failed', { name: splitPath(path).name }),
        details: t('localHistory.restore.codes.failed'),
      }),
  })
}
