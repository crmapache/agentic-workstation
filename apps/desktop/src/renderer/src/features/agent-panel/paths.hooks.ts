import type { ProjectFileList } from '@shared/search'
import { useQuery } from '@tanstack/react-query'

import { projectFilesQuery } from '../../state/project-files.queries'
import { useActiveProject } from '../../state/workspace.queries'
import { KNOWN_FILES_STALE_MS } from './paths.constants'
import { knownFiles, NO_KNOWN_FILES } from './paths.utils'
import type { KnownFiles } from './paths.utils'

/**
 * Индекс строится раз на список, а не на каждую ссылку: select у каждого наблюдателя
 * свой, а список - десятки тысяч путей.
 */
const built = new WeakMap<ProjectFileList, KnownFiles>()

// Вне хука: React Query пересчитывает select только на новых данных.
const selectKnownFiles = (list: ProjectFileList): KnownFiles => {
  const cached = built.get(list)

  if (cached) return cached

  const known = knownFiles(list.paths)

  built.set(list, known)

  return known
}

/**
 * Что известно о файлах активного проекта - для splitLinks и readPathRef: имя, которое
 * у проекта есть, становится ссылкой при любом расширении. Пока список не пришёл (или
 * проекта нет) - решает одна форма пути.
 */
export const useKnownFiles = (): KnownFiles => {
  const project = useActiveProject()
  const { data } = useQuery({
    ...projectFilesQuery(project?.id ?? ''),
    enabled: project !== null,
    staleTime: KNOWN_FILES_STALE_MS,
    select: selectKnownFiles,
  })

  return data ?? NO_KNOWN_FILES
}
