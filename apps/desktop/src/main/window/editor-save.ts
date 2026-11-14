import { broadcast } from '../ipc/broadcast'
import { ideWindows } from './overlay-windows'

/**
 * Перед выходом из IDE окно должно дописать на диск то, что человек набрал за последнюю
 * секунду: автосохранение ждёт паузы в наборе, а ⌘Q паузы не ждёт. Главный процесс
 * просит окно сохранить всё (editor:command saveAll) и ждёт ответа editor:savedAll с
 * числом файлов, которые сохранить нельзя (конфликт, удалён, не записался), - но не
 * дольше предела: зависшее окно не должно держать выход. Окна нет - и ждать нечего.
 */
let answer: ((unsaved: number) => void) | null = null

/** Человек уже согласился потерять несохранённое: выход больше не спрашивает. */
let unsavedAllowed = false

export const saveEditorBeforeQuit = (timeoutMs: number): Promise<number> => {
  const windows = ideWindows()

  if (unsavedAllowed || windows.length === 0) return Promise.resolve(0)

  return new Promise((resolve) => {
    const timer = setTimeout(() => done(0), timeoutMs)

    function done(unsaved: number) {
      clearTimeout(timer)
      answer = null
      resolve(unsaved)
    }

    answer = done
    broadcast('editor:command', 'saveAll')
  })
}

/** Окно ответило: записано всё, кроме unsaved файлов. Ответ без вопроса ничего не делает. */
export const editorSaved = (unsaved: number): void => answer?.(unsaved)

/** Человек согласился выйти, не сохранив файлы с вопросом. */
export const allowUnsavedQuit = (): void => {
  unsavedAllowed = true
}
