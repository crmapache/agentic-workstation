import type { PictureView, PicturePlace } from '@shared/claude-draft'
import { useQuery, queryOptions, useQueryClient } from '@tanstack/react-query'

import { invoke } from '../../lib/ipc'
import { QUERY_KEYS } from '../../state/query-keys'
import { PICTURE_KEEP_MS } from './picture.constants'
import type { PictureLook, PictureSource } from './picture.types'
import { placeKey } from './picture.utils'

const NO_PLACE: PicturePlace = { kind: 'file', path: '' }

const LOADING: PictureLook = { state: 'loading' }
const MISSING: PictureLook = { state: 'missing' }

/**
 * Картинка у главного процесса. Нашлась - не меняется; не нашлась - при следующем взгляде
 * спросить снова: файл могли записать мгновение спустя. Держится, пока смотрят одно
 * сообщение, а не все картинки, на которые когда-то навели.
 */
const pictureQuery = (projectId: string, place: PicturePlace, whole: boolean) =>
  queryOptions({
    queryKey: QUERY_KEYS.claudePicture(projectId, placeKey(place), whole),
    queryFn: () => invoke('claude:readPicture', { projectId, place, whole }),
    staleTime: (query) => (query.state.data ? Infinity : 0),
    gcTime: PICTURE_KEEP_MS,
    retry: false,
  })

const lookOf = (view: PictureView | null): PictureLook =>
  view ? { state: 'ready', url: view.data, width: view.width, height: view.height } : MISSING

/**
 * Картинка за чипом: байты окна - сразу, остальное - у главного процесса, когда enabled.
 * Не нашлась на своём месте - спрашивается запасное. whole - целиком для просмотра, иначе
 * превью (большая уменьшена, размер - её собственный).
 */
export const usePicture = (
  projectId: string,
  source: PictureSource,
  enabled: boolean,
  whole: boolean,
): PictureLook => {
  const place = 'place' in source ? source.place : null
  const fallback = ('place' in source && source.fallback) || null
  const query = useQuery({
    ...pictureQuery(projectId, place ?? NO_PLACE, whole),
    enabled: enabled && place !== null,
  })
  const isGone = query.isError || query.data === null
  const spare = useQuery({
    ...pictureQuery(projectId, fallback ?? NO_PLACE, whole),
    enabled: enabled && fallback !== null && isGone,
  })

  if (!('place' in source)) return { state: 'ready', url: source.data, width: 0, height: 0 }
  if (!isGone) return query.data === undefined ? LOADING : lookOf(query.data)
  if (!fallback || spare.isError) return MISSING

  return spare.data === undefined ? LOADING : lookOf(spare.data)
}

/**
 * Есть ли превью под рукой без вопроса главному процессу: байты окна или уже прочитанная
 * картинка - их показывают сразу, остальное спрашивают, только когда курсор задержался.
 */
export const usePictureKnown = () => {
  const queryClient = useQueryClient()

  return (projectId: string, source: PictureSource): boolean =>
    !('place' in source) ||
    queryClient.getQueryData(pictureQuery(projectId, source.place, false).queryKey) !== undefined
}
