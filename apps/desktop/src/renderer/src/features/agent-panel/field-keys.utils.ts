import type { KeyboardEvent } from 'react'

import type { Field } from './field.types'

/** Буква по месту клавиши или по символу: ⌘Z работает и в другой раскладке. */
export const isLetter = (event: KeyboardEvent, letter: string) =>
  event.code === `Key${letter.toUpperCase()}` || event.key.toLowerCase() === letter

/**
 * Клавиши поля с чипами, общие у поля сообщения и своего ответа на вопрос: подсвеченный чип
 * (стрелки, Backspace) и своя история отмен - браузерная чипов не видит. true - клавиша их.
 */
export const fieldOwnKey = (event: KeyboardEvent<HTMLDivElement>, field: Field): boolean => {
  if (field.handleChipKey(event.nativeEvent)) return true
  if (!(event.metaKey || event.ctrlKey) || !(isLetter(event, 'z') || isLetter(event, 'y'))) {
    return false
  }

  event.preventDefault()

  if (isLetter(event, 'y') || event.shiftKey) field.redo()
  else field.undo()

  return true
}
