/**
 * Открыть меню правой кнопки, когда кнопку отпустят. На macOS contextmenu приходит при
 * нажатии, а отпускание браузер считает кликом мимо уже открытой панели (Popover API) и
 * закрывает её: меню мигнуло бы и пропало. Поэтому при зажатой кнопке открытие ждёт
 * отпускания, а с клавиатуры (кнопок нет) идёт сразу. Панель потом - useAnchoredPopover.
 */
export const openWhenReleased = (event: Pick<MouseEvent, 'buttons'>, open: () => void) => {
  if (event.buttons === 0) return open()

  const controller = new AbortController()
  const options = { capture: true, signal: controller.signal }

  window.addEventListener(
    'pointerup',
    () => {
      controller.abort()
      // Клик мимо разбирается в той же обработке отпускания - открыть уже после неё.
      setTimeout(open)
    },
    options,
  )
  window.addEventListener('pointercancel', () => controller.abort(), options)
}

/**
 * Своё ли событие toggle у панели. React отдаёт onToggle и то, что пришло от панелей внутри неё:
 * подсказка у пути в коде, закрываясь, «закрывала» и саму панель - та оставалась открытой, но
 * пустой рамкой (жалоба владельца на панель фоновой команды).
 */
export const isOwnToggle = (event: Pick<Event, 'target' | 'currentTarget'>): boolean =>
  event.target === event.currentTarget
