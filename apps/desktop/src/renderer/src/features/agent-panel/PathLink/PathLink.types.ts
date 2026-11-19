import type { ReactNode } from 'react'

import type { OpenFileRequest } from '../../../state/open-file.context'

/**
 * Цвет ссылки: link - цвет ссылки (мятный, как у адресов в ответе), inherit - цвет
 * текста вокруг (строка ошибки, блок кода), ссылку тогда выдаёт подчёркивание.
 */
export type PathLinkTone = 'link' | 'inherit'

export type PathLinkProps = {
  /** Что открыть и где встать: путь как написан и место (строка, диапазон, find). */
  request: OpenFileRequest
  /**
   * Путь называет папку (слеш на конце, дот-имя): подсказка обещает показать папку, а
   * не открыть файл. Решает всё равно диск - что окажется папкой, то покажется папкой.
   */
  folder?: boolean | undefined
  tone?: PathLinkTone | undefined
  className?: string | undefined
  /** Видимый текст: путь, как его написали. */
  children: ReactNode
}

export type PathChoiceProps = {
  /** Как путь был написан - для подписи меню. */
  path: string
  /** Пути от корня проекта, ближние к корню первыми. */
  candidates: string[]
  onChoose: (relativePath: string) => void
}
