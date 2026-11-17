import type { Ref, ReactNode } from 'react'

export type ScreenProps = {
  title: string
  /** Строка под заголовком: чей экран, состояние. */
  subtitle?: ReactNode | undefined
  /** Кнопка «назад» слева; у первого экрана её нет. */
  back?: boolean | undefined
  /**
   * Чей это экран: его связь с IDE - полосой под шапкой (не отвечает, отпустила) на каждом
   * экране этой IDE, а не только в разговоре.
   */
  agentId?: string | undefined
  /**
   * Справа в шапке: настройки предмета экрана. Главные действия - не сюда, а в низ под палец:
   * до правого верхнего угла большим пальцем не дотянуться.
   */
  actions?: ReactNode | undefined
  /** Своя полоса экрана под полосой связи: разговор не идёт, хранилище не держит пары. */
  banner?: ReactNode | undefined
  /**
   * Поверх тела, на месте при прокрутке: плавающая кнопка над лентой («Quote» у выделенного).
   * Встаёт сама, абсолютно внутри видимой части тела.
   */
  overlay?: ReactNode | undefined
  /** Прибито к низу над полосой «домой»: решение, поле ввода, главные кнопки экрана. */
  footer?: ReactNode | undefined
  bodyRef?: Ref<HTMLDivElement> | undefined
  children: ReactNode
}
