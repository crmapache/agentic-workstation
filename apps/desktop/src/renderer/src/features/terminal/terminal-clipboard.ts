import type { Terminal } from '@xterm/xterm'

/**
 * Копирование и вставка в терминале Windows (ADR 0048), как в Windows Terminal: Ctrl+C с
 * выделением копирует его, без выделения уходит оболочке (прервать команду); Ctrl+V и
 * Ctrl+Shift+V вставляют, Ctrl+Shift+C копирует всегда. На маке это ⌘C и ⌘V - их xterm и так
 * отдаёт браузеру. Ответ false - xterm нажатие не берёт: вставку делает браузер своим событием
 * paste, его xterm и ловит.
 */
export const windowsClipboardKeys =
  (term: Terminal) =>
  (event: KeyboardEvent): boolean => {
    if (event.type !== 'keydown' || !event.ctrlKey || event.altKey || event.metaKey) return true
    if (event.code === 'KeyV') return false
    if (event.code !== 'KeyC' || (!event.shiftKey && !term.hasSelection())) return true

    void navigator.clipboard.writeText(term.getSelection())
    term.clearSelection()

    return false
  }
