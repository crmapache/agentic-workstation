import { useTranslation } from 'react-i18next'

import type { FileMove, EntryKind, FileOpCode, FileMoveOutcome } from '@shared/file-ops'
import type { DirectoryEntry } from '@shared/fs'
import type { Project } from '@shared/workspace'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { invoke } from '../../lib/ipc'
import { useIpcEvent } from '../../lib/ipc.hooks'
import { splitPath, isInsideAny } from '../../lib/path.utils'
import { useActionNoticeStore } from '../../state/action-notice.store'
import { editorDocuments } from '../../state/editor-documents'
import { NO_TABS, tabsUnder, tabTarget } from '../../state/editor-tabs.utils'
import { QUERY_KEYS } from '../../state/query-keys'
import { useSelectionStore } from '../../state/selection.store'
import { useFileTreeStore } from './file-tree.store'
import { symlinkedFolders } from './file-tree.utils'

/**
 * Содержимое одного каталога проекта. Читается при раскрытии папки, один раз: когда на
 * диске что-то появится или пропадёт, главный процесс скажет (fs:changed), и
 * useDirectorySync сбросит кэш этой папки.
 */
export const useDirectory = (projectId: string, relativePath: string) =>
  useQuery({
    queryKey: QUERY_KEYS.directory(projectId, relativePath),
    queryFn: () => invoke('fs:readDirectory', { projectId, relativePath }),
    staleTime: Infinity,
  })

/**
 * Изменения на диске - перечитать папки, где они случились: раскрытые перечитаются
 * сразу, свёрнутые - когда их раскроют. Со всем, что под ними, перечитываются:
 * переименованные (macOS говорит только о самой папке, а кэш её подпапок - по старому
 * месту, и после переименования туда и обратно показал бы прежнее) и папки-ссылки
 * (macOS сообщает о настоящем пути цели, не о ссылке). null - перечитать все папки
 * проекта. Подключается один раз, в корне окна.
 */
export const useDirectorySync = () => {
  const queryClient = useQueryClient()

  useIpcEvent('fs:changed', ({ projectId, directories, renamed }) => {
    const projectKey = QUERY_KEYS.projectDirectories(projectId)

    if (directories === null) {
      void queryClient.invalidateQueries({ queryKey: projectKey })

      return
    }

    // Поменялось только содержимое файлов - списки папок прежние, это дело редактора.
    if (directories.length === 0 && renamed.length === 0) return

    for (const directory of directories) {
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.directory(projectId, directory),
        exact: true,
      })
    }

    const listings = queryClient
      .getQueriesData<DirectoryEntry[]>({ queryKey: projectKey })
      .map(([, entries]) => entries)
    const subtrees = [...renamed, ...symlinkedFolders(listings)]

    if (subtrees.length === 0) return

    void queryClient.invalidateQueries({
      queryKey: projectKey,
      predicate: ({ queryKey: [, , , relativePath] }) =>
        typeof relativePath === 'string' && isInsideAny(relativePath, subtrees),
    })
  })
}

/**
 * Ссылки на то, что переносят, - для переключателя «Update references»: где и сколько. Ищет
 * главный процесс по текущему диску; перенос переищет их сам. null - искать нечего.
 */
export const useFileReferences = (projectId: string, move: FileMove | null) =>
  useQuery({
    queryKey: QUERY_KEYS.fileReferences(projectId, move?.from ?? '', move?.to ?? ''),
    queryFn: () => invoke('files:references', { projectId, move: move ?? { from: '', to: '' } }),
    enabled: move !== null,
    staleTime: 0,
    gcTime: 0,
  })

/**
 * Действия дерева над главным процессом (files:*, ADR 0043): после ответа - вкладки,
 * раскрытые папки и буфер дерева на новых местах, итог - в углу окна. Папки перечитает
 * событие диска. Отказ создания и переноса - в ответе: окно с полем имени показывает его у
 * поля. Исключение главного процесса - в углу окна, кнопки диалога снова доступны.
 */
export const useFileActions = (project: Pick<Project, 'id' | 'rootPath'>) => {
  const { t } = useTranslation()
  const show = useActionNoticeStore((state) => state.show)
  const projectId = project.id
  const fail = (code: FileOpCode) => show({ tone: 'danger', title: t(`fileTree.errors.${code}`) })
  const failed = () => fail('failed')

  const create = useMutation({
    mutationFn: ({ parent, name, kind }: { parent: string; name: string; kind: EntryKind }) =>
      invoke('files:create', { projectId, parent, name, kind }),
    onSuccess: (outcome, { kind }) => {
      if (!outcome.ok) return

      const { revealPath } = useFileTreeStore.getState()

      // Новый файл - сразу открыт вкладкой; новая папка - раскрыта.
      if (kind === 'file') useSelectionStore.getState().selectFile(projectId, outcome.path)

      revealPath(projectId, outcome.path, { expand: kind === 'directory' })
    },
    onError: failed,
  })

  const move = useMutation({
    // Несохранённое - сначала на диск: закрытый документ старого места иначе вернул бы файл.
    mutationFn: async ({
      move,
      update,
    }: {
      move: FileMove
      update: boolean
    }): Promise<FileMoveOutcome> => {
      // Файл с конфликтом в редакторе (его правил и агент): сохранение его пропускает, а
      // закрытая вкладка старого места вернула бы файл рядом с перенесённым. Сначала - решить.
      const held = useSelectionStore.getState().heldByProject[projectId] ?? []

      if (held.some((path) => isInsideAny(path, [move.from]))) return { ok: false, code: 'unsaved' }

      await editorDocuments()?.saveAll()

      return invoke('files:move', { projectId, move, updateReferences: update })
    },
    onSuccess: (outcome, { move }) => {
      if (!outcome.ok) return

      const tree = useFileTreeStore.getState()
      const to = splitPath(outcome.path)

      useSelectionStore.getState().moveTabs(projectId, move.from, outcome.path)
      tree.moved(projectId, move.from, outcome.path)
      tree.revealPath(projectId, outcome.path)
      show({
        tone: 'success',
        title:
          splitPath(move.from).folder === to.folder
            ? t('fileTree.notices.renamed', { name: to.name })
            : t('fileTree.notices.moved', { folder: to.folder || '/' }),
        details:
          [
            outcome.references > 0
              ? t('fileTree.notices.references', {
                  count: outcome.references,
                  files: outcome.files,
                })
              : '',
            outcome.skipped > 0 ? t('fileTree.notices.skipped', { count: outcome.skipped }) : '',
          ]
            .filter(Boolean)
            .join('. ') || undefined,
      })
    },
    onError: failed,
  })

  const copy = useMutation({
    mutationFn: ({ from, toDirectory }: { from: string; toDirectory: string }) =>
      invoke('files:copy', { projectId, from, toDirectory }),
    onSuccess: (outcome) => {
      if (!outcome.ok) return fail(outcome.code)

      useFileTreeStore.getState().revealPath(projectId, outcome.path)
      show({
        tone: 'success',
        title: t('fileTree.notices.copied', { name: splitPath(outcome.path).name }),
      })
    },
    onError: failed,
  })

  // Вкладки убранного закрываются без вопроса о несохранённом: файла больше нет, а дописать
  // его значило бы вернуть его из корзины.
  const trash = useMutation({
    mutationFn: (path: string) => invoke('files:trash', { projectId, path }),
    onSuccess: (outcome, path) => {
      if (!outcome.ok) return fail(outcome.code)

      const { tabsByProject, closeTabs } = useSelectionStore.getState()
      const keys = tabsUnder(tabsByProject[projectId] ?? NO_TABS, path)

      editorDocuments()?.discard(
        projectId,
        keys.map((key) => tabTarget(key).path),
      )
      closeTabs(projectId, keys)
      useFileTreeStore.getState().removed(projectId, path)
      show({
        tone: 'success',
        title: t('fileTree.notices.trashed', { name: splitPath(path).name }),
      })
    },
    onError: failed,
  })

  /** Полный путь от корня системы - в буфер обмена. */
  const copyPath = (path: string) =>
    navigator.clipboard
      .writeText(path ? `${project.rootPath}/${path}` : project.rootPath)
      .then(() => show({ tone: 'success', title: t('fileTree.notices.pathCopied') }), failed)

  return { create, move, copy, trash, copyPath, fail }
}
