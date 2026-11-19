import { useId, useRef, useState, useEffect, useCallback, useLayoutEffect } from 'react'
import type { RefObject, ToggleEvent } from 'react'

import { isOwnToggle } from './Popover.utils'

/**
 * Клик в другое приложение или по рабочему столу браузер кликом мимо не считает, а
 * системное меню в этот момент закрывается - так же ведёт себя и открытая панель.
 */
const useHideOnWindowBlur = (ref: RefObject<HTMLDivElement | null>, isOpen: boolean) => {
  useEffect(() => {
    if (!isOpen) return

    const handleBlur = () => ref.current?.hidePopover()

    window.addEventListener('blur', handleBlur)

    return () => window.removeEventListener('blur', handleBlur)
  }, [ref, isOpen])
}

/**
 * Связка кнопки и всплывающей панели. Кнопке - triggerProps (открыть, закрыть,
 * aria-expanded), панели - popoverProps. Открытие, закрытие по клику мимо и по Esc
 * делает сам браузер (Popover API), здесь - состояние для отрисовки, открытие из кода
 * (сочетание клавиш) и закрытие, когда окно теряет фокус.
 */
export const usePopover = () => {
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(false)

  useHideOnWindowBlur(ref, isOpen)

  const open = useCallback(() => {
    if (!ref.current?.matches(':popover-open')) ref.current?.showPopover()
  }, [])

  const close = useCallback(() => ref.current?.hidePopover(), [])

  const handleToggle = useCallback((event: ToggleEvent<HTMLDivElement>) => {
    if (isOwnToggle(event)) setIsOpen(event.newState === 'open')
  }, [])

  return {
    isOpen,
    open,
    close,
    triggerProps: { popoverTarget: id, 'aria-expanded': isOpen },
    popoverProps: { id, ref, onToggle: handleToggle },
  }
}

/**
 * Панель у якоря, который назначает код, а не кнопка: меню правой кнопки (у вкладки, у
 * точки в коде), выбор из ответа главного процесса. Есть якорь - панель открыта у него,
 * null - закрыта; закрылась сама (клик мимо, Esc, выбор пункта, уход из окна) - onClose.
 * Открывается на шаге раскладки, раньше эффектов: Menu с autoFocus ставит фокус своим
 * эффектом, а в закрытой панели фокус не встаёт.
 */
export const useAnchoredPopover = (anchor: HTMLElement | null, onClose: () => void) => {
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const popover = ref.current

    if (!popover || !anchor) return

    popover.showPopover({ source: anchor })

    return () => {
      if (popover.matches(':popover-open')) popover.hidePopover()
    }
  }, [anchor])

  useHideOnWindowBlur(ref, anchor !== null)

  const handleToggle = (event: ToggleEvent<HTMLDivElement>) => {
    if (isOwnToggle(event) && event.newState === 'closed') onClose()
  }

  return { id, ref, onToggle: handleToggle }
}
