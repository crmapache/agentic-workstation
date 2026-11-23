import type { Question, Conversation, PendingRequest } from '@shared/conversation'
import type { DraftToken } from '@shared/message-draft'

import type { AskDraft } from '../ask-draft.types'

export type QuestionRequest = Extract<PendingRequest, { kind: 'question' }>

export type QuestionPromptProps = {
  /** Проект панели: вставленный в свой ответ файл называется путём от его корня. */
  projectId: string
  conversation: Conversation
  request: QuestionRequest
}

export type QuestionBlockProps = {
  /** Проект панели: вставленный в свой ответ файл называется путём от его корня. */
  projectId: string
  question: Question
  index: number
  draft: AskDraft
  /** Цифры сейчас у этого вопроса: у остальных подсказки цифр приглушены. */
  isKeyed: boolean
  /** Поле «Other» открыли нажатием сейчас: только оно забирает фокус. */
  grabsFocus: boolean
  onPick: (label: string) => void
  onOther: () => void
  onOwnAnswer: (tokens: DraftToken[]) => void
  onFocus: () => void
}

export type OwnAnswerFieldProps = {
  projectId: string
  tokens: DraftToken[]
  label: string
  placeholder: string
  autoFocus: boolean
  onChange: (tokens: DraftToken[]) => void
  onFocus: () => void
}
