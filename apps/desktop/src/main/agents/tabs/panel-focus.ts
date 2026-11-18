/**
 * Стоит ли фокус в правой панели Claude Code. Его сообщает окно (claude:setPanelFocus),
 * а читает меню приложения: ⌘W при фокусе в панели закрывает вкладку разговора, а не
 * окно, ⌘R не перезагружает окно посреди набора. Меню нажатие забирает раньше
 * страницы, поэтому решать приходится здесь, а не в окне.
 */
let focused = false

export const setPanelFocused = (value: boolean): void => {
  focused = value
}

export const isPanelFocused = (): boolean => focused
