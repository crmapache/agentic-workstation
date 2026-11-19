/**
 * Что делает Enter в поле: отправляет, и Cmd/Ctrl+Enter тоже - привыкший к нему не должен
 * встретить мёртвую клавишу. Перенос строки - Shift+Enter. Правило ломается молча -
 * держит тест.
 */
export const enterAction = (event: {
  shiftKey: boolean
  metaKey: boolean
  ctrlKey: boolean
}): 'send' | 'newline' => (event.shiftKey && !event.metaKey && !event.ctrlKey ? 'newline' : 'send')
