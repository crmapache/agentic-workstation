import type { RefObject } from 'react'

import type { Conversation } from '@shared/conversation'
import type { Project } from '@shared/workspace'

import type { FitStep } from '../composer-fit.utils'
import type { SuggestRow } from '../suggestions.types'

export type ComposerProps = {
  project: Project
  /** null - у проекта ещё нет разговора: первое сообщение его создаст. */
  conversation: Conversation | null
  /** Ключ черновика: разговор или, пока его нет, путь проекта. */
  draftKey: string
}

export type SuggestListProps = {
  /** id списка - на него ссылается поле (aria-controls, aria-activedescendant). */
  id: string
  rows: readonly SuggestRow[]
  highlight: number
  /** Список файлов по «@» - другая подпись для скринридера. */
  isFiles: boolean
  onPick: (row: SuggestRow) => void
  onHover: (index: number) => void
}

export type GhostHintProps = {
  /** Синтаксис аргумента серым - там, где встанет следующий символ. */
  hint: string
  fieldRef: RefObject<HTMLDivElement | null>
  boxRef: RefObject<HTMLDivElement | null>
}

/** Кнопки ряда под полем, которые что-то делают с сообщением: скрепка, «/» и лупа. */
export type WritingToolsProps = {
  canSlash: boolean
  onAttach: () => void
  onSlash: () => void
  /** Лупа - окно поиска по разговорам над панелью; null - провайдер поиска не умеет. */
  onSearch: (() => void) | null
  /** Что ряд отдал на узкой панели: «/» и лупу (composer-fit.utils.ts). */
  dropped: ReadonlySet<FitStep>
}

export type ContextMeterProps = { conversation: Conversation }

/** Подпись кнопки, которая на узкой панели сужается до первой буквы. */
export type FitLabelProps = { text: string }

/** Кнопки хода справа: Stop, «не отвечает», Queue и Send (Run у «!»). */
export type SendButtonsProps = {
  conversation: Conversation | null
  canSend: boolean
  isShell: boolean
  /** В поле вопрос сбоку (/btw): Send - «Ask aside», Queue нет. */
  isAside: boolean
  /** Клавиша отправки сейчас ставит в очередь (сообщение вынимали поправить). */
  keyQueues: boolean
  onSend: () => void
  onQueue: () => void
}
