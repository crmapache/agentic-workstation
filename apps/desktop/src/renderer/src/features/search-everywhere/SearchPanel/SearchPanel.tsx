import { useRef, Fragment, useState, useEffect } from 'react'
import type { KeyboardEvent } from 'react'
import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ListBox } from '@agentic-workstation/ui/ListBox'
import { useListBox } from '@agentic-workstation/ui/ListBox.hooks'
import { MenuSection } from '@agentic-workstation/ui/MenuSection'
import { Tabs } from '@agentic-workstation/ui/Tabs'
import { TextField } from '@agentic-workstation/ui/TextField'

import { SEARCH_TABS } from '../search-everywhere.constants'
import type { SearchTab, SearchResult } from '../search-everywhere.types'
import { resultKey, openResult, sectionOffsets } from '../search-results.utils'
import { cycleTab } from '../search-shortcuts.utils'
import { useSearchResults } from './SearchPanel.hooks'
import styles from './SearchPanel.module.scss'
import type { SearchPanelProps } from './SearchPanel.types'
import { SearchResultOption } from './parts/SearchResultOption'
import { SearchStatusLine } from './parts/SearchStatusLine'

/**
 * Содержимое поиска везде, как в WebStorm: вкладки, поле и список. Фокус всё время в
 * поле: стрелки двигают выделение, Enter открывает файл или запускает действие, Tab
 * переключает вкладку. Монтируется при каждом открытии - запрос всегда новый.
 */
export const SearchPanel = ({
  projectId,
  actions,
  tab,
  onTabChange,
  onOpenFile,
  onClose,
}: SearchPanelProps) => {
  const { t } = useTranslation()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const search = useSearchResults({ tab, query, projectId, actions })
  const list = useListBox(search.results.length, search.listKey)
  const pendingEnterRef = useRef(false)

  // Нажатие по всему листу панели, что не поле (лупа, заголовок группы, строка под
  // списком, отступ самого листа), не уводит фокус из поля. Слушатель - на листе
  // целиком: его отступ вокруг содержимого этому компоненту не принадлежит. Вкладки
  // кликаются как обычно и сами вернут фокус в поле.
  useEffect(() => {
    const sheet = rootRef.current?.closest<HTMLElement>('[popover]')

    if (!sheet) return

    const keepFocus = (event: MouseEvent) => {
      if (event.target !== inputRef.current) event.preventDefault()
    }

    sheet.addEventListener('mousedown', keepFocus)

    return () => sheet.removeEventListener('mousedown', keepFocus)
  }, [])

  // Enter нажали, пока список был от прошлого запроса: выполнить его на свежем списке,
  // как WebStorm, - выделение там уже на первой строке.
  useEffect(() => {
    if (!pendingEnterRef.current || search.isStale) return

    pendingEnterRef.current = false

    const [first] = search.results

    if (!first) return

    onClose()
    openResult(first, onOpenFile)
  }, [search.isStale, search.results, onClose, onOpenFile])

  const tabItems = SEARCH_TABS.map((id) => ({ id, label: t(`searchEverywhere.tabs.${id}`) }))
  const offsets = sectionOffsets(search.sections)

  const handleChoose = (result: SearchResult) => {
    onClose()
    openResult(result, onOpenFile)
  }

  const handleTabChange = (next: SearchTab) => {
    onTabChange(next)
    inputRef.current?.focus()
  }

  const handleSelectIndex = (index: number) => {
    const result = search.results[index]

    if (result) handleChoose(result)
  }

  // Новая буква после Enter - это уже другой запрос: отложенный Enter отменяется.
  const handleQueryChange = (value: string) => {
    pendingEnterRef.current = false
    setQuery(value)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && search.isStale && !event.nativeEvent.isComposing) {
      event.preventDefault()
      pendingEnterRef.current = true

      return
    }

    if (list.handleKeyDown(event, handleSelectIndex) || event.key !== 'Tab') return

    event.preventDefault()
    onTabChange(cycleTab(tab, event.shiftKey ? -1 : 1))
  }

  return (
    <div ref={rootRef} className={styles.searchPanel}>
      <Tabs
        label={t('searchEverywhere.tabsLabel')}
        items={tabItems}
        value={tab}
        onChange={handleTabChange}
      />
      <TextField
        {...list.comboboxProps}
        ref={inputRef}
        label={t('searchEverywhere.label')}
        hideLabel
        icon={Search}
        placeholder={t(`searchEverywhere.placeholder.${tab}`)}
        value={query}
        autoFocus
        onChange={handleQueryChange}
        onKeyDown={handleKeyDown}
      />
      {search.results.length > 0 && (
        <ListBox {...list.listBoxProps} label={t(`searchEverywhere.tabs.${tab}`)}>
          {search.sections.map((section, sectionIndex) => {
            const start = offsets[sectionIndex] ?? 0
            const options = section.results.map((result, index) => (
              <SearchResultOption
                key={resultKey(result)}
                id={list.optionId(start + index)}
                result={result}
                active={start + index === list.activeIndex}
                onSelect={() => handleChoose(result)}
                onActivate={() => list.setActiveIndex(start + index)}
              />
            ))

            return tab === 'all' ? (
              <MenuSection
                key={section.kind}
                title={t(`searchEverywhere.sections.${section.kind}`)}>
                {options}
              </MenuSection>
            ) : (
              <Fragment key={section.kind}>{options}</Fragment>
            )
          })}
        </ListBox>
      )}
      <SearchStatusLine
        tab={tab}
        status={search.status}
        isFilesTruncated={search.isFilesTruncated}
        isTextTruncated={search.isTextTruncated}
      />
    </div>
  )
}
