import type { ReactNode } from 'react'

import type { ScreenNoticeValue } from '../panel.types'

export type PanelScreenProps = {
  /** Имя экрана для скринридера: видимый заголовок - в шапке листа. */
  title: string
  /** Ряд справа над содержимым: «обновить». */
  actions?: ReactNode | undefined
  /** Итог последнего действия - плашкой над содержимым. */
  notice?: ScreenNoticeValue | undefined
  /** Кнопка в плашке итога: «отменить» у ожидания входа. */
  noticeAction?: ReactNode | undefined
  children: ReactNode
}
