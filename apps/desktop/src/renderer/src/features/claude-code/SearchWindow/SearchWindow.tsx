import { useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { IconButton } from '@agentic-workstation/ui/IconButton'
import { Tabs } from '@agentic-workstation/ui/Tabs'

import { useNow } from '../clock.hooks'
import { AI_CLOCK_MS, SEARCH_KEYS, SEARCH_TABS } from '../search.constants'
import type { SearchTab } from '../search.types'
import { emptyLine, footStatus } from '../search.utils'
import { AI_ICON } from '../../../lib/ai-icon.constants'
import { shortcutLabel } from '../../../lib/keys'
import {
  useEndWithTab,
  useWindowKeys,
  useHitSelection,
  useSearchWindow,
} from './SearchWindow.hooks'
import styles from './SearchWindow.module.scss'
import type { SearchWindowProps } from './SearchWindow.types'
import { AiProgress } from './parts/AiProgress'
import { AskField } from './parts/AskField'
import { HitList } from './parts/HitList'
import { SearchError } from './parts/SearchError'
import { SearchField } from './parts/SearchField'

/**
 * Окно поиска по разговорам (как в ACC) - слой над всей панелью: вкладки со счётчиками
 * (этот чат, все чаты, спросить модель), поле, находки и подвал со счётом. Escape и клик
 * мимо прячут окно с запросом и ответами, крестик кончает поиск целиком. Правила, что
 * такое находка и где она стоит, - в search.utils, ищет главный процесс.
 */
export const SearchWindow = ({ project, conversation }: SearchWindowProps) => {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const view = useSearchWindow(project, conversation)
  const { search, ask, hits } = view
  const selection = useHitSelection(hits)
  const isRunning = search.ai.runId !== null
  const now = useNow(isRunning, AI_CLOCK_MS)
  const handleKeyDown = useWindowKeys({
    tab: search.tab,
    hits,
    selected: selection.selected,
    isRunning,
    areaRef,
    onSelect: selection.setSelected,
    onUnfold: selection.unfold,
    onPick: view.pick,
    onRunAi: ask.run,
    onDismiss: view.dismiss,
  })

  useEndWithTab(view.close)

  // Поле берёт клавиатуру, как только окно открылось или сменилась вкладка: поиск набирают.
  useEffect(() => {
    if (!search.isOpen) return

    if (search.tab === 'ai') areaRef.current?.focus()
    else inputRef.current?.focus()
  }, [search.isOpen, search.tab])

  if (!search.isOpen) return null

  const isAi = search.tab === 'ai'
  const tabs = SEARCH_TABS.map((id) => ({
    id,
    label: t(`claudeCode.search.tabs.${id}`),
    icon: id === 'ai' ? AI_ICON : undefined,
    count: id === 'ai' ? search.ai.hits.length : view.counts[id],
    hint: shortcutLabel(SEARCH_KEYS[id].join('')),
  }))
  const failure = isAi
    ? search.ai.failure &&
      (search.ai.failure.detail || t(`claudeCode.search.aiFailures.${search.ai.failure.reason}`))
    : view.answer?.failed && t('claudeCode.search.failed')

  const handleTab = (tab: SearchTab) => search.setTab(tab)

  return (
    <>
      <div className={styles.scrim} onClick={view.dismiss} />
      <div
        className={styles.window}
        role="dialog"
        aria-modal
        aria-label={t('claudeCode.search.title')}
        onKeyDown={handleKeyDown}>
        <div className={styles.head}>
          <div className={styles.tabsBox}>
            <Tabs
              label={t('claudeCode.search.tabsLabel')}
              items={tabs}
              value={search.tab}
              onChange={handleTab}
            />
          </div>
          <span className={styles.fill} />
          <IconButton
            icon={X}
            size="sm"
            label={t('claudeCode.search.close')}
            onClick={view.close}
          />
        </div>
        {isAi ? (
          <AskField
            areaRef={areaRef}
            query={search.ai.query}
            isRunning={isRunning}
            onQuery={search.setAiQuery}
            onRun={ask.run}
            onCancel={ask.cancel}
          />
        ) : (
          <SearchField
            inputRef={inputRef}
            query={search.query}
            isLoading={view.isLoading}
            matchCase={search.matchCase}
            wholeWords={search.wholeWords}
            onQuery={search.setQuery}
            onMatchCase={() => search.setMatchCase(!search.matchCase)}
            onWholeWords={() => search.setWholeWords(!search.wholeWords)}
          />
        )}
        {failure && <SearchError text={failure} onRetry={isAi ? ask.run : view.retry} />}
        {isAi && isRunning ? (
          <AiProgress
            steps={search.ai.steps}
            seconds={Math.max(0, Math.floor((now - search.ai.startedAt) / AI_CLOCK_MS))}
          />
        ) : (
          <HitList
            tab={search.tab}
            hits={hits}
            selected={selection.selected}
            unfolded={selection.unfolded}
            emptyText={emptyLine(t, search.tab, {
              query: search.query,
              hasChat: view.hasChat,
              answered: view.answer?.scope === search.tab,
              aiAnswered: search.ai.answered,
            })}
            onPick={view.pick}
            onUnfold={selection.unfold}
          />
        )}
        <div className={styles.foot}>
          {footStatus(t, search.tab, {
            shown: hits.length,
            total: isAi ? hits.length : (view.answer?.total ?? 0),
            conversations: view.counts.conversations,
          })}
        </div>
      </div>
    </>
  )
}
