/**
 * Кнопка «скопировать» у команды установки. Команду почти всегда вставляют, а не набирают:
 * путь с пробелом в кавычках легко перепутать руками.
 *
 * Кнопка ссылается на элемент с текстом через data-copy-target. Скопировалось - на пару
 * секунд галочка и подпись «Copied» для экранного диктора. Буфер обмена недоступен (страница
 * не по https, старый браузер) - текст команды выделяется, и его копируют как обычно.
 */

const COPIED_FOR_MS = 2000

const selectText = (element: HTMLElement) => {
  const range = document.createRange()
  range.selectNodeContents(element)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

const setupButton = (button: HTMLButtonElement) => {
  const target = document.getElementById(button.dataset.copyTarget ?? '')
  if (!target) return

  const idleLabel = button.getAttribute('aria-label') ?? 'Copy command'
  let resetTimer: number | undefined

  button.addEventListener('click', () => {
    const text = target.textContent?.trim() ?? ''
    navigator.clipboard.writeText(text).then(
      () => {
        button.dataset.copied = 'true'
        button.setAttribute('aria-label', 'Copied')
        window.clearTimeout(resetTimer)
        resetTimer = window.setTimeout(() => {
          delete button.dataset.copied
          button.setAttribute('aria-label', idleLabel)
        }, COPIED_FOR_MS)
      },
      () => selectText(target),
    )
  })
}

export const setupCopyButtons = () => {
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy-target]')) {
    setupButton(button)
  }
}
