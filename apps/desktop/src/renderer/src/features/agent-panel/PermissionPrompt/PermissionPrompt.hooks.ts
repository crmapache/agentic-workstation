import { usePaneKey } from '../pane-keys.hooks'
import { typedInto } from '../pane-keys.utils'

/**
 * Цифры 1-3 нажимают кнопки карточки, как в терминале: только пока человек не печатает -
 * поле сообщения пустое или фокус вне полей. Разрешение держит ход крепче всего, поэтому
 * цифры его, даже если рядом висит вопрос.
 */
export const useDigitHotkeys = (actions: readonly (() => void)[]) =>
  usePaneKey((event, composerEmpty) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false
    if (typedInto(event.target, composerEmpty)) return false

    const action = actions[Number(event.key) - 1]

    if (!/^[1-9]$/.test(event.key) || !action) return false

    event.preventDefault()
    action()

    return true
  })
