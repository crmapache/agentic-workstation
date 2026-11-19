import type { PathLinkTone } from '../PathLink/PathLink.types'

export type LinkedTextProps = {
  /** Текст как пришёл: разметка не разбирается, переносы строк сохраняет вызывающий. */
  text: string
  /** Цвет путей: inherit - в цветной строке (ошибка), где мятная ссылка спорила бы с ней. */
  pathTone?: PathLinkTone | undefined
}
