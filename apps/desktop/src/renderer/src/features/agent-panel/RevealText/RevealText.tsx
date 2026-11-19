import { createElement } from 'react'
import { Reveal } from 'smooth-stream-text/react'

import { useRevealOn } from '../reveal.context'
import type { RevealTextProps } from './RevealText.types'

/**
 * Кусок текста ответа. Под включённой волной (RevealContext, её ставит AssistantMessage)
 * дописанные символы проступают из размытия одной волной на весь ответ; иначе - обычный
 * текст. Уже стоящее на экране не мигает: заново смонтированный кусок не анимируется.
 */
export const RevealText = ({ children, as, className }: RevealTextProps) => {
  const isOn = useRevealOn()

  // Без волны и без своей обёртки - просто строка: лишний span на каждый кусок незачем.
  if (!isOn)
    return as || className ? createElement(as ?? 'span', { className }, children) : children

  return (
    <Reveal as={as ?? 'span'} className={className}>
      {children}
    </Reveal>
  )
}
