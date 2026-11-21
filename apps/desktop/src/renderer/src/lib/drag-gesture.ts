/**
 * Клик, которым браузер закончит жест перетаскивания, - не выбор и не открытие того, что несли:
 * он перехватывается до React. Только он: отпустили мимо - клика не будет, и перехват не должен
 * съесть следующий.
 */
export const swallowEndingClick = () => {
  const swallow = (click: MouseEvent) => {
    click.stopPropagation()
    click.preventDefault()
  }

  window.addEventListener('click', swallow, { capture: true, once: true })
  window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }))
}
