/** Виды зоны 5 (левая панель), переключаются иконками зоны 2. */
export type SideViewId = 'files' | 'changes'

/** Виды зоны 6 (середина окна), переключаются иконками полосы слева от неё. */
export type MainViewId = 'file' | 'scenarios' | 'statistics' | 'connectors'

/** GUI провайдеров LLM в зоне 7 (правая панель), переключаются иконками зоны 3. */
export type ProviderViewId = 'claude-code'

/** Область окна с видами: какой вид выбран и развёрнута ли она. Такова середина окна. */
export type ViewAreaState<ViewId extends string> = {
  activeViewId: ViewId
  isOpen: boolean
}

/** Боковая панель - область с видами, у которой ещё и своя ширина. */
export type PanelState<ViewId extends string> = ViewAreaState<ViewId> & {
  /** Ширина в пикселях, которую выбрал человек, - не уже PANEL_MIN_WIDTH. */
  width: number
}

export type PanelSide = 'side' | 'provider'

/**
 * Терминал внизу правой колонки, под GUI провайдера (ADR 0037): открыт ли и какую долю
 * высоты колонки занимает. Доля, а не пиксели: окно меняет высоту, а раздел остаётся там же.
 */
export type TerminalDockState = { isOpen: boolean; share: number }

/** Раскладка целиком: так она сохраняется и восстанавливается. */
export type Layout = {
  side: PanelState<SideViewId>
  main: ViewAreaState<MainViewId>
  provider: PanelState<ProviderViewId>
  terminal: TerminalDockState
}

/**
 * Раскладка на экране: сколько пикселей у каждой области при нынешнем месте в окне.
 * Сохранённые ширины - то, чего хочет человек; здесь - то, что влезло.
 */
export type Arrangement = Record<PanelSide, number> & {
  /** Сколько места остаётся середине - развёрнутой или нет. */
  main: number
  /** Видна ли середина: развёрнута и ей хватает места (MAIN_MIN_WIDTH). */
  isMainShown: boolean
}
