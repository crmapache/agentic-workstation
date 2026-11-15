/** Видимая часть страницы: насколько сдвинута вниз и сколько её в высоту, CSS px. */
export type VisibleArea = { top: number; height: number }

/** Что из visualViewport нужно для видимой части. */
type ViewportLike = Pick<VisualViewport, 'offsetTop' | 'height' | 'scale'>

/**
 * Видимая часть по visualViewport. Увеличенная щипком страница тоже сжимает его, но окна при
 * увеличении рассматривают по частям, и подгонять их под кусок экрана незачем - тогда null,
 * окна стоят по всей странице.
 */
export const visibleAreaOf = (viewport: ViewportLike): VisibleArea | null =>
  viewport.scale > 1 ? null : { top: viewport.offsetTop, height: viewport.height }

/**
 * Видимая часть страницы - в переменные дизайн-системы, по которым встают всплывающие окна
 * (--offset-visible-top, --size-visible-height). Клавиатура iPhone страницу не сжимает, а
 * закрывает её низ (interactive-widget Safari не знает): окно по центру страницы уходило под
 * неё вместе с кнопкой под полем. Сжимается только visualViewport - за ним и следим.
 */
export const followVisibleViewport = (target: Window = window): (() => void) => {
  const viewport = target.visualViewport
  const style = target.document.documentElement.style

  if (!viewport) return () => {}

  const handleChange = () => {
    const area = visibleAreaOf(viewport)

    if (area) {
      style.setProperty('--offset-visible-top', `${area.top}px`)
      style.setProperty('--size-visible-height', `${area.height}px`)
    } else {
      style.removeProperty('--offset-visible-top')
      style.removeProperty('--size-visible-height')
    }
  }

  handleChange()
  viewport.addEventListener('resize', handleChange)
  viewport.addEventListener('scroll', handleChange)

  return () => {
    viewport.removeEventListener('resize', handleChange)
    viewport.removeEventListener('scroll', handleChange)
  }
}
