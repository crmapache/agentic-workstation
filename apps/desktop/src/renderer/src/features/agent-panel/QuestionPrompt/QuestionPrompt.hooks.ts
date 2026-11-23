import { useState } from 'react'
import type { DragEvent, KeyboardEvent } from 'react'

import type { DraftToken } from '@shared/message-draft'
import type { CommandEntry } from '@shared/slash-catalog'

import type { AskDraft } from '../ask-draft.types'
import {
  askAnswers,
  togglePick,
  askAnswered,
  openOwnAnswer,
  writeOwnAnswer,
  EMPTY_ASK_DRAFT,
  firstUnanswered,
} from '../ask-draft.utils'
import { useComposerStore } from '../composer.store'
import { useConversationActions } from '../conversation-actions.hooks'
import { useFieldClipboard } from '../field-clipboard.hooks'
import { carriesFiles } from '../field-clipboard.utils'
import { useFieldInsert } from '../field-insert.hooks'
import { fieldOwnKey } from '../field-keys.utils'
import { useField } from '../field.hooks'
import { usePaneKey } from '../pane-keys.hooks'
import { typedInto } from '../pane-keys.utils'
import { useIdePrefs } from '../../../state/ide-prefs.queries'
import { MAX_DIGIT_KEYS } from './QuestionPrompt.constants'
import type { OwnAnswerFieldProps, QuestionPromptProps } from './QuestionPrompt.types'

/** В своём ответе команд «/» нет: набранное имя чипом не становится. */
const NO_COMMANDS: readonly CommandEntry[] = []

/**
 * Вопрос с вариантами (как в ACC): черновик ответов - вне карточки (смена вкладки её
 * пересобирает), цифры 1-9 выбирают вариант текущего вопроса, «Other» - на следующей
 * цифре; одиночный выбор сам ведёт к следующему вопросу, множественный - по Enter.
 * Enter: всё отвечено - отправить, иначе - дальше. Чужие поля и черновик в поле не трогаем.
 */
export const useQuestion = ({ conversation, request }: QuestionPromptProps) => {
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
    writeOwn: (index: number, tokens: DraftToken[]) =>
      write((current) => writeOwnAnswer(current, index, tokens)),
    submit,
    dismiss: () =>
      void respond(conversation.id, request.requestId, {
        kind: 'permission',
        decision: { behavior: 'deny', message: '' },
      }),
  }
}

/**
 * Поле своего ответа - то же поле с чипами, что у сообщения: файл и картинка из буфера, Finder и
 * дерева встают чипами, а не путями, длинная вставка сворачивается, отмена - своя. Ответ одной
 * строкой, как прежде: Enter строку не переносит, Shift+Enter - переносит.
 */
export const useOwnAnswerField = (
  { projectId, tokens, onChange }: Pick<OwnAnswerFieldProps, 'projectId' | 'tokens' | 'onChange'>,
  chipClassName: string,
) => {
  const { pasteCollapse } = useIdePrefs()
  const field = useField({ tokens, onChange, imageBase: 0, commands: NO_COMMANDS, chipClassName })
  const insert = useFieldInsert(field)
  const clipboard = useFieldClipboard({
    field,
    insert,
    projectId,
    pasteCollapse,
    imageBase: 0,
    commands: NO_COMMANDS,
  })

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing || fieldOwnKey(event, field)) return
    if (event.key !== 'Enter') return

    event.preventDefault()

    // Перенос - командой браузера, как у поля сообщения: свой узел через Range теряет каретку.
    if (event.shiftKey) document.execCommand('insertLineBreak')
  }

  // Бросить сюда можно только файлы: брошенный текст браузер ставит в точку броска сам.
  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (carriesFiles(event.dataTransfer)) event.preventDefault()
  }

  return { field, clipboard, handleKeyDown, handleDragOver }
}
