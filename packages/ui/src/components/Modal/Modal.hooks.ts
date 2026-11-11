import type { RefObject, MouseEvent, SyntheticEvent } from 'react'
import { useRef, useEffect } from 'react'

import { AUTOFOCUS_SELECTOR } from '../Menu/Menu.constants'

/**
 * Щелчок мимо окна закрывает его. У нативного <dialog> щелчок по затемнению приходит в
 * сам <dialog> (содержимое закрывает его рамку целиком), и считается только тот, что и
 * начался там: выделение текста, отпущенное за краем окна, окно не закрывает.
 */
export const useBackdropClose = (onClose: () => void) => {
  const pressedOutside = useRef(false)

  const handleMouseDown = (event: MouseEvent<HTMLDialogElement>) => {
    pressedOutside.current = event.target === event.currentTarget
  }

  const handleClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (pressedOutside.current && event.target === event.currentTarget) onClose()

    pressedOutside.current = false
  }

  return { onMouseDown: handleMouseDown, onClick: handleClick }
}

/**
 * Фокус при открытии. autoFocus поля внутри не срабатывает: React ставит его, пока окно
 * ещё закрыто, а showModal уводит фокус на первую кнопку - крестик, и над ним всплывает
 * подсказка. Поэтому, как у Menu: поле с data-autofocus получает фокус после открытия, а
 * нет такого - само окно (Esc работает, Tab идёт с начала).
 */
export const useInitialFocus = (ref: RefObject<HTMLDialogElement | null>, open: boolean) => {
  useEffect(() => {
    const dialog = ref.current

    if (!open || !dialog) return

    const target = dialog.querySelector<HTMLElement>(AUTOFOCUS_SELECTOR)

    ;(target ?? dialog).focus()
  }, [open, ref])
}

/**
 * Закрылось именно это окно. React доносит close вложенного окна (справка поверх окна) до
 * обработчиков снаружи, как всплытие, хотя в браузере close не всплывает: без проверки Esc
 * в справке закрывал бы и окно под ней.
 */
export const ownClose = (onClose: () => void) => (event: SyntheticEvent<HTMLDialogElement>) => {
  if (event.target === event.currentTarget) onClose()
}
