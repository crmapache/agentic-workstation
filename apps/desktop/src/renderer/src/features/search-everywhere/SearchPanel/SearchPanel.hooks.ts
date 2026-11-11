import { useMemo, useDeferredValue } from 'react'

import { FILES_LIMIT, TEXT_DEBOUNCE_MS, ALL_TAB_GROUP_LIMIT } from '../search-everywhere.constants'
import { useTextSearch, useProjectFiles } from '../search-everywhere.queries'
import {
  rankFiles,
  resultKey,
  isTextQuery,
  rankActions,
  searchStatus,
  buildSections,
  toTextResults,
  flattenSections,
} from '../search-results.utils'
import { useDebouncedValue } from '../../../lib/debounce.hooks'
import type { SearchResultsInput } from './SearchPanel.types'

/**
 * Результаты поиска для вкладки: группы для списка, плоский список для клавиш, ключ
 * показанного списка и что написать под ним. Файлы ранжируются в окне на каждую букву
 * (список уже здесь), текст ищет главный процесс - после паузы в наборе.
 */
export const useSearchResults = ({ tab, query, projectId, actions }: SearchResultsInput) => {
  const typed = query.trim().normalize('NFC')
  const needle = useDeferredValue(typed)
  const textQuery = useDebouncedValue(needle, TEXT_DEBOUNCE_MS)
  const files = useProjectFiles(projectId)
  const text = useTextSearch(tab === 'text' ? projectId : undefined, textQuery)
  const wantsFiles = tab === 'all' || tab === 'files'
  const wantsText = tab === 'text' && isTextQuery(needle)
  const preparedFiles = files.data?.files

  const fileResults = useMemo(
    () =>
      wantsFiles && preparedFiles
        ? rankFiles(preparedFiles, needle, tab === 'all' ? ALL_TAB_GROUP_LIMIT : FILES_LIMIT)
        : [],
    [wantsFiles, preparedFiles, needle, tab],
  )
  const actionResults = useMemo(() => rankActions(actions, needle), [actions, needle])
  const textResults = wantsText && text.data ? toTextResults(text.data.matches) : []

  const sections = buildSections(tab, {
    files: fileResults,
    actions: tab === 'all' && needle === '' ? [] : actionResults,
    text: textResults,
  })
  const results = flattenSections(sections)

  // Выделение сбрасывается, когда меняется сам список на экране, а не набранный
  // текст: ответ на текст и отложенный запрос приходят позже нажатий.
  const listKey = `${tab}\n${results.map(resultKey).join('\n')}`

  const isTextPending =
    wantsText && (textQuery !== needle || text.isFetching || text.isPlaceholderData)
  const isPending = isTextPending || (wantsFiles && files.isPending && projectId !== undefined)

  return {
    sections,
    results,
    listKey,
    // Список ещё от прошлого запроса: отложенное ранжирование не догнало последнюю
    // букву или ответ на текст ещё не пришёл. Enter по такому списку открыл бы чужое.
    isStale: needle !== typed || isTextPending,
    status: searchStatus({
      tab,
      needle,
      hasProject: projectId !== undefined,
      resultCount: results.length,
      isPending,
    }),
    isFilesTruncated: wantsFiles && (files.data?.truncated ?? false),
    isTextTruncated: wantsText && (text.data?.truncated ?? false),
  }
}
