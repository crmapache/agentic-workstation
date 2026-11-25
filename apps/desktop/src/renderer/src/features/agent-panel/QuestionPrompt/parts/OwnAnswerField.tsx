import { useEffect } from 'react'

import { useOwnAnswerField } from '../QuestionPrompt.hooks'
import styles from '../QuestionPrompt.module.scss'
import type { OwnAnswerFieldProps } from '../QuestionPrompt.types'
import { takeKeyboard } from '../../field-dom'
import { FieldChips } from '../../FieldChips/FieldChips'

/**
 * Свой ответ на вопрос («Other») - поле с чипами, как у сообщения: вставленный или брошенный
 * файл и картинка видны чипом (у картинки - превью под курсором), а модели уходят ссылкой
 * «@путь». Цифры в нём - текст, а не выбор варианта (data-typed-field).
 */
export const OwnAnswerField = ({
  label,
  placeholder,
  autoFocus,
  onFocus,
  ...props
}: OwnAnswerFieldProps) => {
  const { field, clipboard, handleKeyDown, handleDragOver } = useOwnAnswerField(
    props,
    styles.chip ?? '',
  )
  const { fieldRef, lastCaret } = field

  // Поле открыли нажатием «Other» - печатать сразу, как у прежнего поля с autoFocus.
  useEffect(() => {
    if (autoFocus && fieldRef.current) takeKeyboard(fieldRef.current, lastCaret.current)
  }, [autoFocus, fieldRef, lastCaret])

  const handleFocus = () => {
    field.handleFocus()
    onFocus()
  }

  return (
    <>
      <div
        ref={fieldRef}
        role="textbox"
        aria-multiline
        aria-label={label}
        className={styles.ownAnswer}
        data-placeholder={props.tokens.length > 0 ? undefined : placeholder}
        data-typed-field
        contentEditable
        suppressContentEditableWarning
        onInput={(event) => field.handleInput(event.nativeEvent)}
        onCompositionEnd={field.handleCompositionEnd}
        onKeyDown={handleKeyDown}
        onPaste={clipboard.handlePaste}
        onCopy={clipboard.handleCopy}
        onCut={clipboard.handleCut}
        onDragStart={clipboard.handleDragStart}
        onDragOver={handleDragOver}
        onDrop={clipboard.handleDrop}
        onMouseDown={(event) => field.handleMouseDown(event.nativeEvent)}
        onFocus={handleFocus}
      />
      <FieldChips registry={field.registry} fieldRef={fieldRef} />
    </>
  )
}
