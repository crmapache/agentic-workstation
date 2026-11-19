import { useState } from 'react'
import type { ClipboardEvent } from 'react'

import type { AskDraft } from '../ask-draft.types'
import {
  askAnswers,
  togglePick,
  askAnswered,
  openOwnAnswer,
  writeOwnAnswer,
  EMPTY_ASK_DRAFT,
  firstUnanswered,
  pasteIntoOwnAnswer,
} from '../ask-draft.utils'
import { useComposerStore } from '../composer.store'
import { useConversationActions } from '../conversation-actions.hooks'
import { usePaneKey } from '../pane-keys.hooks'
import { typedInto } from '../pane-keys.utils'
import { pastedPaths } from '../pasted-files'
import { MAX_DIGIT_KEYS } from './QuestionPrompt.constants'
import type { QuestionPromptProps } from './QuestionPrompt.types'

/**
 * Вопрос с вариантами (как в ACC): черновик ответов - вне карточки (смена вкладки её
 * пересобирает), цифры 1-9 выбирают вариант текущего вопроса, «Other» - на следующей
 * цифре; одиночный выбор сам ведёт к следующему вопросу, множественный - по Enter.
 * Enter: всё отвечено - отправить, иначе - дальше. Чужие поля и черновик в поле не трогаем.
 */
export const useQuestion = ({ projectId, conversation, request }: QuestionPromptProps) => {
  const { respond } = useConversationActions()
  const { questions } = request
  const draft = useComposerStore((store) => store.askDrafts[request.requestId] ?? EMPTY_ASK_DRAFT)
  const setAskDraft = useComposerStore((store) => store.setAskDraft)
  const [active, setActive] = useState(() => Math.max(firstUnanswered(questions, draft), 0))
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [openedHere, setOpenedHere] = useState<readonly number[]>([])
  const answered = askAnswered(questions, draft)

  /** Черновик в моменте: два нажатия за кадр строятся одно на другом, а не на старом. */
  const write = (change: (current: AskDraft) => AskDraft) =>
    setAskDraft(
      request.requestId,
      change(useComposerStore.getState().askDrafts[request.requestId] ?? EMPTY_ASK_DRAFT),
    )

  const submit = () => {
    const current = useComposerStore.getState().askDrafts[request.requestId] ?? EMPTY_ASK_DRAFT

    void respond(conversation.id, request.requestId, {
      kind: 'question',
      answers: askAnswers(questions, current),
    }).then(() => setAskDraft(request.requestId, null))
  }

  const openOther = (index: number) => {
    const question = questions[index]

    if (!question) return

    setOpenedHere((current) => [...current, index])
    write((current) => openOwnAnswer(current, question, index))
  }

  const pick = (index: number, label: string) => {
    const question = questions[index]

    if (!question) return

    write((current) => togglePick(current, question, index, label))

    if (question.multiSelect) return

    const next = firstUnanswered(
      questions,
      useComposerStore.getState().askDrafts[request.requestId] ?? EMPTY_ASK_DRAFT,
      index,
    )

    if (next >= 0) setActive(next)
  }

  const pasteOwn = (index: number) => (event: ClipboardEvent<HTMLInputElement>) => {
    const files = Array.from(event.clipboardData.files)

    if (files.length === 0) return

    event.preventDefault()

    const at = event.currentTarget.selectionStart ?? event.currentTarget.value.length
    const to = event.currentTarget.selectionEnd ?? at

    void pastedPaths(projectId, files).then((paths) => {
      if (paths.length > 0) write((current) => pasteIntoOwnAnswer(current, index, paths, at, to))
    })
  }

  usePaneKey((event, composerEmpty) => {
    if (event.metaKey || event.ctrlKey || event.altKey || typedInto(event.target, composerEmpty)) {
      return false
    }

    const question = questions[active]

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()

      if (answered) submit()
      else setActive((index) => Math.max(firstUnanswered(questions, draft, index), index))

      return true
    }

    const digit = Number(event.key) - 1

    if (!question || !Number.isInteger(digit) || digit < 0 || digit >= MAX_DIGIT_KEYS) return false

    const option = question.options[digit]

    if (!option && digit !== question.options.length) return false

    event.preventDefault()

    if (option) pick(active, option.label)
    else openOther(active)

    return true
  }, !isCollapsed)

  return {
    draft,
    active,
    answered,
    isCollapsed,
    openedHere,
    setActive,
    toggleCollapsed: () => setIsCollapsed((value) => !value),
    pick,
    openOther,
    writeOwn: (index: number, value: string) =>
      write((current) => writeOwnAnswer(current, index, value)),
    pasteOwn,
    submit,
    dismiss: () =>
      void respond(conversation.id, request.requestId, {
        kind: 'permission',
        decision: { behavior: 'deny', message: '' },
      }),
  }
}
