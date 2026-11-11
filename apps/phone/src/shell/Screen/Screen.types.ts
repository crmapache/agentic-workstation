import type { Ref, ReactNode } from 'react'

export type ScreenHelp = { title: string; text: string }

export type ScreenProps = {
  title: string
  /** Строка под заголовком: чей экран, состояние. */
  subtitle?: ReactNode | undefined
  /** Кнопка «назад» слева; у первого экрана её нет. */
  back?: boolean | undefined
  /** Справа в шапке: одно-два действия экрана. */
  actions?: ReactNode | undefined
  /** Что это за экран и как он работает - за кнопкой «?», а не абзацем (ADR 0030). */
  help?: ScreenHelp | undefined
  /** Полоса под шапкой: связи нет, IDE отпустила телефон. */
  banner?: ReactNode | undefined
  /** Прибито к низу над полосой «домой»: поле ввода, главная кнопка формы. */
  footer?: ReactNode | undefined
  bodyRef?: Ref<HTMLDivElement> | undefined
  children: ReactNode
}
