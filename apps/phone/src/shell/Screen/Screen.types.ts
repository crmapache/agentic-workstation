import type { Ref, ReactNode } from 'react'

export type ScreenHelp = { title: string; text: string }

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
  /** Что это за экран и как он работает - за кнопкой «?», а не абзацем (ADR 0030). */
  help?: ScreenHelp | undefined
  /** Своя полоса экрана под полосой связи: разговор не идёт, хранилище не держит пары. */
  banner?: ReactNode | undefined
  /** Прибито к низу над полосой «домой»: решение, поле ввода, главные кнопки экрана. */
  footer?: ReactNode | undefined
  bodyRef?: Ref<HTMLDivElement> | undefined
  children: ReactNode
}
