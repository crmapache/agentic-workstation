import type { RefObject, KeyboardEvent } from 'react'

import type { SearchHit, AiSearchStep } from '@shared/claude-search'
import type { Conversation } from '@shared/conversation'
import type { Project } from '@shared/workspace'

import type { SearchTab } from '../search.types'

export type SearchWindowProps = {
  project: Project
  /** Разговор вкладки под окном - «This chat»; null - у проекта нет разговоров. */
  conversation: Conversation | null
}

export type SearchFieldProps = {
  inputRef: RefObject<HTMLInputElement | null>
  query: string
  /** Запрос в пути - кольцо в поле; счётчиков рядом нет, счёт на вкладках и в подвале. */
  isLoading: boolean
  matchCase: boolean
  wholeWords: boolean
  onQuery: (query: string) => void
  onMatchCase: () => void
  onWholeWords: () => void
}

export type AskFieldProps = {
  areaRef: RefObject<HTMLTextAreaElement | null>
  query: string
  isRunning: boolean
  onQuery: (query: string) => void
  onRun: () => void
  onCancel: () => void
}

export type HitListProps = {
  tab: SearchTab
  hits: readonly SearchHit[]
  selected: number
  unfolded: ReadonlySet<string>
  /** Что сказать, когда список пуст. */
  emptyText: string
  onPick: (hit: SearchHit) => void
  onUnfold: (uuid: string) => void
}

export type HitRowProps = {
  hit: SearchHit
  index: number
  selected: boolean
  /** В одном чате время стоит на строке; по всем чатам - в заголовке группы. */
  withTime: boolean
  unfolded: boolean
  onPick: () => void
  onUnfold: () => void
}

export type AiProgressProps = {
  steps: readonly Omit<AiSearchStep, 'runId'>[]
  seconds: number
}

export type SearchErrorProps = {
  text: string
  onRetry: () => void
}

/** Что нужно клавишам окна: где стоят, что выбрано, что делать. */
export type WindowKeys = {
  tab: SearchTab
  hits: readonly SearchHit[]
  selected: number
  isRunning: boolean
  areaRef: RefObject<HTMLTextAreaElement | null>
  onSelect: (index: number) => void
  onUnfold: (uuid: string, open: boolean) => void
  onPick: (hit: SearchHit) => void
  onRunAi: () => void
  onDismiss: () => void
}

export type WindowKeyHandler = (event: KeyboardEvent<HTMLDivElement>) => void
